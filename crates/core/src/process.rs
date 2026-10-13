use crate::tap::{
    AudioObjectID, AudioObjectPropertyAddress, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, K_AUDIO_HARDWARE_PROPERTY_PROCESS_OBJECT_LIST,
    K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN, K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    K_AUDIO_OBJECT_SYSTEM_OBJECT, K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID,
    K_AUDIO_PROCESS_PROPERTY_IS_RUNNING_OUTPUT, K_AUDIO_PROCESS_PROPERTY_PID, NO_ERR,
};
use crate::device::{CFRelease, CFStringGetCString, CFStringRef, K_CF_STRING_ENCODING_UTF8};
use serde::{Deserialize, Serialize};
use std::ffi::c_void;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AudioProcess {
    pub object_id: u32,
    pub pid: i32,
    pub bundle_id: String,
    pub name: String,
    pub is_running_output: bool,
    pub is_regular_app: bool,
}

impl AudioProcess {
    pub fn new(
        object_id: u32,
        pid: i32,
        bundle_id: impl Into<String>,
        name: impl Into<String>,
        is_running_output: bool,
        is_regular_app: bool,
    ) -> Self {
        let bundle_raw = bundle_id.into();
        let name_raw = name.into();

        Self {
            object_id,
            pid,
            bundle_id: Self::normalize_bundle_id(bundle_raw.trim()),
            name: name_raw.trim().to_string(),
            is_running_output,
            is_regular_app,
        }
    }

    /// Strips trailing `.helper`, `.renderer`, etc. from bundle IDs so sub-processes
    /// fold cleanly into their primary application entry.
    pub fn normalize_bundle_id(bundle_id: &str) -> String {
        let mut parts: Vec<&str> = bundle_id.split('.').collect();
        while parts.len() > 2 {
            if let Some(last) = parts.last() {
                let lower = last.to_ascii_lowercase();
                if lower == "helper" || lower == "renderer" || lower == "gpu" {
                    parts.pop();
                    continue;
                }
            }
            break;
        }

        parts.join(".")
    }

    /// Enumerate all active audio processes from macOS CoreAudio.
    pub fn enumerate_system_processes() -> Vec<AudioProcess> {
        let mut processes = Vec::new();

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

        if status != NO_ERR || size == 0 {
            return processes;
        }

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

        if status != NO_ERR {
            return processes;
        }

        for proc_id in process_ids {
            // 1. Get PID
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

            // 2. Get Bundle ID
            let bundle_id = unsafe { Self::get_cf_property_string(proc_id, K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID) }
                .unwrap_or_default();

            // Skip helper audio component registrars
            if bundle_id == "com.apple.audio.AudioComponentRegistrar" {
                continue;
            }

            // 3. Get is_running_output
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

            let name = if !bundle_id.is_empty() {
                bundle_id.split('.').last().unwrap_or(&bundle_id).to_string()
            } else {
                format!("Process {}", pid)
            };

            let is_helper = Self::is_helper_like_name(&name);
            processes.push(AudioProcess::new(
                proc_id,
                pid,
                bundle_id,
                name,
                is_running_output,
                !is_helper,
            ));
        }

        processes
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

    /// Check if process name is a helper, renderer, or worker subprocess.
    pub fn is_helper_like_name(name: &str) -> bool {
        let lower = name.trim().to_ascii_lowercase();
        let keywords = ["helper", "renderer", "gpuprocess", "webcontent", "serviceworker"];
        let clean = lower.replace(' ', "");

        for kw in keywords {
            if clean.contains(kw) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_bundle_id() {
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.google.Chrome.helper"),
            "com.google.Chrome"
        );
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.discordapp.Discord.renderer"),
            "com.discordapp.Discord"
        );
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.spotify.client"),
            "com.spotify.client"
        );
    }

    #[test]
    fn test_helper_name_check() {
        assert!(AudioProcess::is_helper_like_name("Google Chrome Helper"));
        assert!(AudioProcess::is_helper_like_name("Discord Helper (Renderer)"));
        assert!(!AudioProcess::is_helper_like_name("Spotify"));
    }
}
