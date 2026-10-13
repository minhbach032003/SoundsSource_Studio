//! CoreAudio Process Tap FFI definitions and wrappers for macOS 14.2+ (Sonoma+).

use std::ffi::c_void;

pub type AudioObjectID = u32;
pub type AudioDeviceID = AudioObjectID;
pub type OSStatus = i32;

pub const K_AUDIO_OBJECT_UNKNOWN: AudioObjectID = 0;
pub const NO_ERR: OSStatus = 0;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct AudioStreamBasicDescription {
    pub m_sample_rate: f64,
    pub m_format_id: u32,
    pub m_format_flags: u32,
    pub m_bytes_per_packet: u32,
    pub m_frames_per_packet: u32,
    pub m_bytes_per_frame: u32,
    pub m_channels_per_frame: u32,
    pub m_bits_per_channel: u32,
    pub m_reserved: u32,
}

impl Default for AudioStreamBasicDescription {
    fn default() -> Self {
        Self {
            m_sample_rate: 48000.0,
            m_format_id: 0x6c70636d, // 'lpcm'
            m_format_flags: 0x9,      // Float | NativeEndian
            m_bytes_per_packet: 8,
            m_frames_per_packet: 1,
            m_bytes_per_frame: 8,
            m_channels_per_frame: 2,
            m_bits_per_channel: 32,
            m_reserved: 0,
        }
    }
}

pub type AudioDeviceIOProc = Option<
    unsafe extern "C" fn(
        in_device: AudioDeviceID,
        in_now: *const c_void,
        in_input_data: *const c_void,
        in_input_time: *const c_void,
        out_output_data: *mut c_void,
        in_output_time: *const c_void,
        in_client_data: *mut c_void,
    ) -> OSStatus,
>;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct AudioObjectPropertyAddress {
    pub m_selector: u32,
    pub m_scope: u32,
    pub m_element: u32,
}

pub const K_AUDIO_OBJECT_SYSTEM_OBJECT: AudioObjectID = 1;
pub const K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: u32 = 0x676c6f62; // 'glob'
pub const K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN: u32 = 0;

pub const K_AUDIO_HARDWARE_PROPERTY_DEVICES: u32 = 0x64657623; // 'dev#'
pub const K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE: u32 = 0x6465666f; // 'defo'
pub const K_AUDIO_OBJECT_PROPERTY_NAME: u32 = 0x6f6e616d; // 'onam'
pub const K_AUDIO_DEVICE_PROPERTY_DEVICE_UID: u32 = 0x75696420; // 'uid '
pub const K_AUDIO_HARDWARE_PROPERTY_PROCESS_OBJECT_LIST: u32 = 0x70727323; // 'prs#'
pub const K_AUDIO_PROCESS_PROPERTY_PID: u32 = 0x70706964; // 'ppid'
pub const K_AUDIO_PROCESS_PROPERTY_BUNDLE_ID: u32 = 0x70626964; // 'pbid'
pub const K_AUDIO_PROCESS_PROPERTY_IS_RUNNING_OUTPUT: u32 = 0x7069726f; // 'piro'

#[link(name = "CoreAudio", kind = "framework")]
unsafe extern "C" {
    pub fn AudioObjectGetPropertyDataSize(
        in_object_id: AudioObjectID,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const c_void,
        out_data_size: *mut u32,
    ) -> OSStatus;

    pub fn AudioObjectGetPropertyData(
        in_object_id: AudioObjectID,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const c_void,
        io_data_size: *mut u32,
        out_data: *mut c_void,
    ) -> OSStatus;

    pub fn AudioHardwareCreateProcessTap(
        tap_description: *const c_void,
        out_tap_id: *mut AudioObjectID,
    ) -> OSStatus;

    pub fn AudioHardwareDestroyProcessTap(tap_id: AudioObjectID) -> OSStatus;
}

/// Represents an active CoreAudio Process Tap instance.
pub struct ProcessTap {
    pub tap_id: AudioObjectID,
    pub target_bundle_id: String,
    pub format: AudioStreamBasicDescription,
}

impl ProcessTap {
    pub fn new(tap_id: AudioObjectID, bundle_id: String, format: AudioStreamBasicDescription) -> Self {
        Self {
            tap_id,
            target_bundle_id: bundle_id,
            format,
        }
    }
}

impl Drop for ProcessTap {
    fn drop(&mut self) {
        if self.tap_id != K_AUDIO_OBJECT_UNKNOWN {
            unsafe {
                let _ = AudioHardwareDestroyProcessTap(self.tap_id);
            }
        }
    }
}
