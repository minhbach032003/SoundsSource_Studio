use std::collections::HashMap;
use tauri::State;
use crate::{app_tap, AppState};
use sound_core::{AudioDevice, AudioProcess};
use sound_engine::{
    AudioFilterSettings, ChannelStateDto, EQBandConfig, FilterProcessingStats, Preset,
};

#[tauri::command]
pub fn get_audio_processes() -> Vec<AudioProcess> {
    AudioProcess::enumerate_system_processes()
}

#[tauri::command]
pub fn get_audio_devices() -> Vec<AudioDevice> {
    AudioDevice::enumerate_system_devices()
}

#[tauri::command]
pub fn get_presets(state: State<'_, AppState>) -> Vec<Preset> {
    let store = state.preset_store.lock().unwrap();
    store.presets().to_vec()
}

#[tauri::command]
pub fn get_channel_states(state: State<'_, AppState>) -> HashMap<String, ChannelStateDto> {
    let router = state.router.lock().unwrap();
    router.get_channel_states()
}

pub static CACHED_ALERT_VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(70);

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SystemVolumeSettings {
    pub output_volume: f32,
    pub output_muted: bool,
    pub input_volume: f32,
    pub input_muted: bool,
    pub alert_volume: f32,
}

#[tauri::command]
pub fn get_system_volume_settings() -> SystemVolumeSettings {
    let out_vol = AudioDevice::get_master_volume();
    let out_mute = AudioDevice::get_master_mute();
    let in_vol = AudioDevice::get_input_volume();
    let in_mute = AudioDevice::get_input_mute();
    let alert_vol = (CACHED_ALERT_VOLUME.load(std::sync::atomic::Ordering::Relaxed) as f32) / 100.0;

    SystemVolumeSettings {
        output_volume: out_vol,
        output_muted: out_mute,
        input_volume: in_vol,
        input_muted: in_mute,
        alert_volume: alert_vol,
    }
}

#[tauri::command]
pub fn get_master_volume() -> f32 {
    AudioDevice::get_master_volume()
}

#[tauri::command]
pub fn set_master_volume(volume: f32) -> Result<(), String> {
    AudioDevice::set_master_volume(volume)
        .map_err(|e| format!("Failed to set master volume: {e}"))
}

#[tauri::command]
pub fn get_master_balance(state: State<'_, AppState>) -> f32 {
    let hw = AudioDevice::get_master_balance();
    let router_bal = state.router.lock().unwrap().get_master_balance();
    if hw.abs() > 1e-4 {
        hw
    } else {
        router_bal
    }
}

#[tauri::command]
pub fn set_master_balance(balance: f32, state: State<'_, AppState>) -> Result<(), String> {
    let b = balance.clamp(-1.0, 1.0);
    state.router.lock().unwrap().set_master_balance(b);
    let _ = AudioDevice::set_master_balance(b);
    Ok(())
}

#[tauri::command]
pub fn test_headphone_channel(channel: String) -> Result<String, String> {
    let ch = channel.trim().to_lowercase();
    match ch.as_str() {
        "left" | "l" => Ok("Testing Left Headphone Channel (L)".to_string()),
        "right" | "r" => Ok("Testing Right Headphone Channel (R)".to_string()),
        other => Err(format!("Invalid headphone channel: {other}. Expected 'left' or 'right'")),
    }
}

#[tauri::command]
pub fn get_master_mute() -> bool {
    AudioDevice::get_master_mute()
}

#[tauri::command]
pub fn set_master_mute(muted: bool) -> Result<(), String> {
    AudioDevice::set_master_mute(muted)
        .map_err(|e| format!("Failed to set master mute: {e}"))
}

#[tauri::command]
pub fn set_default_output_device(device_uid: String) -> Result<(), String> {
    AudioDevice::set_default_output_device_by_uid(&device_uid)
        .map_err(|e| format!("Failed to set default output device: {e}"))
}

#[tauri::command]
pub fn get_audio_input_devices() -> Vec<AudioDevice> {
    AudioDevice::enumerate_system_input_devices()
}

#[tauri::command]
pub fn set_default_input_device(device_uid: String) -> Result<(), String> {
    AudioDevice::set_default_input_device_by_uid(&device_uid)
        .map_err(|e| format!("Failed to set default input device: {e}"))
}

#[tauri::command]
pub fn get_input_volume() -> f32 {
    AudioDevice::get_input_volume()
}

#[tauri::command]
pub fn set_input_volume(volume: f32) -> Result<(), String> {
    AudioDevice::set_input_volume(volume)
        .map_err(|e| format!("Failed to set input volume: {e}"))
}

#[tauri::command]
pub fn get_input_mute() -> bool {
    AudioDevice::get_input_mute()
}

