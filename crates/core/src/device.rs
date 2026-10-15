use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
pub use crate::platform::macos::{
    CFRelease, CFStringGetCString, CFStringRef, CFTypeRef, K_CF_STRING_ENCODING_UTF8,
};

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

    /// Enumerate all output audio devices currently connected to the host system.
    pub fn enumerate_system_devices() -> Vec<AudioDevice> {
        crate::platform::current::enumerate_system_devices()
    }

    /// Enumerate all input audio devices (microphones, webcams, interfaces) connected to the host system.
    pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
        crate::platform::current::enumerate_system_input_devices()
    }

    /// Get current master output volume (0.0 to 1.0).
    pub fn get_master_volume() -> f32 {
        crate::platform::current::get_master_volume()
    }

    /// Set master output volume (0.0 to 1.0).
    pub fn set_master_volume(volume: f32) -> Result<(), String> {
        crate::platform::current::set_master_volume(volume)
    }

    /// Get current master mute state.
    pub fn get_master_mute() -> bool {
        crate::platform::current::get_master_mute()
    }

    /// Set master output mute state.
    pub fn set_master_mute(muted: bool) -> Result<(), String> {
        crate::platform::current::set_master_mute(muted)
    }

    /// Get current input volume (0.0 to 1.0).
    pub fn get_input_volume() -> f32 {
        crate::platform::current::get_input_volume()
    }

    /// Set input volume (0.0 to 1.0).
    pub fn set_input_volume(volume: f32) -> Result<(), String> {
        crate::platform::current::set_input_volume(volume)
    }

    /// Get current input mute state.
    pub fn get_input_mute() -> bool {
        crate::platform::current::get_input_mute()
    }

    /// Set input mute state.
    pub fn set_input_mute(muted: bool) -> Result<(), String> {
        crate::platform::current::set_input_mute(muted)
    }

    /// Switch default system output device by UID.
    pub fn set_default_device(uid: &str) -> Result<(), String> {
        crate::platform::current::set_default_device(uid)
    }

    pub fn set_default_output_device_by_uid(uid: &str) -> Result<(), i32> {
        Self::set_default_device(uid).map_err(|_| -1)
    }

    /// Switch default system input device by UID.
    pub fn set_default_input_device(uid: &str) -> Result<(), String> {
        crate::platform::current::set_default_input_device(uid)
    }

    pub fn set_default_input_device_by_uid(uid: &str) -> Result<(), i32> {
        Self::set_default_input_device(uid).map_err(|_| -1)
    }
}
