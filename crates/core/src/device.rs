use crate::tap::{
    AudioDeviceID, AudioObjectID, AudioObjectPropertyAddress, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
    K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE, K_AUDIO_HARDWARE_PROPERTY_DEVICES,
    K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN, K_AUDIO_OBJECT_PROPERTY_NAME,
    K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL, K_AUDIO_OBJECT_SYSTEM_OBJECT, NO_ERR,
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
}