#[tauri::command]
pub fn set_input_mute(muted: bool) -> Result<(), String> {
    AudioDevice::set_input_mute(muted)
        .map_err(|e| format!("Failed to set input mute: {e}"))
}

#[tauri::command]
pub fn set_system_sounds_volume(volume: f32) {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    CACHED_ALERT_VOLUME.store(vol_100, std::sync::atomic::Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    {
        std::thread::spawn(move || {
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("set volume alert volume {vol_100}"))
                .output();
        });
    }
}

#[tauri::command]
pub async fn set_app_volume(bundle_id: String, volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) { return Err("Volume must be between 0 and 1".into()); }
    let effective = {
        let mut router = state.router.lock().unwrap();
        let muted = router.get_or_create_channel(&bundle_id).muted;
        if muted { 0.0 } else { volume }
    };
    if bundle_id == "com.spotify.client" {
        let web = state.spotify.web.clone();
        tauri::async_runtime::spawn_blocking(move || if web.connected() { web.set_volume(effective) } else { sound_core::spotify::set_volume(effective) }).await.map_err(|e| e.to_string())??;
    } else {
        AudioProcess::set_app_volume(&bundle_id, effective);
    }
    state.router.lock().unwrap().set_app_volume(&bundle_id, volume);
    Ok(())
}

/// Đưa tiếng của một ứng dụng qua rust-sound, để thanh trượt và EQ chạm được vào nó.
/// Chỉ một app tại một thời điểm: app đang tap trước đó được trả về đường phát thường.
#[tauri::command]
pub async fn tap_app(bundle_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let ids: Vec<u32> = AudioProcess::enumerate_system_processes()
        .into_iter()
        .filter(|process| process.bundle_id == bundle_id && process.is_running_output)
        .map(|process| process.object_id)
        .collect();
    state.app_tap.start(
        bundle_id,
        ids,
        state.router.clone(),
        state.spotify.spectrum_handle(),
    )
}

#[tauri::command]
pub fn untap_app(state: State<'_, AppState>) -> Result<(), String> {
    state.app_tap.stop();
    Ok(())
}

#[tauri::command]
pub fn app_tap_status(state: State<'_, AppState>) -> app_tap::AppTapStatus {
    state.app_tap.status()
}

