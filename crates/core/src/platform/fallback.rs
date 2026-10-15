use crate::device::AudioDevice;
use crate::process::AudioProcess;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

static FALLBACK_MASTER_VOL: AtomicU32 = AtomicU32::new(100);
static FALLBACK_MASTER_MUTE: AtomicBool = AtomicBool::new(false);
static FALLBACK_INPUT_VOL: AtomicU32 = AtomicU32::new(85);
static FALLBACK_INPUT_MUTE: AtomicBool = AtomicBool::new(false);

pub fn enumerate_system_devices() -> Vec<AudioDevice> {
    vec![
        AudioDevice::new(1, "Default System Output", "default_output", true),
        AudioDevice::new(2, "Secondary Output", "secondary_output", false),
    ]
}

pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
    vec![
        AudioDevice::new(101, "Default Microphone", "default_mic", true),
    ]
}

pub fn get_master_volume() -> f32 {
    (FALLBACK_MASTER_VOL.load(Ordering::Relaxed) as f32) / 100.0
}

pub fn set_master_volume(volume: f32) -> Result<(), String> {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    FALLBACK_MASTER_VOL.store(vol_100, Ordering::Relaxed);
    Ok(())
}

pub fn get_master_mute() -> bool {
    FALLBACK_MASTER_MUTE.load(Ordering::Relaxed)
}

pub fn set_master_mute(muted: bool) -> Result<(), String> {
    FALLBACK_MASTER_MUTE.store(muted, Ordering::Relaxed);
    Ok(())
}

pub fn get_input_volume() -> f32 {
    (FALLBACK_INPUT_VOL.load(Ordering::Relaxed) as f32) / 100.0
}

pub fn set_input_volume(volume: f32) -> Result<(), String> {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    FALLBACK_INPUT_VOL.store(vol_100, Ordering::Relaxed);
    Ok(())
}

pub fn get_input_mute() -> bool {
    FALLBACK_INPUT_MUTE.load(Ordering::Relaxed)
}

pub fn set_input_mute(muted: bool) -> Result<(), String> {
    FALLBACK_INPUT_MUTE.store(muted, Ordering::Relaxed);
    Ok(())
}

pub fn set_default_device(_uid: &str) -> Result<(), String> {
    Ok(())
}

pub fn set_default_input_device(_uid: &str) -> Result<(), String> {
    Ok(())
}

pub fn enumerate_system_processes() -> Vec<AudioProcess> {
    vec![
        AudioProcess::new(1, 1001, "browser", "Web Browser", true, true),
        AudioProcess::new(2, 1002, "media_player", "Music Player", false, true),
    ]
}

pub fn set_app_volume(_bundle_or_pid: &str, _volume: f32) {}

pub fn set_app_mute(_bundle_or_pid: &str, _muted: bool) {}
