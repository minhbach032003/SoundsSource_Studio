use crate::device::AudioDevice;
use crate::process::AudioProcess;
use crate::tap::{
    AudioDeviceID, AudioObjectID, AudioObjectPropertyAddress, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, AudioObjectSetPropertyData, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
    K_AUDIO_DEVICE_PROPERTY_MUTE, K_AUDIO_DEVICE_PROPERTY_STREAMS,
    K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR, K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
    K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE, K_AUDIO_HARDWARE_PROPERTY_DEVICES,
    K_AUDIO_HARDWARE_PROPERTY_PROCESS_OBJECT_LIST, K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    K_AUDIO_OBJECT_PROPERTY_NAME, K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT, K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
    K_AUDIO_OBJECT_SYSTEM_OBJECT, K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID,
    K_AUDIO_PROCESS_PROPERTY_IS_RUNNING_OUTPUT, K_AUDIO_PROCESS_PROPERTY_PID, NO_ERR,
};
use std::collections::HashMap;
use std::ffi::c_void;

pub type CFTypeRef = *const c_void;
pub type CFStringRef = CFTypeRef;
pub const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    pub fn CFStringGetCString(
        the_string: CFStringRef,
        buffer: *mut u8,
        buffer_size: isize,
        encoding: u32,
    ) -> bool;
    pub fn CFRelease(cf: CFTypeRef);
}

#[link(name = "AppKit", kind = "framework")]
#[link(name = "objc", kind = "dylib")]
unsafe extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
    static objc_msgSend: c_void;
}

mod macos_app {
    use super::*;
    use std::ffi::{c_char, CStr};

    type MsgSend = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void;
    type MsgSendI32 = unsafe extern "C" fn(*mut c_void, *mut c_void, i32) -> *mut c_void;
    type MsgSendUsize = unsafe extern "C" fn(*mut c_void, *mut c_void, usize) -> *mut c_void;
    type MsgSendRetIsize = unsafe extern "C" fn(*mut c_void, *mut c_void) -> isize;
    type MsgSendRetUsize = unsafe extern "C" fn(*mut c_void, *mut c_void) -> usize;
    type MsgSendRetI32 = unsafe extern "C" fn(*mut c_void, *mut c_void) -> i32;

    unsafe fn get_msg_send<T>() -> T {
        unsafe { std::mem::transmute_copy(&(&raw const objc_msgSend)) }
    }

    #[derive(Debug, Clone)]
    pub struct AppInfo {
        pub pid: i32,
        pub bundle_id: String,
        pub name: String,
        pub is_regular: bool,
    }

    pub fn get_app_for_pid(pid: i32) -> Option<AppInfo> {
        unsafe {
            let cls = objc_getClass(b"NSRunningApplication\0".as_ptr() as *const _);
            if cls.is_null() {
                return None;
            }
            let sel_for_pid =
                sel_registerName(b"runningApplicationWithProcessIdentifier:\0".as_ptr() as *const _);
            let msg_send_i32: MsgSendI32 = get_msg_send();
            let app = msg_send_i32(cls, sel_for_pid, pid);
            if app.is_null() {
                return None;
            }
            extract_app_info(app)
        }
    }

    pub fn get_running_applications() -> Vec<AppInfo> {
        let mut result = Vec::new();
        unsafe {
            let ws_cls = objc_getClass(b"NSWorkspace\0".as_ptr() as *const _);
            if ws_cls.is_null() {
                return result;
            }
            let sel_shared = sel_registerName(b"sharedWorkspace\0".as_ptr() as *const _);
            let msg_send: MsgSend = get_msg_send();
            let ws = msg_send(ws_cls, sel_shared);
            if ws.is_null() {
                return result;
            }

            let sel_running = sel_registerName(b"runningApplications\0".as_ptr() as *const _);
            let app_list = msg_send(ws, sel_running);
            if app_list.is_null() {
                return result;
            }

            let sel_count = sel_registerName(b"count\0".as_ptr() as *const _);
            let msg_send_ret_usize: MsgSendRetUsize = get_msg_send();
            let count = msg_send_ret_usize(app_list, sel_count);

            let sel_object_at = sel_registerName(b"objectAtIndex:\0".as_ptr() as *const _);
            let msg_send_usize: MsgSendUsize = get_msg_send();

            for i in 0..count {
                let app = msg_send_usize(app_list, sel_object_at, i);
                if !app.is_null() {
                    if let Some(info) = extract_app_info(app) {
                        result.push(info);
                    }
                }
            }
        }
        result
    }

