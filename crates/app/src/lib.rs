pub use sound_core as core;
pub use sound_engine as engine;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub use core::{AudioProcess, AudioStreamBasicDescription, ProcessTap, RingBuffer};
pub use engine::{
    AppAudioChannel, AppAudioSettings, AudioDevice, AudioRouter, EQBandConfig, ParametricEQ,
    Preset, PresetStore, DEFAULT_EQ_FREQUENCIES,
};

pub struct AppState {
    pub router: Mutex<AudioRouter>,
    pub preset_store: Mutex<PresetStore>,
}

#[tauri::command]
fn get_audio_processes() -> Vec<AudioProcess> {
    AudioProcess::enumerate_system_processes()
}

#[tauri::command]
fn get_audio_devices() -> Vec<AudioDevice> {
    AudioDevice::enumerate_system_devices()
}

#[tauri::command]
fn get_presets(state: State<'_, AppState>) -> Vec<Preset> {
    let store = state.preset_store.lock().unwrap();
    store.presets().to_vec()
}

#[tauri::command]
fn set_app_volume(bundle_id: String, volume: f32, state: State<'_, AppState>) {
    let mut router = state.router.lock().unwrap();
    router.set_app_volume(&bundle_id, volume);
}

#[tauri::command]
fn set_app_mute(bundle_id: String, muted: bool, state: State<'_, AppState>) {
    let mut router = state.router.lock().unwrap();
    router.set_app_mute(&bundle_id, muted);
}

#[tauri::command]
fn set_app_eq_band(
    bundle_id: String,
    band_index: usize,
    gain_db: f32,
    state: State<'_, AppState>,
) {
    let mut router = state.router.lock().unwrap();
    let ch = router.get_or_create_channel(&bundle_id);
    ch.eq.set_band_gain(band_index, gain_db);
}

#[tauri::command]
fn save_preset(preset: Preset, state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state.preset_store.lock().unwrap();
    store.set_preset(preset);
    Ok(())
}

fn get_config_preset_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config/rust-sound/presets.json")
    } else {
        PathBuf::from("presets.json")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let preset_file = get_config_preset_path();
    let preset_store = PresetStore::new(preset_file);
    let router = AudioRouter::new(48000.0);

    let state = AppState {
        router: Mutex::new(router),
        preset_store: Mutex::new(preset_store),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_audio_processes,
            get_audio_devices,
            get_presets,
            set_app_volume,
            set_app_mute,
            set_app_eq_band,
            save_preset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