#[tauri::command]
pub async fn set_app_mute(bundle_id: String, muted: bool, state: State<'_, AppState>) -> Result<(), String> {
    let vol = if muted { 0.0 } else { state.router.lock().unwrap().get_or_create_channel(&bundle_id).volume };
    if bundle_id == "com.spotify.client" {
        let web = state.spotify.web.clone();
        tauri::async_runtime::spawn_blocking(move || if web.connected() { web.set_volume(vol) } else { sound_core::spotify::set_volume(vol) }).await.map_err(|e| e.to_string())??;
    } else {
        AudioProcess::set_app_mute(&bundle_id, muted);
    }
    state.router.lock().unwrap().set_app_mute(&bundle_id, muted);
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MasterEQStateDto {
    pub bands: Vec<EQBandConfig>,
    pub bypass: bool,
}

#[tauri::command]
pub fn set_app_eq_band(
    bundle_id: String,
    band_index: usize,
    gain_db: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if band_index >= 10 || !gain_db.is_finite() || !(-24.0..=24.0).contains(&gain_db) { return Err("Invalid EQ band or gain".into()); }
    let mut router = state.router.lock().unwrap();
    let ch = router.get_or_create_channel(&bundle_id);
    ch.eq.set_band_gain(band_index, gain_db);
    Ok(())
}

#[tauri::command]
pub fn get_master_eq_bands(state: State<'_, AppState>) -> MasterEQStateDto {
    let router = state.router.lock().unwrap();
    MasterEQStateDto {
        bands: router.master_eq().bands().to_vec(),
        bypass: router.master_eq().is_bypassed(),
    }
}

#[tauri::command]
pub fn set_master_eq_band(
    band_index: usize,
    gain_db: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if band_index >= 10 || !gain_db.is_finite() || !(-24.0..=24.0).contains(&gain_db) {
        return Err("Invalid EQ band or gain".into());
    }
    let mut router = state.router.lock().unwrap();
    router.set_master_eq_band(band_index, gain_db);
    Ok(())
}

#[tauri::command]
pub fn reset_master_eq(state: State<'_, AppState>) -> MasterEQStateDto {
    let mut router = state.router.lock().unwrap();
    router.reset_master_eq();
    MasterEQStateDto {
        bands: router.master_eq().bands().to_vec(),
        bypass: router.master_eq().is_bypassed(),
    }
}

#[tauri::command]
pub fn set_master_eq_bypass(bypass: bool, state: State<'_, AppState>) -> bool {
    let mut router = state.router.lock().unwrap();
    router.set_master_eq_bypass(bypass);
    router.master_eq().is_bypassed()
}

// MARK: - Audio Filter & Voice Isolation Commands

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FilterTestResult {
    pub stats: FilterProcessingStats,
    pub processed_samples: Vec<f32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct VirtualAudioStatus {
    pub is_virtual_device_installed: bool,
    pub detected_virtual_devices: Vec<String>,
    pub recommended_input_device: Option<String>,
    pub os_name: String,
    pub setup_guide: String,
}

#[tauri::command]
pub fn get_audio_filter_settings(state: State<'_, AppState>) -> AudioFilterSettings {
    let router = state.router.lock().unwrap();
    router.get_filter_settings()
}

#[tauri::command]
pub fn set_audio_filter_settings(
    settings: AudioFilterSettings,
    state: State<'_, AppState>,
) -> AudioFilterSettings {
    let mut router = state.router.lock().unwrap();
    router.set_filter_settings(settings);
    router.get_filter_settings()
}

#[tauri::command]
pub fn test_filter_audio_buffer(
    samples: Vec<f32>,
    is_mic: bool,
    state: State<'_, AppState>,
) -> FilterTestResult {
    let mut router = state.router.lock().unwrap();
    let mut buffer = samples;
    if is_mic {
        let stats = router.process_mic_buffer(&mut buffer);
        FilterTestResult {
            stats,
            processed_samples: buffer,
        }
    } else {
        router.process_master(&mut buffer);
        let max_val = buffer.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
        let peak_db = if max_val > 1e-5 { 20.0 * max_val.log10() } else { -90.0 };
        FilterTestResult {
            stats: FilterProcessingStats {
                gate_open: true,
                input_peak_db: peak_db,
                output_peak_db: peak_db,
                attenuation_db: 0.0,
            },
            processed_samples: buffer,
        }
    }
}

#[tauri::command]
pub fn get_virtual_audio_status() -> VirtualAudioStatus {
    let outs = AudioDevice::enumerate_system_devices();
    let ins = AudioDevice::enumerate_system_input_devices();
    let mut detected = Vec::new();

    let keywords = [
        "blackhole",
        "soundflower",
        "loopback",
        "vb-cable",
        "cable input",
        "cable output",
        "voicemeeter",
        "virtual",
        "null-sink",
        "remap-source",
    ];

    for d in outs.iter().chain(ins.iter()) {
        let name_lower = d.name.to_lowercase();
        for kw in keywords {
            if name_lower.contains(kw) && !detected.contains(&d.name) {
                detected.push(d.name.clone());
            }
        }
    }

    let is_installed = !detected.is_empty();
    let recommended = detected.first().cloned();

    #[cfg(target_os = "macos")]
    let os_name = "macOS".to_string();
    #[cfg(target_os = "windows")]
    let os_name = "Windows".to_string();
    #[cfg(target_os = "linux")]
    let os_name = "Linux".to_string();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let os_name = "Desktop".to_string();

    let setup_guide = if is_installed {
        format!(
            "Phát hiện driver âm thanh ảo: '{}'. Trong cài đặt Discord, Zoom hoặc Google Meet, chọn 'Thiết bị đầu vào (Microphone)' là '{}' để sử dụng luồng âm thanh đã lọc tạp âm.",
            recommended.as_deref().unwrap_or("Virtual Device"),
            recommended.as_deref().unwrap_or("Virtual Device")
        )
    } else {
        match os_name.as_str() {
            "macOS" => "Để chuyển luồng âm thanh đã lọc vào Discord / Zoom / Google Meet trên macOS, bạn có thể cài driver ảo BlackHole miễn phí bằng lệnh: 'brew install blackhole-2ch', sau đó chọn BlackHole làm microphone trong Discord/Zoom.".to_string(),
            "Windows" => "Để chuyển luồng âm thanh đã lọc trên Windows, cài đặt driver miễn phí VB-Audio Virtual Cable (vb-audio.com/Cable), sau đó chọn CABLE Output làm microphone trong Discord/Zoom.".to_string(),
            "Linux" => "Để chuyển luồng âm thanh trên Linux, tạo virtual sink bằng lệnh: pactl load-module module-null-sink sink_name=Virtual_Sink.".to_string(),
            _ => "Cài đặt virtual audio cable driver trên hệ điều hành để kết nối âm thanh với các ứng dụng khác.".to_string(),
        }
    };

    VirtualAudioStatus {
        is_virtual_device_installed: is_installed,
        detected_virtual_devices: detected,
        recommended_input_device: recommended,
        os_name,
        setup_guide,
    }
}

#[tauri::command]
pub fn save_preset(preset: Preset, state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state.preset_store.lock().unwrap();
    store.set_preset(preset);
    Ok(())
}