    unsafe fn extract_app_info(app: *mut c_void) -> Option<AppInfo> {
        unsafe {
            let msg_send: MsgSend = get_msg_send();
            let msg_send_ret_i32: MsgSendRetI32 = get_msg_send();
            let msg_send_ret_isize: MsgSendRetIsize = get_msg_send();

            let sel_pid = sel_registerName(b"processIdentifier\0".as_ptr() as *const _);
            let pid = msg_send_ret_i32(app, sel_pid);

            let sel_bundle = sel_registerName(b"bundleIdentifier\0".as_ptr() as *const _);
            let bundle_cf = msg_send(app, sel_bundle);
            let bundle_id = cf_to_string(bundle_cf).unwrap_or_default();

            let sel_name = sel_registerName(b"localizedName\0".as_ptr() as *const _);
            let name_cf = msg_send(app, sel_name);
            let name = cf_to_string(name_cf).unwrap_or_default();

            let sel_policy = sel_registerName(b"activationPolicy\0".as_ptr() as *const _);
            let policy = msg_send_ret_isize(app, sel_policy);
            let is_regular = policy == 0; // NSApplicationActivationPolicyRegular

            Some(AppInfo {
                pid,
                bundle_id,
                name,
                is_regular,
            })
        }
    }

    unsafe fn cf_to_string(cf: *mut c_void) -> Option<String> {
        if cf.is_null() {
            return None;
        }
        unsafe {
            let sel_utf8 = sel_registerName(b"UTF8String\0".as_ptr() as *const _);
            let msg_send_cstr: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *const c_char =
                get_msg_send();
            let cstr_ptr = msg_send_cstr(cf, sel_utf8);
            if cstr_ptr.is_null() {
                return None;
            }
            Some(CStr::from_ptr(cstr_ptr).to_string_lossy().into_owned())
        }
    }
}

pub fn enumerate_system_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    unsafe {
        let default_address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let mut default_device_id: AudioDeviceID = 0;
        let mut data_size = std::mem::size_of::<AudioDeviceID>() as u32;
        let _ = AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &default_address,
            0,
            std::ptr::null(),
            &mut data_size,
            &mut default_device_id as *mut _ as *mut c_void,
        );

        let address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEVICES,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut size: u32 = 0;
        if AudioObjectGetPropertyDataSize(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
        ) != NO_ERR
        {
            return devices;
        }

        let count = (size as usize) / std::mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        if AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut c_void,
        ) != NO_ERR
        {
            return devices;
        }

        for id in device_ids {
            if !has_output_streams(id) {
                continue;
            }

            let name = get_cf_property_string(id, K_AUDIO_OBJECT_PROPERTY_NAME)
                .unwrap_or_else(|| format!("Audio Device {}", id));
            let uid = get_cf_property_string(id, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID)
                .unwrap_or_else(|| format!("UID_{}", id));

            let is_default = id == default_device_id;
            devices.push(AudioDevice::new(id, name, uid, is_default));
        }
    }

    devices
}

pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    unsafe {
        let default_address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let mut default_device_id: AudioDeviceID = 0;
        let mut data_size = std::mem::size_of::<AudioDeviceID>() as u32;
        let _ = AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &default_address,
            0,
            std::ptr::null(),
            &mut data_size,
            &mut default_device_id as *mut _ as *mut c_void,
        );

        let address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEVICES,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut size: u32 = 0;
        if AudioObjectGetPropertyDataSize(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
        ) != NO_ERR
        {
            return devices;
        }

        let count = (size as usize) / std::mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        if AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut c_void,
        ) != NO_ERR
        {
            return devices;
        }

        for id in device_ids {
            if !has_input_streams(id) {
                continue;
            }

            let name = get_cf_property_string(id, K_AUDIO_OBJECT_PROPERTY_NAME)
                .unwrap_or_else(|| format!("Input Device {}", id));
            let uid = get_cf_property_string(id, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID)
                .unwrap_or_else(|| format!("UID_{}", id));

            let is_default = id == default_device_id;
            devices.push(AudioDevice::new(id, name, uid, is_default));
        }
    }

    devices
}

pub fn get_master_volume() -> f32 {
    let dev_id = get_default_output_device_id();
    if dev_id == 0 {
        return 1.0;
    }

    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut volume: f32 = 1.0;
    let mut size = std::mem::size_of::<f32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut volume as *mut _ as *mut c_void,
        )
    };

    if status == NO_ERR {
        volume.clamp(0.0, 1.0)
    } else {
        1.0
    }
}

pub fn set_master_volume(volume: f32) -> Result<(), String> {
    let dev_id = get_default_output_device_id();
    if dev_id == 0 {
        return Err("No default output device found".to_string());
    }

    let volume = volume.clamp(0.0, 1.0);
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let size = std::mem::size_of::<f32>() as u32;
    let status = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            size,
            &volume as *const _ as *const c_void,
        )
    };

    if status == NO_ERR {
        Ok(())
    } else {
        // Fallback: try setting channels 1 and 2 directly (required on some multi-channel devices)
        let addr_l = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
            m_element: 1,
        };
        let _ = unsafe {
            AudioObjectSetPropertyData(
                dev_id,
                &addr_l,
                0,
                std::ptr::null(),
                size,
                &volume as *const _ as *const c_void,
            )
        };
        // Digital audio devices (HDMI/DisplayPort) may not implement software volume scalars.
        // Return Ok so playback pipelines do not crash on fixed-volume interfaces.
        Ok(())
    }
}

pub fn get_master_mute() -> bool {
    let dev_id = get_default_output_device_id();
    if dev_id == 0 {
        return false;
    }

    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut muted: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut muted as *mut _ as *mut c_void,
        )
    };

    status == NO_ERR && muted != 0
}

pub fn set_master_mute(muted: bool) -> Result<(), String> {
    let dev_id = get_default_output_device_id();
    if dev_id == 0 {
        return Err("No default output device found".to_string());
    }

    let val: u32 = if muted { 1 } else { 0 };
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            size,
            &val as *const _ as *const c_void,
        )
    };

    if status == NO_ERR {
        Ok(())
    } else {
        Err(format!("CoreAudio set master mute failed: status {status}"))
    }
}

static CACHED_MACOS_BALANCE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(50);

pub fn get_master_balance() -> f32 {
    let dev_id = get_default_output_device_id();
    if dev_id == 0 {
        let raw = CACHED_MACOS_BALANCE.load(std::sync::atomic::Ordering::Relaxed);
        return (raw as f32 - 50.0) / 50.0;
    }

    let mut vol_l: f32 = 1.0;
    let mut vol_r: f32 = 1.0;
    let mut size = std::mem::size_of::<f32>() as u32;

    let addr_l = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: 1, // Channel 1 (Left)
    };
    let status_l = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &addr_l,
            0,
            std::ptr::null(),
            &mut size,
            &mut vol_l as *mut _ as *mut c_void,
        )
    };

    let addr_r = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: 2, // Channel 2 (Right)
    };
    let status_r = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &addr_r,
            0,
            std::ptr::null(),
            &mut size,
            &mut vol_r as *mut _ as *mut c_void,
        )
    };

    if status_l == NO_ERR && status_r == NO_ERR {
        if vol_l > vol_r && vol_l > 1e-4 {
            let bal = (vol_r / vol_l) - 1.0;
            return bal.clamp(-1.0, 1.0);
        } else if vol_r > vol_l && vol_r > 1e-4 {
            let bal = 1.0 - (vol_l / vol_r);
            return bal.clamp(-1.0, 1.0);
        } else {
            return 0.0;
        }
    }

    let raw = CACHED_MACOS_BALANCE.load(std::sync::atomic::Ordering::Relaxed);
    (raw as f32 - 50.0) / 50.0
}

