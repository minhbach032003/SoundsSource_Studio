use crate::tap::{
    AudioDeviceID, AudioObjectID, AudioObjectPropertyAddress, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, AudioObjectSetPropertyData, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
    K_AUDIO_DEVICE_PROPERTY_MUTE, K_AUDIO_DEVICE_PROPERTY_STREAMS,
    K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR, K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
    K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE, K_AUDIO_HARDWARE_PROPERTY_DEVICES,
    K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN, K_AUDIO_OBJECT_PROPERTY_NAME,
    K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL, K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
    K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT, K_AUDIO_OBJECT_SYSTEM_OBJECT, NO_ERR,
};
use serde::{Deserialize, Serialize};
use std::ffi::c_void;

pub type CFTypeRef = *const c_void;
pub type CFStringRef = CFTypeRef;
pub const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    pub(crate) fn CFStringGetCString(
        the_string: CFStringRef,
        buffer: *mut u8,
        buffer_size: isize,
        encoding: u32,
    ) -> bool;
    pub(crate) fn CFRelease(cf: CFTypeRef);
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: u32,
    pub name: String,
    pub uid: String,
    pub is_default: bool,
}

impl AudioDevice {
    pub fn new(id: u32, name: impl Into<String>, uid: impl Into<String>, is_default: bool) -> Self {
        Self {
            id,
            name: name.into(),
            uid: uid.into(),
            is_default,
        }
    }

    /// Enumerate all output audio devices currently connected to macOS via CoreAudio.
    pub fn enumerate_system_devices() -> Vec<AudioDevice> {
        let mut devices = Vec::new();

        unsafe {
            // 1. Get Default Output Device ID
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

            // 2. Query all device IDs
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
                if !Self::has_output_streams(id) {
                    continue;
                }

                let name = Self::get_cf_property_string(id, K_AUDIO_OBJECT_PROPERTY_NAME)
                    .unwrap_or_else(|| format!("Audio Device {}", id));
                let uid = Self::get_cf_property_string(id, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID)
                    .unwrap_or_else(|| format!("UID_{}", id));

                let is_default = id == default_device_id;
                devices.push(AudioDevice::new(id, name, uid, is_default));
            }
        }

