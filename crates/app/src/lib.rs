pub use sound_core as core;
pub use sound_engine as engine;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::State;

pub use core::{
    get_memory_info, trim_memory_cache, AudioProcess, AudioStreamBasicDescription, ProcessMemoryInfo,
    ProcessTap, RingBuffer,
};
pub use engine::{
    AgentIntegrationInfo, AgentSession, AppAudioChannel, AppAudioSettings, AudioDevice,
    AudioFilterSettings, AudioRouter, AuthService, AuthenticatedUser, BreakTimerManager,
    CatalogEntry, ChannelStateDto, EQBandConfig, FilterProcessingStats, GestureResult,
    MicFilterConfig, OutputFilterConfig, ParametricEQ, PetCareState, PetManager,
    PingloomSettings, Pkce, PkceChallenge, Preset, PresetStore, TimerPhase, TimerStatus,
    TodoItem, User, DEFAULT_EQ_FREQUENCIES,
};

pub struct AppState {
    pub router: Mutex<AudioRouter>,
    pub preset_store: Mutex<PresetStore>,
    pub timer: Mutex<BreakTimerManager>,
    pub auth: AuthService,
    pub pet: PetManager,
    pub wheel_settings: Mutex<PingloomSettings>,
    pub start_time: Instant,
    pub background_mode: AtomicBool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PetCareStateDto {
    pub xp: u64,
    pub level: u32,
    pub display_level: u32,
    pub progress: f64,
    pub stage_name: String,
    pub stage_index: usize,
    pub hunger: String,
    pub tokens_today: u64,
    pub meals_today: u32,
    pub total_tokens: u64,
    pub total_meals: u32,
    pub streak_days: u32,
    pub unlocked_achievements: Vec<String>,
}

impl From<PetCareState> for PetCareStateDto {
    fn from(s: PetCareState) -> Self {
        let now_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let hunger = s.hunger(now_ts).as_str().to_string();
        Self {
            xp: s.xp,
            level: s.level(),
            display_level: s.display_level(),
            progress: s.progress(),
            stage_name: s.stage_name().to_string(),
            stage_index: s.stage_index(),
            hunger,
            tokens_today: s.tokens_today,
            meals_today: s.meals_today,
            total_tokens: s.total_tokens,
            total_meals: s.total_meals,
            streak_days: s.streak_days,
            unlocked_achievements: s.unlocked_achievements.into_iter().collect(),
        }
    }
}

// MARK: - AgentPet Companion Commands

#[tauri::command]
fn get_pet_care_state(state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.get_care_state().into()
}

#[tauri::command]
fn feed_pet_action(action: String, state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.apply_care_action(&action).into()
}

#[tauri::command]
fn reset_pet_care_state(state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.reset_care_state().into()
}

#[tauri::command]
fn get_agent_sessions(state: State<'_, AppState>) -> Vec<AgentSession> {
    state.pet.get_sessions()
}

#[tauri::command]
fn dismiss_agent_session(id: String, state: State<'_, AppState>) {
    state.pet.dismiss_session(&id);
}

#[tauri::command]
fn get_agent_integrations(state: State<'_, AppState>) -> Vec<AgentIntegrationInfo> {
    state.pet.get_integrations()
}

#[tauri::command]
fn toggle_agent_hook(kind: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state.pet.toggle_hook(&kind, enabled)
}

#[tauri::command]
fn open_pet_overlay(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    if let Some(win) = app.get_webview_window("pet-overlay") {
        if let (Some(px), Some(py)) = (x, y) {
            let _ = win.set_position(tauri::LogicalPosition::new(px, py));
        }
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(true);
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "pet-overlay",
        WebviewUrl::App("index.html?overlay=1".into()),
    )
    .title("AgentPet Overlay")
    .inner_size(260.0, 280.0)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| format!("Failed to create pet overlay window: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;
        if let Ok(ns_win_ptr) = win.ns_window() {
            unsafe {
                let ns_win: &NSWindow = &*(ns_win_ptr as *const NSWindow);
                ns_win.setMovableByWindowBackground(true);
            }
        }
    }

    if let (Some(px), Some(py)) = (x, y) {
        let _ = win.set_position(tauri::LogicalPosition::new(px, py));
    } else if let Ok(Some(mon)) = app.primary_monitor() {
        let sz = mon.size();
        let scale = mon.scale_factor();
        let screen_w = sz.width as f64 / scale;
        let screen_h = sz.height as f64 / scale;
        let px = (screen_w - 280.0).max(20.0);
        let py = (screen_h - 320.0).max(20.0);
        let _ = win.set_position(tauri::LogicalPosition::new(px, py));
    }

    let _ = win.show();
    let _ = win.set_focus();
    Ok(true)
}

#[tauri::command]
fn close_pet_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("pet-overlay") {
        let _ = win.hide();
        Ok(false)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn toggle_pet_overlay(app: tauri::AppHandle, enable: Option<bool>, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
    use tauri::Manager;
    let is_open = app
        .get_webview_window("pet-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    let target = enable.unwrap_or(!is_open);
    if target {
        open_pet_overlay(app, x, y)
    } else {
        close_pet_overlay(app)
    }
}

#[tauri::command]
fn is_pet_overlay_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("pet-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
fn get_ping_settings(state: State<'_, AppState>) -> PingloomSettings {
    state.wheel_settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_ping_settings(settings: PingloomSettings, state: State<'_, AppState>) -> Result<PingloomSettings, String> {
    settings.validate()?;
    let mut current = state.wheel_settings.lock().unwrap();
    *current = settings.clone();
    Ok(settings)
}

#[tauri::command]
fn get_ping_catalog() -> Vec<CatalogEntry> {
    sound_engine::wheel::get_default_catalog()
}

#[tauri::command]
fn simulate_ping_gesture(dx: f64, dy: f64, state: State<'_, AppState>) -> Option<GestureResult> {
    let settings = state.wheel_settings.lock().unwrap().clone();
    let dead_zone = settings.drag_threshold_px as f64;
    let slice_idx = sound_engine::wheel::pick_slice(dx, dy, dead_zone)?;
    let ping_id = settings.wheel.get(slice_idx).cloned().unwrap_or_else(|| "danger".to_string());
    let catalog = sound_engine::wheel::get_default_catalog();
    let entry = catalog.iter().find(|c| c.id == ping_id);
    let ping_name = entry.map(|e| e.name.clone()).unwrap_or_else(|| ping_id.clone());
    let color = entry.map(|e| e.color.clone()).unwrap_or_else(|| "#38bdf8".to_string());
    let direction = sound_engine::wheel::DIRECTIONS.get(slice_idx).unwrap_or(&"N").to_string();

    Some(GestureResult {
        slice_index: slice_idx,
        direction,
        ping_id,
        ping_name,
        color,
    })
}

fn env_secret(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| match key {
        "RUST_SOUND_JWT_SECRET" => "rust-sound-neon-auth-secret-key-2026".to_string(),
        "RUST_SOUND_NEON_URL" => {
            "postgresql://neondb_owner:npg_dnSqB1Lp7gfk@ep-odd-butterfly-b40tuch4-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require".to_string()
        }
        _ => panic!("missing env var {key}"),
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AuthLoginResponse {
    pub user: User,
    pub token: String,
    pub auth_provider: String,
}

// MARK: - Authentication & Neon DB Commands

#[tauri::command]
fn auth_google_login(id_token: String, state: State<'_, AppState>) -> Result<AuthLoginResponse, String> {
    state
        .auth
        .handle_google_login(&id_token)
        .map(|(user, token)| AuthLoginResponse {
            user,
            token,
            auth_provider: "google".to_string(),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_keycloak_login(token: String, state: State<'_, AppState>) -> Result<AuthenticatedUser, String> {
    state
        .auth
        .dual_auth
        .authenticate_token(&token)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_pkce_generate() -> PkceChallenge {
    Pkce::generate_challenge()
}

#[tauri::command]
fn auth_pkce_verify(verifier: String, challenge: String) -> Result<bool, String> {
    Pkce::verify(&verifier, &challenge, "S256").map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_validate_token(token: String, state: State<'_, AppState>) -> Result<AuthenticatedUser, String> {
    state
        .auth
        .dual_auth
        .authenticate_token(&token)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_logout(session_id: Option<String>, state: State<'_, AppState>) -> bool {
    if let Some(sid) = session_id {
        let _ = state.auth.repo.delete_session(&sid);
    }
    true
}

#[tauri::command]
fn auth_get_db_connection_status(state: State<'_, AppState>) -> String {
    format!(
        "Neon PostgreSQL Pooler Active ({})",
        state.auth.repo.connection_string.split('@').last().unwrap_or("connected")
    )
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppPerformanceMetrics {
    pub resident_size_bytes: u64,
    pub resident_size_mb: f64,
    pub virtual_size_bytes: u64,
    pub virtual_size_mb: f64,
    pub phys_footprint_bytes: u64,
    pub phys_footprint_mb: f64,
    pub peak_phys_footprint_bytes: u64,
    pub peak_phys_footprint_mb: f64,
    pub uptime_seconds: u64,
    pub background_mode_active: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TrimMemoryResult {
    pub bytes_reclaimed_hint: usize,
    pub metrics_after: AppPerformanceMetrics,
}

#[tauri::command]
fn get_performance_metrics(state: State<'_, AppState>) -> AppPerformanceMetrics {
    let mem = core::get_memory_info();
    let uptime = state.start_time.elapsed().as_secs();
    let bg = state.background_mode.load(Ordering::Relaxed);
    AppPerformanceMetrics {
        resident_size_bytes: mem.resident_size_bytes,
        resident_size_mb: mem.resident_size_mb,
        virtual_size_bytes: mem.virtual_size_bytes,
        virtual_size_mb: mem.virtual_size_mb,
        phys_footprint_bytes: mem.phys_footprint_bytes,
        phys_footprint_mb: mem.phys_footprint_mb,
        peak_phys_footprint_bytes: mem.peak_phys_footprint_bytes,
        peak_phys_footprint_mb: mem.peak_phys_footprint_mb,
        uptime_seconds: uptime,
        background_mode_active: bg,
    }
}

pub fn benchmark_latency(client_timestamp_ms: f64) -> f64 {
    client_timestamp_ms
}

#[tauri::command]
fn benchmark_ipc_latency(client_timestamp_ms: f64) -> f64 {
    benchmark_latency(client_timestamp_ms)
}

#[tauri::command]
fn trim_memory(state: State<'_, AppState>) -> TrimMemoryResult {
    let freed = core::trim_memory_cache();
    let metrics = get_performance_metrics(state);
    TrimMemoryResult {
        bytes_reclaimed_hint: freed,
        metrics_after: metrics,
    }
}

#[tauri::command]
fn set_background_mode(enabled: bool, state: State<'_, AppState>) -> bool {
    state.background_mode.store(enabled, Ordering::Relaxed);
    if enabled {
        core::trim_memory_cache();
    }
    enabled
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
fn get_channel_states(state: State<'_, AppState>) -> HashMap<String, ChannelStateDto> {
    let router = state.router.lock().unwrap();
    router.get_channel_states()
}

static CACHED_ALERT_VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(70);

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SystemVolumeSettings {
    pub output_volume: f32,
    pub output_muted: bool,
    pub input_volume: f32,
    pub input_muted: bool,
    pub alert_volume: f32,
}

#[tauri::command]
fn get_system_volume_settings() -> SystemVolumeSettings {
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
fn get_master_volume() -> f32 {
    AudioDevice::get_master_volume()
}

#[tauri::command]
fn set_master_volume(volume: f32) -> Result<(), String> {
    AudioDevice::set_master_volume(volume)
        .map_err(|e| format!("Failed to set master volume: {e}"))
}

#[tauri::command]
fn get_master_balance(state: State<'_, AppState>) -> f32 {
    let hw = AudioDevice::get_master_balance();
    let router_bal = state.router.lock().unwrap().get_master_balance();
    if hw.abs() > 1e-4 {
        hw
    } else {
        router_bal
    }
}

#[tauri::command]
fn set_master_balance(balance: f32, state: State<'_, AppState>) -> Result<(), String> {
    let b = balance.clamp(-1.0, 1.0);
    state.router.lock().unwrap().set_master_balance(b);
    let _ = AudioDevice::set_master_balance(b);
    Ok(())
}

#[tauri::command]
fn test_headphone_channel(channel: String) -> Result<String, String> {
    let ch = channel.trim().to_lowercase();
    match ch.as_str() {
        "left" | "l" => Ok("Testing Left Headphone Channel (L)".to_string()),
        "right" | "r" => Ok("Testing Right Headphone Channel (R)".to_string()),
        other => Err(format!("Invalid headphone channel: {other}. Expected 'left' or 'right'")),
    }
}

#[tauri::command]
fn get_master_mute() -> bool {
    AudioDevice::get_master_mute()
}

#[tauri::command]
fn set_master_mute(muted: bool) -> Result<(), String> {
    AudioDevice::set_master_mute(muted)
        .map_err(|e| format!("Failed to set master mute: {e}"))
}

#[tauri::command]
fn set_default_output_device(device_uid: String) -> Result<(), String> {
    AudioDevice::set_default_output_device_by_uid(&device_uid)
        .map_err(|e| format!("Failed to set default output device: {e}"))
}

#[tauri::command]
fn get_audio_input_devices() -> Vec<AudioDevice> {
    AudioDevice::enumerate_system_input_devices()
}

#[tauri::command]
fn set_default_input_device(device_uid: String) -> Result<(), String> {
    AudioDevice::set_default_input_device_by_uid(&device_uid)
        .map_err(|e| format!("Failed to set default input device: {e}"))
}

#[tauri::command]
fn get_input_volume() -> f32 {
    AudioDevice::get_input_volume()
}

#[tauri::command]
fn set_input_volume(volume: f32) -> Result<(), String> {
    AudioDevice::set_input_volume(volume)
        .map_err(|e| format!("Failed to set input volume: {e}"))
}

#[tauri::command]
fn get_input_mute() -> bool {
    AudioDevice::get_input_mute()
}

#[tauri::command]
fn set_input_mute(muted: bool) -> Result<(), String> {
    AudioDevice::set_input_mute(muted)
        .map_err(|e| format!("Failed to set input mute: {e}"))
}

#[tauri::command]
fn set_system_sounds_volume(volume: f32) {
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

fn apply_media_app_volume(bundle_id: &str, volume: f32) {
    let vol_100 = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    #[cfg(target_os = "macos")]
    {
        let bundle = bundle_id.to_string();
        std::thread::spawn(move || {
            if bundle == "com.spotify.client" {
                let _ = std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(format!("tell application \"Spotify\" to set sound volume to {vol_100}"))
                    .output();
            } else if bundle == "com.apple.Music" {
                let _ = std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(format!("tell application \"Music\" to set sound volume to {vol_100}"))
                    .output();
            } else if bundle == "com.apple.QuickTimePlayerX" {
                let frac = volume.clamp(0.0, 1.0);
                let _ = std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(format!("tell application \"QuickTime Player\" to set audio volume of front document to {frac}"))
                    .output();
            }
        });
    }
}

#[tauri::command]
fn set_app_volume(bundle_id: String, volume: f32, state: State<'_, AppState>) {
    let mut router = state.router.lock().unwrap();
    router.set_app_volume(&bundle_id, volume);
    apply_media_app_volume(&bundle_id, volume);
    AudioProcess::set_app_volume(&bundle_id, volume);
}

#[tauri::command]
fn set_app_mute(bundle_id: String, muted: bool, state: State<'_, AppState>) {
    let mut router = state.router.lock().unwrap();
    router.set_app_mute(&bundle_id, muted);
    let vol = if muted {
        0.0
    } else {
        router.get_or_create_channel(&bundle_id).volume
    };
    apply_media_app_volume(&bundle_id, vol);
    AudioProcess::set_app_mute(&bundle_id, muted);
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MasterEQStateDto {
    pub bands: Vec<EQBandConfig>,
    pub bypass: bool,
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
fn get_master_eq_bands(state: State<'_, AppState>) -> MasterEQStateDto {
    let router = state.router.lock().unwrap();
    MasterEQStateDto {
        bands: router.master_eq().bands().to_vec(),
        bypass: router.master_eq().is_bypassed(),
    }
}

#[tauri::command]
fn set_master_eq_band(
    band_index: usize,
    gain_db: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if band_index >= 10 {
        return Err(format!("Invalid band index: {band_index}"));
    }
    let mut router = state.router.lock().unwrap();
    router.set_master_eq_band(band_index, gain_db);
    Ok(())
}

#[tauri::command]
fn reset_master_eq(state: State<'_, AppState>) -> MasterEQStateDto {
    let mut router = state.router.lock().unwrap();
    router.reset_master_eq();
    MasterEQStateDto {
        bands: router.master_eq().bands().to_vec(),
        bypass: router.master_eq().is_bypassed(),
    }
}

#[tauri::command]
fn set_master_eq_bypass(bypass: bool, state: State<'_, AppState>) -> bool {
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
fn get_audio_filter_settings(state: State<'_, AppState>) -> AudioFilterSettings {
    let router = state.router.lock().unwrap();
    router.get_filter_settings()
}

#[tauri::command]
fn set_audio_filter_settings(
    settings: AudioFilterSettings,
    state: State<'_, AppState>,
) -> AudioFilterSettings {
    let mut router = state.router.lock().unwrap();
    router.set_filter_settings(settings);
    router.get_filter_settings()
}

#[tauri::command]
fn test_filter_audio_buffer(
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
fn get_virtual_audio_status() -> VirtualAudioStatus {
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
fn save_preset(preset: Preset, state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state.preset_store.lock().unwrap();
    store.set_preset(preset);
    Ok(())
}

// MARK: - Break Timer & Todo IPC Commands

#[tauri::command]
fn start_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.start();
    timer.get_status()
}

#[tauri::command]
fn stop_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.stop(Some(&mut router));
    timer.get_status()
}

#[tauri::command]
fn skip_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.skip(Some(&mut router));
    timer.get_status()
}

#[tauri::command]
fn snooze_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.snooze();
    timer.get_status()
}

#[tauri::command]
fn get_break_timer_status(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.tick(Some(&mut router));
    timer.get_status()
}

#[tauri::command]
fn set_timer_durations(study_sec: u64, break_sec: u64, state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.set_durations(study_sec, break_sec);
    timer.get_status()
}

#[tauri::command]
fn add_todo_item(
    title: String,
    start_time: Option<String>,
    end_time: Option<String>,
    duration_minutes: Option<u32>,
    state: State<'_, AppState>,
) -> Vec<TodoItem> {
    let mut timer = state.timer.lock().unwrap();
    timer.add_todo_with_time(title, start_time, end_time, duration_minutes);
    timer.get_todos().to_vec()
}

#[tauri::command]
fn toggle_todo_item(id: String, state: State<'_, AppState>) -> Vec<TodoItem> {
    let mut timer = state.timer.lock().unwrap();
    timer.toggle_todo(&id);
    timer.get_todos().to_vec()
}

#[tauri::command]
fn delete_todo_item(id: String, state: State<'_, AppState>) -> Vec<TodoItem> {
    let mut timer = state.timer.lock().unwrap();
    timer.delete_todo(&id);
    timer.get_todos().to_vec()
}

#[tauri::command]
fn get_todo_items(state: State<'_, AppState>) -> Vec<TodoItem> {
    let timer = state.timer.lock().unwrap();
    timer.get_todos().to_vec()
}

fn get_config_preset_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config/rust-sound/presets.json")
    } else if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("rust-sound/presets.json")
    } else {
        PathBuf::from("presets.json")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let preset_file = get_config_preset_path();
    let preset_store = PresetStore::new(preset_file);
    let router = AudioRouter::new(48000.0);
    let timer = BreakTimerManager::default();
    let auth = AuthService::new(env_secret("RUST_SOUND_JWT_SECRET"), env_secret("RUST_SOUND_NEON_URL"));
    let pet = PetManager::new();
    pet.start_daemon();

    let state = AppState {
        router: Mutex::new(router),
        preset_store: Mutex::new(preset_store),
        timer: Mutex::new(timer),
        auth,
        pet,
        wheel_settings: Mutex::new(PingloomSettings::default()),
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
    };

    let app = tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_audio_processes,
            get_audio_devices,
            get_presets,
            get_channel_states,
            get_system_volume_settings,
            get_master_volume,
            set_master_volume,
            get_master_balance,
            set_master_balance,
            test_headphone_channel,
            get_master_mute,
            set_master_mute,
            set_default_output_device,
            get_audio_input_devices,
            set_default_input_device,
            get_input_volume,
            set_input_volume,
            get_input_mute,
            set_input_mute,
            set_system_sounds_volume,
            set_app_volume,
            set_app_mute,
            set_app_eq_band,
            get_master_eq_bands,
            set_master_eq_band,
            reset_master_eq,
            set_master_eq_bypass,
            save_preset,
            start_break_timer,
            stop_break_timer,
            skip_break_timer,
            snooze_break_timer,
            get_break_timer_status,
            set_timer_durations,
            add_todo_item,
            toggle_todo_item,
            delete_todo_item,
            get_todo_items,
            get_performance_metrics,
            benchmark_ipc_latency,
            trim_memory,
            set_background_mode,
            auth_google_login,
            auth_keycloak_login,
            auth_pkce_generate,
            auth_pkce_verify,
            auth_validate_token,
            auth_logout,
            auth_get_db_connection_status,
            get_pet_care_state,
            feed_pet_action,
            reset_pet_care_state,
            get_agent_sessions,
            dismiss_agent_session,
            get_agent_integrations,
            toggle_agent_hook,
            open_pet_overlay,
            close_pet_overlay,
            toggle_pet_overlay,
            is_pet_overlay_open,
            get_ping_settings,
            save_ping_settings,
            get_ping_catalog,
            simulate_ping_gesture,
            get_audio_filter_settings,
            set_audio_filter_settings,
            test_filter_audio_buffer,
            get_virtual_audio_status
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
                        let _ = window.set_icon(icon);
                    }
                }

                // Explicitly set the macOS application Dock icon at runtime
                unsafe {
                    use objc2::AnyThread;
                    use objc2_app_kit::{NSApplication, NSImage};
                    use objc2_foundation::{MainThreadMarker, NSData};

                    if let Some(mtm) = MainThreadMarker::new() {
                        let icon_bytes = include_bytes!("../icons/icon.png");
                        let ns_data = NSData::with_bytes(icon_bytes);
                        let ns_image = NSImage::initWithData(NSImage::alloc(), &ns_data);
                        if let Some(image) = ns_image {
                            NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image));
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            use tauri::Manager;
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.pet.stop_daemon();
            }
        }
    });
}