pub fn set_master_balance(balance: f32) -> Result<(), String> {
    let dev_id = get_default_output_device_id();
    let balance = balance.clamp(-1.0, 1.0);
    let mapped = ((balance + 1.0) * 50.0).round() as u32;
    CACHED_MACOS_BALANCE.store(mapped, std::sync::atomic::Ordering::Relaxed);

    if dev_id == 0 {
        return Ok(());
    }

    let master_vol = get_master_volume();
    let left_gain = if balance > 0.0 { master_vol * (1.0 - balance) } else { master_vol };
    let right_gain = if balance < 0.0 { master_vol * (1.0 + balance) } else { master_vol };

    let size = std::mem::size_of::<f32>() as u32;

    // Apply to Left channel (1)
    let addr_l = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: 1,
    };
    let _ = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &addr_l,
            0,
            std::ptr::null(),
            size,
            &left_gain as *const _ as *const c_void,
        )
    };

    // Apply to Right channel (2)
    let addr_r = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: 2,
    };
    let _ = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &addr_r,
            0,
            std::ptr::null(),
            size,
            &right_gain as *const _ as *const c_void,
        )
    };

    Ok(())
}

pub fn get_input_volume() -> f32 {
    let dev_id = get_default_input_device_id();
    if dev_id == 0 {
        return 1.0;
    }

    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut volume: f32 = 1.0;
    let mut size = std::mem::size_of::<f32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut volume as *mut _ as *mut c_void,
        )
    };

    if status == NO_ERR {
        volume.clamp(0.0, 1.0)
    } else {
        0.85
    }
}

pub fn set_input_volume(volume: f32) -> Result<(), String> {
    let dev_id = get_default_input_device_id();
    if dev_id == 0 {
        return Err("No default input device found".to_string());
    }

    let volume = volume.clamp(0.0, 1.0);
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let size = std::mem::size_of::<f32>() as u32;
    let status = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            size,
            &volume as *const _ as *const c_void,
        )
    };

    if status == NO_ERR {
        Ok(())
    } else {
        Err(format!("CoreAudio set input volume failed: status {status}"))
    }
}

pub fn get_input_mute() -> bool {
    let dev_id = get_default_input_device_id();
    if dev_id == 0 {
        return false;
    }

    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut muted: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut muted as *mut _ as *mut c_void,
        )
    };

    status == NO_ERR && muted != 0
}

pub fn set_input_mute(muted: bool) -> Result<(), String> {
    let dev_id = get_default_input_device_id();
    if dev_id == 0 {
        return Err("No default input device found".to_string());
    }

    let val: u32 = if muted { 1 } else { 0 };
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectSetPropertyData(
            dev_id,
            &address,
            0,
            std::ptr::null(),
            size,
            &val as *const _ as *const c_void,
        )
    };

    if status == NO_ERR {
        Ok(())
    } else {
        Err(format!("CoreAudio set input mute failed: status {status}"))
    }
}

pub fn set_default_device(uid: &str) -> Result<(), String> {
    let devices = enumerate_system_devices();
    let target = devices.into_iter().find(|d| d.uid == uid);

    if let Some(dev) = target {
        let address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut dev_id = dev.id;
        let size = std::mem::size_of::<AudioDeviceID>() as u32;
        let status = unsafe {
            AudioObjectSetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &address,
                0,
                std::ptr::null(),
                size,
                &mut dev_id as *mut _ as *const c_void,
            )
        };

        if status == NO_ERR {
            Ok(())
        } else {
            Err(format!("Failed to switch output device: status {status}"))
        }
    } else {
        Err(format!("Output device not found with UID: {uid}"))
    }
}

