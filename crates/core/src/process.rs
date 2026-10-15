use crate::tap::{
    AudioObjectID, AudioObjectPropertyAddress, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, K_AUDIO_HARDWARE_PROPERTY_PROCESS_OBJECT_LIST,
    K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN, K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    K_AUDIO_OBJECT_SYSTEM_OBJECT, K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID,
    K_AUDIO_PROCESS_PROPERTY_IS_RUNNING_OUTPUT, K_AUDIO_PROCESS_PROPERTY_PID, NO_ERR,
};
use crate::device::{CFRelease, CFStringGetCString, CFStringRef, K_CF_STRING_ENCODING_UTF8};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::c_void;

#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
#[link(name = "objc", kind = "dylib")]
unsafe extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
    static objc_msgSend: c_void;
}

#[cfg(target_os = "macos")]
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
            let msg_send_isize: MsgSendRetIsize = get_msg_send();
            let msg_send_i32: MsgSendRetI32 = get_msg_send();

            let sel_pid = sel_registerName(b"processIdentifier\0".as_ptr() as *const _);
            let pid = msg_send_i32(app, sel_pid);

            let sel_policy = sel_registerName(b"activationPolicy\0".as_ptr() as *const _);
            let policy = msg_send_isize(app, sel_policy);
            let is_regular = policy == 0; // NSApplicationActivationPolicyRegular == 0

            let sel_bundle = sel_registerName(b"bundleIdentifier\0".as_ptr() as *const _);
            let ns_bundle = msg_send(app, sel_bundle);
            let bundle_id = ns_string_to_string(ns_bundle).unwrap_or_default();

            let sel_name = sel_registerName(b"localizedName\0".as_ptr() as *const _);
            let ns_name = msg_send(app, sel_name);
            let name = ns_string_to_string(ns_name).unwrap_or_default();

            Some(AppInfo {
                pid,
                bundle_id,
                name,
                is_regular,
            })
        }
    }

    unsafe fn ns_string_to_string(ns_str: *mut c_void) -> Option<String> {
        if ns_str.is_null() {
            return None;
        }
        unsafe {
            let sel_utf8 = sel_registerName(b"UTF8String\0".as_ptr() as *const _);
            let msg_send: MsgSend = get_msg_send();
            let c_str = msg_send(ns_str, sel_utf8) as *const c_char;
            if c_str.is_null() {
                return None;
            }
            Some(CStr::from_ptr(c_str).to_string_lossy().into_owned())
        }
    }
}

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

    /// Enumerate all active audio processes from macOS CoreAudio merged with running regular apps.
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

                    // 4. Resolve AppKit info
                    #[cfg(target_os = "macos")]
                    let app_info = macos_app::get_app_for_pid(pid);
                    #[cfg(not(target_os = "macos"))]
                    let app_info: Option<macos_app::AppInfo> = None;

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
                        Self::normalize_bundle_id(&bundle_id)
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
                        || Self::is_helper_like_name(&entry.name)
                    {
                        entry.name = resolved_name;
                    }
                }
            }
        }

        // Pass 2: Merge running regular applications from NSWorkspace
        #[cfg(target_os = "macos")]
        {
            let running = macos_app::get_running_applications();
            for app in running {
                if !app.is_regular
                    || app.bundle_id.is_empty()
                    || app.bundle_id == "com.apple.audio.AudioComponentRegistrar"
                {
                    continue;
                }

                if Self::is_non_audio_utility(&app.bundle_id, &app.name) {
                    continue;
                }

                let norm_bundle = Self::normalize_bundle_id(&app.bundle_id);
                if let Some(existing) = process_map.get_mut(&norm_bundle) {
                    existing.is_regular_app = true;
                    if existing.name.is_empty()
                        || existing.name.starts_with("Process ")
                        || Self::is_helper_like_name(&existing.name)
                    {
                        existing.name = app.name;
                    }
                } else if Self::is_audio_capable_app(&app.bundle_id, &app.name) {
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
        }

        process_map.into_values().collect()
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

    pub fn is_non_audio_utility(bundle_id: &str, app_name: &str) -> bool {
        let b = bundle_id.to_ascii_lowercase();
        let n = app_name.to_ascii_lowercase();

        if b.starts_with("com.apple.textedit")
            || b.starts_with("com.apple.preview")
            || b.starts_with("com.apple.calculator")
            || b.starts_with("com.apple.notes")
            || b.starts_with("com.apple.reminders")
            || b.starts_with("com.apple.systempreferences")
            || b.starts_with("com.apple.preferences")
            || b.starts_with("com.apple.appstore")
            || b.starts_with("com.apple.dt.xcode")
            || b.starts_with("com.apple.photos")
            || b.starts_with("com.apple.clock")
            || b.starts_with("com.apple.maps")
            || b.starts_with("com.apple.weather")
            || b.starts_with("com.apple.stocks")
            || b.starts_with("com.apple.home")
            || b.starts_with("com.apple.fontbook")
            || b.starts_with("com.apple.keychainaccess")
            || b.starts_with("com.apple.diskutility")
            || b.starts_with("com.apple.console")
            || b.starts_with("com.apple.activitymonitor")
            || b.starts_with("com.apple.terminal")
            || b.starts_with("com.apple.finder")
            || b == "systemsoundserverd"
            || b == "com.apple.audio.audiocomponentregistrar"
        {
            return true;
        }

        if n == "textedit"
            || n == "preview"
            || n == "calculator"
            || n == "notes"
            || n == "reminders"
            || n == "xcode"
            || n == "terminal"
            || n == "activity monitor"
            || n == "finder"
            || n == "rust-sound"
        {
            return true;
        }

        false
    }

    pub fn is_audio_capable_app(bundle_id: &str, app_name: &str) -> bool {
        if Self::is_non_audio_utility(bundle_id, app_name) {
            return false;
        }

        let b = bundle_id.to_ascii_lowercase();
        let n = app_name.to_ascii_lowercase();

        b.contains("spotify")
            || b.contains("music")
            || b.contains("podcasts")
            || b.contains("quicktime")
            || b.contains("chrome")
            || b.contains("safari")
            || b.contains("brave")
            || b.contains("firefox")
            || b.contains("edge")
            || b.contains("arc")
            || b.contains("opera")
            || b.contains("discord")
            || b.contains("telegram")
            || b.contains("zalo")
            || b.contains("slack")
            || b.contains("teams")
            || b.contains("zoom")
            || b.contains("skype")
            || b.contains("whatsapp")
            || b.contains("vlc")
            || b.contains("iina")
            || b.contains("youtube")
            || b.contains("netflix")
            || b.contains("audacity")
            || b.contains("logic")
            || b.contains("ableton")
            || b.contains("reaper")
            || b.contains("flstudio")
            || b.contains("protools")
            || b.contains("garageband")
            || b.contains("sound")
            || b.contains("voice")
            || b.contains("media")
            || b.contains("player")
            || b.contains("audio")
            || n.contains("spotify")
            || n.contains("music")
            || n.contains("browser")
            || n.contains("chrome")
            || n.contains("safari")
            || n.contains("brave")
            || n.contains("telegram")
            || n.contains("zalo")
            || n.contains("discord")
            || n.contains("slack")
            || n.contains("teams")
            || n.contains("zoom")
            || n.contains("vlc")
            || n.contains("player")
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

    #[test]
    fn test_non_audio_utility_filter() {
        assert!(AudioProcess::is_non_audio_utility("com.apple.TextEdit", "TextEdit"));
        assert!(AudioProcess::is_non_audio_utility("com.apple.Calculator", "Calculator"));
        assert!(AudioProcess::is_non_audio_utility("com.apple.Notes", "Notes"));
        assert!(AudioProcess::is_non_audio_utility("com.apple.Preview", "Preview"));
        assert!(AudioProcess::is_non_audio_utility("com.apple.dt.Xcode", "Xcode"));
        assert!(!AudioProcess::is_non_audio_utility("com.spotify.client", "Spotify"));
        assert!(!AudioProcess::is_non_audio_utility("com.brave.Browser", "Brave Browser"));
        assert!(!AudioProcess::is_non_audio_utility("com.vng.zalo", "Zalo"));
        assert!(!AudioProcess::is_non_audio_utility("com.tdesktop.Telegram", "Telegram"));
    }

    #[test]
    fn test_audio_capable_app_classification() {
        assert!(AudioProcess::is_audio_capable_app("com.spotify.client", "Spotify"));
        assert!(AudioProcess::is_audio_capable_app("com.brave.Browser", "Brave Browser"));
        assert!(AudioProcess::is_audio_capable_app("com.vng.zalo", "Zalo"));
        assert!(AudioProcess::is_audio_capable_app("com.tdesktop.Telegram", "Telegram"));
        assert!(AudioProcess::is_audio_capable_app("com.discordapp.Discord", "Discord"));
        assert!(!AudioProcess::is_audio_capable_app("com.apple.TextEdit", "TextEdit"));
        assert!(!AudioProcess::is_audio_capable_app("com.apple.Calculator", "Calculator"));
    }
}