        devices
    }

    /// Enumerate all input audio devices (microphones, webcams, interfaces) connected via CoreAudio.
    pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
        let mut devices = Vec::new();

        unsafe {
            // 1. Get Default Input Device ID
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

            // 2. Query all device IDs
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
                if !Self::has_input_streams(id) {
                    continue;
                }

                let name = Self::get_cf_property_string(id, K_AUDIO_OBJECT_PROPERTY_NAME)
                    .unwrap_or_else(|| format!("Input Device {}", id));
                let uid = Self::get_cf_property_string(id, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID)
                    .unwrap_or_else(|| format!("UID_{}", id));

                let is_default = id == default_device_id;
                devices.push(AudioDevice::new(id, name, uid, is_default));
            }
        }

        devices
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
            let res = CFStringGetCString(
                cf_string,
                buffer.as_mut_ptr(),
                buffer.len() as isize,
                K_CF_STRING_ENCODING_UTF8,
            );
            CFRelease(cf_string);
            res
        };

        if success {
            let nul_pos = buffer.iter().position(|&b| b == 0).unwrap_or(buffer.len());
            String::from_utf8(buffer[..nul_pos].to_vec()).ok()
        } else {
            None
        }
    }

    pub fn get_default_output_device_id() -> Result<AudioDeviceID, i32> {
        let default_address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let mut default_device_id: AudioDeviceID = 0;
        let mut data_size = std::mem::size_of::<AudioDeviceID>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &default_address,
                0,
                std::ptr::null(),
                &mut data_size,
                &mut default_device_id as *mut _ as *mut c_void,
            )
        };
        if status == NO_ERR && default_device_id != 0 {
            Ok(default_device_id)
        } else {
            Err(status)
        }
    }

    pub fn get_default_input_device_id() -> Result<AudioDeviceID, i32> {
        let default_address = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let mut default_device_id: AudioDeviceID = 0;
        let mut data_size = std::mem::size_of::<AudioDeviceID>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &default_address,
                0,
                std::ptr::null(),
                &mut data_size,
                &mut default_device_id as *mut _ as *mut c_void,
            )
        };
        if status == NO_ERR && default_device_id != 0 {
            Ok(default_device_id)
        } else {
            Err(status)
        }
    }

    pub fn get_input_volume() -> f32 {
        if let Ok(dev_id) = Self::get_default_input_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut vol: f32 = 0.0;
            let mut size = std::mem::size_of::<f32>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    &mut vol as *mut _ as *mut c_void,
                )
            };
            if status == NO_ERR {
                return vol;
            }
        }

        if let Ok(out) = std::process::Command::new("osascript")
            .arg("-e")
            .arg("input volume of (get volume settings)")
            .output()
        {
            let str_val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(num) = str_val.parse::<f32>() {
                return num / 100.0;
            }
        }
        0.85
    }

    pub fn set_input_volume(volume: f32) -> Result<(), i32> {
        let clamped = volume.clamp(0.0, 1.0);
        let mut applied = false;

        if let Ok(dev_id) = Self::get_default_input_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let status = unsafe {
                AudioObjectSetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<f32>() as u32,
                    &clamped as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                applied = true;
            }
        }

        if !applied {
            let vol_100 = (clamped * 100.0).round() as u32;
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("set volume input volume {}", vol_100))
                .output();
        }
        Ok(())
    }

    pub fn get_input_mute() -> bool {
        if let Ok(dev_id) = Self::get_default_input_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut mute: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    &mut mute as *mut _ as *mut c_void,
                )
            };
            if status == NO_ERR {
                return mute != 0;
            }
        }

        // If hardware mute property unsupported, check if input volume is 0
        Self::get_input_volume() < 0.01
    }

    pub fn set_input_mute(muted: bool) -> Result<(), i32> {
        let mut applied = false;
        if let Ok(dev_id) = Self::get_default_input_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_INPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let m: u32 = if muted { 1 } else { 0 };
            let status = unsafe {
                AudioObjectSetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<u32>() as u32,
                    &m as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                applied = true;
            }
        }

        if !applied {
            let vol_100 = if muted { 0 } else { 50 };
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("set volume input volume {}", vol_100))
                .output();
        }
        Ok(())
    }

    pub fn set_default_input_device_by_uid(uid: &str) -> Result<(), i32> {
        let devices = Self::enumerate_system_input_devices();
        if let Some(target) = devices.iter().find(|d| d.uid == uid) {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let dev_id = target.id;
            let status = unsafe {
                AudioObjectSetPropertyData(
                    K_AUDIO_OBJECT_SYSTEM_OBJECT,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<AudioDeviceID>() as u32,
                    &dev_id as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                Ok(())
            } else {
                Err(status)
            }
        } else {
            Err(-1)
        }
    }

    pub fn get_master_volume() -> f32 {
        if let Ok(dev_id) = Self::get_default_output_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut vol: f32 = 0.0;
            let mut size = std::mem::size_of::<f32>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    &mut vol as *mut _ as *mut c_void,
                )
            };
            if status == NO_ERR {
                return vol;
            }
        }

        if let Ok(out) = std::process::Command::new("osascript")
            .arg("-e")
            .arg("output volume of (get volume settings)")
            .output()
        {
            let str_val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(num) = str_val.parse::<f32>() {
                return num / 100.0;
            }
        }
        1.0
    }

    pub fn set_master_volume(volume: f32) -> Result<(), i32> {
        let clamped = volume.clamp(0.0, 1.0);
        let mut applied = false;

        if let Ok(dev_id) = Self::get_default_output_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let status = unsafe {
                AudioObjectSetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<f32>() as u32,
                    &clamped as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                applied = true;
            }
        }

        if !applied {
            let vol_100 = (clamped * 100.0).round() as u32;
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("set volume output volume {}", vol_100))
                .output();
        }
        Ok(())
    }

    pub fn get_master_mute() -> bool {
        if let Ok(dev_id) = Self::get_default_output_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut mute: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    &mut mute as *mut _ as *mut c_void,
                )
            };
            if status == NO_ERR {
                return mute != 0;
            }
        }

        if let Ok(out) = std::process::Command::new("osascript")
            .arg("-e")
            .arg("output muted of (get volume settings)")
            .output()
        {
            let str_val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            return str_val == "true";
        }
        false
    }

    pub fn set_master_mute(muted: bool) -> Result<(), i32> {
        let mut applied = false;
        if let Ok(dev_id) = Self::get_default_output_device_id() {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_MUTE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let m: u32 = if muted { 1 } else { 0 };
            let status = unsafe {
                AudioObjectSetPropertyData(
                    dev_id,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<u32>() as u32,
                    &m as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                applied = true;
            }
        }

        if !applied {
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("set volume output muted {}", muted))
                .output();
        }
        Ok(())
    }

    pub fn set_default_output_device_by_uid(uid: &str) -> Result<(), i32> {
        let devices = Self::enumerate_system_devices();
        if let Some(target) = devices.iter().find(|d| d.uid == uid) {
            let address = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let dev_id = target.id;
            let status = unsafe {
                AudioObjectSetPropertyData(
                    K_AUDIO_OBJECT_SYSTEM_OBJECT,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<AudioDeviceID>() as u32,
                    &dev_id as *const _ as *const c_void,
                )
            };
            if status == NO_ERR {
                Ok(())
            } else {
                Err(status)
            }
        } else {
            Err(-1)
        }
    }
}