pub fn set_default_input_device(uid: &str) -> Result<(), String> {
    let devices = enumerate_system_input_devices();
    let target = devices.into_iter().find(|d| d.uid == uid);

    if let Some(dev) = target {
        let address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut dev_id = dev.id;
        let size = std::mem::size_of::<AudioDeviceID>() as u32;
        let status = unsafe {
            AudioObjectSetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &address,
                0,
                std::ptr::null(),
                size,
                &mut dev_id as *mut _ as *const c_void,
            )
        };

        if status == NO_ERR {
            Ok(())
        } else {
            Err(format!("Failed to switch input device: status {status}"))
        }
    } else {
        Err(format!("Input device not found with UID: {uid}"))
    }
}

pub fn enumerate_system_processes() -> Vec<AudioProcess> {
    let mut process_map: HashMap<String, AudioProcess> = HashMap::new();

    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_HARDWARE_PROPERTY_PROCESS_OBJECT_LIST,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
        )
    };

    if status == NO_ERR && size > 0 {
        let count = (size as usize) / std::mem::size_of::<AudioObjectID>();
        let mut process_ids = vec![0 as AudioObjectID; count];

        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                process_ids.as_mut_ptr() as *mut c_void,
            )
        };

        if status == NO_ERR {
            for proc_id in process_ids {
                let pid_address = AudioObjectPropertyAddress {
                    m_selector: K_AUDIO_PROCESS_PROPERTY_PID,
                    m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                    m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
                };
                let mut pid: i32 = 0;
                let mut pid_size = std::mem::size_of::<i32>() as u32;
                let status = unsafe {
                    AudioObjectGetPropertyData(
                        proc_id,
                        &pid_address,
                        0,
                        std::ptr::null(),
                        &mut pid_size,
                        &mut pid as *mut _ as *mut c_void,
                    )
                };
                if status != NO_ERR {
                    continue;
                }

                let bundle_id = unsafe { get_cf_property_string(proc_id, K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID) }
                    .unwrap_or_default();

                if bundle_id == "com.apple.audio.AudioComponentRegistrar" {
                    continue;
                }

                let output_address = AudioObjectPropertyAddress {
                    m_selector: K_AUDIO_PROCESS_PROPERTY_IS_RUNNING_OUTPUT,
                    m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                    m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
                };
                let mut is_running: u32 = 0;
                let mut output_size = std::mem::size_of::<u32>() as u32;
                let status = unsafe {
                    AudioObjectGetPropertyData(
                        proc_id,
                        &output_address,
                        0,
                        std::ptr::null(),
                        &mut output_size,
                        &mut is_running as *mut _ as *mut c_void,
                    )
                };
                let is_running_output = status == NO_ERR && is_running != 0;

                let app_info = macos_app::get_app_for_pid(pid);
                let (resolved_name, is_regular_app) = if let Some(info) = app_info {
                    let name = if !info.name.is_empty() {
                        info.name
                    } else if !bundle_id.is_empty() {
                        bundle_id.split('.').last().unwrap_or(&bundle_id).to_string()
                    } else {
                        format!("Process {}", pid)
                    };
                    (name, info.is_regular)
                } else {
                    let name = if !bundle_id.is_empty() {
                        bundle_id.split('.').last().unwrap_or(&bundle_id).to_string()
                    } else {
                        format!("Process {}", pid)
                    };
                    (name, false)
                };

                let key = if !bundle_id.is_empty() {
                    AudioProcess::normalize_bundle_id(&bundle_id)
                } else {
                    format!("pid:{}", pid)
                };

                let entry = process_map.entry(key).or_insert_with(|| {
                    AudioProcess::new(
                        proc_id,
                        pid,
                        bundle_id.clone(),
                        resolved_name.clone(),
                        is_running_output,
                        is_regular_app,
                    )
                });

                entry.is_running_output |= is_running_output;
                entry.is_regular_app |= is_regular_app;

                if entry.name.is_empty()
                    || entry.name.starts_with("Process ")
                    || AudioProcess::is_helper_like_name(&entry.name)
                {
                    entry.name = resolved_name;
                }
            }
        }
    }

    // Pass 2: Merge running regular applications from NSWorkspace
    let running = macos_app::get_running_applications();
    for app in running {
        if !app.is_regular
            || app.bundle_id.is_empty()
            || app.bundle_id == "com.apple.audio.AudioComponentRegistrar"
        {
            continue;
        }

        if AudioProcess::is_non_audio_utility(&app.bundle_id, &app.name) {
            continue;
        }

        let norm_bundle = AudioProcess::normalize_bundle_id(&app.bundle_id);
        if let Some(existing) = process_map.get_mut(&norm_bundle) {
            existing.is_regular_app = true;
            if existing.name.is_empty()
                || existing.name.starts_with("Process ")
                || AudioProcess::is_helper_like_name(&existing.name)
            {
                existing.name = app.name;
            }
        } else if AudioProcess::is_audio_capable_app(&app.bundle_id, &app.name) {
            process_map.insert(
                norm_bundle,
                AudioProcess::new(
                    0,
                    app.pid,
                    app.bundle_id,
                    app.name,
                    false,
                    true,
                ),
            );
        }
    }

    process_map.into_values().collect()
}

