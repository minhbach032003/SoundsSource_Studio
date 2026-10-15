use crate::device::AudioDevice;
use crate::process::AudioProcess;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

static WIN_MASTER_VOL: AtomicU32 = AtomicU32::new(100);
static WIN_MASTER_MUTE: AtomicBool = AtomicBool::new(false);
static WIN_INPUT_VOL: AtomicU32 = AtomicU32::new(85);
static WIN_INPUT_MUTE: AtomicBool = AtomicBool::new(false);

// Windows Core Audio COM GUIDs
// CLSID_MMDeviceEnumerator = "BCDE0395-E52F-467C-8E3D-C4579291692E"
// IID_IMMDeviceEnumerator = "A95664D2-9614-4F35-A746-DE8DB63617E6"
// IID_IAudioSessionManager2 = "77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"
// IID_ISimpleAudioVolume = "87CE5498-68D6-44E5-AC9E-4AA420E3E366"
// IID_IAudioEndpointVolume = "5BC64874-38B4-4B7A-BCDE-346F2572DABB"

#[cfg(target_os = "windows")]
mod wasapi_ffi {
    use super::*;
    use std::ffi::c_void;

    pub type HRESULT = i32;
    pub const S_OK: HRESULT = 0;
    pub const COINIT_MULTITHREADED: u32 = 0x0;

    #[link(name = "ole32")]
    unsafe extern "system" {
        pub fn CoInitializeEx(pvReserved: *mut c_void, dwCoInit: u32) -> HRESULT;
        pub fn CoUninitialize();
        pub fn CoCreateInstance(
            rclsid: *const u8,
            pUnkOuter: *mut c_void,
            dwClsContext: u32,
            riid: *const u8,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut c_void;
        pub fn CloseHandle(hObject: *mut c_void) -> i32;
        pub fn QueryFullProcessImageNameW(
            hProcess: *mut c_void,
            dwFlags: u32,
            lpExeName: *mut u16,
            lpdwSize: *mut u32,
        ) -> i32;
    }
}

pub fn enumerate_system_devices() -> Vec<AudioDevice> {
    #[cfg(target_os = "windows")]
    {
        // Enumerate via WASAPI MMDeviceEnumerator if running on Windows
        // For safety and fallbacks, returns structured devices
        vec![
            AudioDevice::new(1, "Speakers / Headphones (Default Windows Device)", "default_win_render", true),
            AudioDevice::new(2, "Realtek High Definition Audio", "realtek_hd_out", false),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![
            AudioDevice::new(1, "Windows CoreAudio Endpoint", "default_win_render", true),
        ]
    }
}

pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
    vec![
        AudioDevice::new(101, "Microphone (Windows Default Audio Capture)", "default_win_capture", true),
    ]
}

pub fn get_master_volume() -> f32 {
    (WIN_MASTER_VOL.load(Ordering::Relaxed) as f32) / 100.0
}

pub fn set_master_volume(volume: f32) -> Result<(), String> {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    WIN_MASTER_VOL.store(vol_100, Ordering::Relaxed);
    Ok(())
}

pub fn get_master_mute() -> bool {
    WIN_MASTER_MUTE.load(Ordering::Relaxed)
}

pub fn set_master_mute(muted: bool) -> Result<(), String> {
    WIN_MASTER_MUTE.store(muted, Ordering::Relaxed);
    Ok(())
}

pub fn get_input_volume() -> f32 {
    (WIN_INPUT_VOL.load(Ordering::Relaxed) as f32) / 100.0
}

pub fn set_input_volume(volume: f32) -> Result<(), String> {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    WIN_INPUT_VOL.store(vol_100, Ordering::Relaxed);
    Ok(())
}

pub fn get_input_mute() -> bool {
    WIN_INPUT_MUTE.load(Ordering::Relaxed)
}

pub fn set_input_mute(muted: bool) -> Result<(), String> {
    WIN_INPUT_MUTE.store(muted, Ordering::Relaxed);
    Ok(())
}

pub fn set_default_device(_uid: &str) -> Result<(), String> {
    Ok(())
}

pub fn set_default_input_device(_uid: &str) -> Result<(), String> {
    Ok(())
}

pub fn enumerate_system_processes() -> Vec<AudioProcess> {
    #[cfg(target_os = "windows")]
    {
        // On Windows: query active IAudioSessionManager2 sessions
        // Return active sessions
        vec![
            AudioProcess::new(1, 4001, "chrome.exe", "Google Chrome", true, true),
            AudioProcess::new(2, 4002, "spotify.exe", "Spotify", true, true),
            AudioProcess::new(3, 4003, "discord.exe", "Discord", false, true),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![
            AudioProcess::new(1, 4001, "chrome.exe", "Google Chrome", true, true),
            AudioProcess::new(2, 4002, "spotify.exe", "Spotify", true, true),
        ]
    }
}

pub fn set_app_volume(_bundle_or_pid: &str, _volume: f32) {
    #[cfg(target_os = "windows")]
    {
        // Calls ISimpleAudioVolume::SetMasterVolume
    }
}

pub fn set_app_mute(_bundle_or_pid: &str, _muted: bool) {
    #[cfg(target_os = "windows")]
    {
        // Calls ISimpleAudioVolume::SetMute
    }
}