pub fn set_app_volume(bundle_or_pid: &str, volume: f32) {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    let target = bundle_or_pid.to_string();
    std::thread::spawn(move || {
        if target == "com.spotify.client" {
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"Spotify\" to set sound volume to {vol_100}"))
                .output();
        } else if target == "com.apple.Music" {
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"Music\" to set sound volume to {vol_100}"))
                .output();
        } else if target == "com.apple.QuickTimePlayerX" {
            let frac = (vol_100 as f32) / 100.0;
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"QuickTime Player\" to set audio volume of front document to {frac}"))
                .output();
        }
    });
}

pub fn set_app_mute(bundle_or_pid: &str, muted: bool) {
    let vol = if muted { 0.0 } else { 1.0 };
    set_app_volume(bundle_or_pid, vol);
}

unsafe fn has_input_streams(id: AudioDeviceID) -> bool {
    let stream_address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_STREAMS,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let mut stream_size = 0u32;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            id,
            &stream_address,
            0,
            std::ptr::null(),
            &mut stream_size,
        )
    };
    status == NO_ERR && stream_size > 0
}

unsafe fn has_output_streams(id: AudioDeviceID) -> bool {
    let stream_address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_STREAMS,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let mut stream_size = 0u32;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            id,
            &stream_address,
            0,
            std::ptr::null(),
            &mut stream_size,
        )
    };
    status == NO_ERR && stream_size > 0
}

unsafe fn get_cf_property_string(id: AudioObjectID, selector: u32) -> Option<String> {
    let address = AudioObjectPropertyAddress {
        m_selector: selector,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut cf_string: CFStringRef = std::ptr::null();
    let mut size = std::mem::size_of::<CFStringRef>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            id,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut cf_string as *mut _ as *mut c_void,
        )
    };

    if status != NO_ERR || cf_string.is_null() {
        return None;
    }

    let mut buffer = [0u8; 256];
    let success = unsafe {
        CFStringGetCString(
            cf_string,
            buffer.as_mut_ptr(),
            buffer.len() as isize,
            K_CF_STRING_ENCODING_UTF8,
        )
    };

    unsafe {
        CFRelease(cf_string);
    }

    if success {
        let c_str = unsafe { std::ffi::CStr::from_ptr(buffer.as_ptr() as *const _) };
        Some(c_str.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn get_default_output_device_id() -> AudioDeviceID {
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut dev_id: AudioDeviceID = 0;
    let mut size = std::mem::size_of::<AudioDeviceID>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut dev_id as *mut _ as *mut c_void,
        )
    };

    if status == NO_ERR {
        dev_id
    } else {
        0
    }
}

fn get_default_input_device_id() -> AudioDeviceID {
    let address = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };

    let mut dev_id: AudioDeviceID = 0;
    let mut size = std::mem::size_of::<AudioDeviceID>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut dev_id as *mut _ as *mut c_void,
        )
    };

    if status == NO_ERR {
        dev_id
    } else {
        0
    }
}
