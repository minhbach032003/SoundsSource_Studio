pub mod app_tap;
pub mod spotify;
use spotify::{get_spotify_spectrum, get_spotify_status, connect_spotify_audio, spotify_local_player, spotify_control, spotify_account, spotify_login, spotify_logout, spotify_browse, spotify_devices, spotify_select_device, spotify_play_uri, spotify_play_tracks, spotify_set_shuffle, spotify_set_repeat, spotify_open_automation_settings, spotify_playback_login, spotify_playback_connected};
pub use sound_core as core;
pub use sound_engine as engine;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

pub use core::{
    get_memory_info, trim_memory_cache, should_suppress_event, AudioProcess,
    AudioStreamBasicDescription, InputBlocker, ProcessMemoryInfo, ProcessTap, RingBuffer,
    KEYCODE_ESCAPE, KEYCODE_F3, KEYCODE_GRAVE, KEYCODE_H, KEYCODE_M, KEYCODE_Q, KEYCODE_TAB,
    KEYCODE_W, MASK_COMMAND, MASK_SHIFT,
};
pub use engine::{
    Action, ActivityFormatter, ActivityTheme, AgentIntegrationInfo, AgentSession, AppAudioChannel,
    AppAudioSettings, AudioDevice, AudioFilterSettings, AudioRouter, AuthService, AuthenticatedUser,
    BreakTimerManager, Button, CatalogEntry, ChannelStateDto, EQBandConfig, FilterProcessingStats,
    GestureEngine, GestureResult, GestureState, GoogleCalendarAccount, GoogleCalendarEventDto,
    GoogleCalendarService, GoogleCalendarStatus, InputDecision, InputEvent, MicFilterConfig,
    OutputFilterConfig, ParametricEQ, PetCareState, PetManager, PingAsset, PingId, PingloomSettings,
    Pkce, PkceChallenge, Point, Preset, PresetStore, ReplayInput, Settings, SettingsError,
    TimerPhase, TimerStatus, TodoItem, Trigger, User, WheelKind, DEFAULT_EQ_FREQUENCIES,
};

pub struct AppState {
    pub router: Arc<Mutex<AudioRouter>>,
    pub spotify: spotify::SpotifyIntegration,
    /// Đường đưa tiếng của một ứng dụng bất kỳ qua rust-sound.
    pub app_tap: app_tap::AppTap,
    pub preset_store: Mutex<PresetStore>,
    pub timer: Mutex<BreakTimerManager>,
    pub auth: Arc<engine::auth::remote::RemoteAuth>,
    pub pet: PetManager,
    pub wheel_settings: Mutex<PingloomSettings>,
    pub gesture_engine: Mutex<GestureEngine>,
    pub start_time: Instant,
    pub background_mode: AtomicBool,
    pub input_blocker: InputBlocker,
    #[cfg(target_os = "macos")]
    pub gesture_listener: Mutex<Option<pingloom::NativeGestureListener>>,
    pub gemini_api_key: Mutex<Option<String>>,
    pub google_calendar: Arc<engine::GoogleCalendarService>,
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

fn pet_notification_window(window: &tauri::WebviewWindow, request: bool) -> Result<(), String> {
    if window.label() == "main" || (!request && window.label() == "pet-overlay") { Ok(()) }
    else { Err("AgentPet notifications are not available in this window".into()) }
}

#[tauri::command]
async fn pet_notification_status(window: tauri::WebviewWindow) -> Result<String, String> {
    pet_notification_window(&window, false)?;
    core::pet_notifications::status().await
}

#[tauri::command]
async fn request_pet_notification_permission(window: tauri::WebviewWindow) -> Result<String, String> {
    pet_notification_window(&window, true)?;
    core::pet_notifications::request().await
}

#[tauri::command]
async fn send_pet_notification(window: tauri::WebviewWindow, title: String, body: String) -> Result<(), String> {
    pet_notification_window(&window, false)?;
    if title.trim().is_empty() || title.chars().count() > 200 || body.chars().count() > 1000 {
        return Err("Notification title/body exceeds allowed length".into());
    }
    core::pet_notifications::send(title, body).await
}

static ACTIVE_PET_THEME: Mutex<Option<ActivityTheme>> = Mutex::new(None);

#[tauri::command]
fn get_pet_activity_theme() -> String {
    let guard = ACTIVE_PET_THEME.lock().unwrap();
    guard.unwrap_or_default().display_name().to_string()
}

#[tauri::command]
fn set_pet_activity_theme(theme: String) -> String {
    let mut guard = ACTIVE_PET_THEME.lock().unwrap();
    let t = match theme.to_ascii_lowercase().as_str() {
        "engineer" => ActivityTheme::Engineer,
        "wizard" => ActivityTheme::Wizard,
        "explorer" => ActivityTheme::Explorer,
        "scientist" => ActivityTheme::Scientist,
        _ => ActivityTheme::Chef,
    };
    *guard = Some(t);
    t.display_name().to_string()
}

#[tauri::command]
fn format_tool_activity(
    event_name: String,
    tool_name: Option<String>,
    file_path: Option<String>,
    message: Option<String>,
) -> String {
    let guard = ACTIVE_PET_THEME.lock().unwrap();
    let theme = guard.unwrap_or_default();
    ActivityFormatter::format(
        &event_name,
        tool_name.as_deref(),
        file_path.as_deref(),
        message.as_deref(),
        theme,
    )
}

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
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let main = app.get_webview_window("main").ok_or("Main window unavailable")?;
    main.show().map_err(|e| e.to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// Tauri/tao show() calls makeKeyAndOrderFront on macOS, even for focused(false).
// Use native non-key ordering on the UI thread for automatic companion display.
fn show_pet_without_focus(win: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        let window = win.clone();
        win.run_on_main_thread(move || {
            use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};
            let result = window.ns_window().map_err(|e| e.to_string()).map(|ptr| unsafe {
                let ns_win = &*(ptr as *const NSWindow);
                ns_win.setOpaque(false);
                ns_win.setHasShadow(false);
                ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
                ns_win.setMovableByWindowBackground(true);
                ns_win.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary);
                ns_win.orderFrontRegardless();
            });
            let _ = tx.send(result);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    win.show().map_err(|e| e.to_string())
}

fn tray_popover_anchor(position: tauri::PhysicalPosition<f64>, scale: f64) -> tauri::LogicalPosition<f64> {
    let logical = position.to_logical::<f64>(scale);
    tauri::LogicalPosition::new(logical.x - 160.0, logical.y + 10.0)
}

#[tauri::command]
fn open_pet_overlay(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    if x.is_some_and(|n| !n.is_finite()) || y.is_some_and(|n| !n.is_finite()) {
        return Err("Pet position must be finite".into());
    }

    let (screen_w, screen_h) = if let Ok(Some(mon)) = app.primary_monitor() {
        let sz = mon.size();
        let scale = mon.scale_factor();
        (sz.width as f64 / scale, sz.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    };

    let (clamped_x, clamped_y) = if let (Some(px), Some(py)) = (x, y) {
        let cx = px.clamp(20.0, (screen_w - 280.0).max(20.0));
        let cy = py.clamp(20.0, (screen_h - 320.0).max(20.0));
        (cx, cy)
    } else {
        let cx = (screen_w - 280.0).max(20.0);
        let cy = (screen_h - 320.0).max(20.0);
        (cx, cy)
    };

    if let Some(win) = app.get_webview_window("pet-overlay") {
        if x.is_some() && y.is_some() {
            win.set_position(tauri::LogicalPosition::new(clamped_x, clamped_y)).map_err(|e| e.to_string())?;
        }
        show_pet_without_focus(win)?;
        return Ok(true);
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "pet-overlay",
        WebviewUrl::App("index.html".into()),
    )
    .title("AgentPet Overlay")
    .inner_size(260.0, 280.0)
    .position(clamped_x, clamped_y)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .resizable(false)
    .focused(false)
    .visible(false)
    .initialization_script("window.__IS_PET_OVERLAY__ = true; window.__TAURI_WINDOW_LABEL__ = 'pet-overlay';")
    .build()
    .map_err(|e| format!("Failed to create pet overlay window: {e}"))?;

    show_pet_without_focus(win)?;
    Ok(true)
}

#[tauri::command]
fn close_pet_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("pet-overlay") {
        win.hide().map_err(|e| e.to_string())?;
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
fn open_pet_popover(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let (screen_w, _screen_h) = if let Ok(Some(mon)) = app.primary_monitor() {
        let sz = mon.size();
        let scale = mon.scale_factor();
        (sz.width as f64 / scale, sz.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    };

    let target_x = x.unwrap_or(screen_w - 340.0).clamp(20.0, screen_w - 340.0);
    let target_y = y.unwrap_or(32.0).clamp(30.0, 800.0);

    if let Some(win) = app.get_webview_window("pet-popover") {
        let _ = win.set_position(tauri::LogicalPosition::new(target_x, target_y));
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(true);
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "pet-popover",
        WebviewUrl::App("index.html?popover=1".into()),
    )
    .title("AgentPet Popover")
    .inner_size(320.0, 520.0)
    .position(target_x, target_y)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(true)
    .resizable(false)
    .initialization_script("window.__IS_PET_POPOVER__ = true; window.__TAURI_WINDOW_LABEL__ = 'pet-popover';")
    .build()
    .map_err(|e| format!("Failed to create pet popover window: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};
        if let Ok(ns_win_ptr) = win.ns_window() {
            unsafe {
                let ns_win: &NSWindow = &*(ns_win_ptr as *const NSWindow);
                ns_win.setOpaque(false);
                ns_win.setHasShadow(true);
                ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
                ns_win.setMovableByWindowBackground(false);
                ns_win.setCollectionBehavior(
                    NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );
            }
        }
    }

    // Auto-dismiss popover when losing focus
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = win_clone.hide();
        }
    });

    let _ = win.show();
    let _ = win.set_focus();
    Ok(true)
}

#[tauri::command]
fn close_pet_popover(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("pet-popover") {
        let _ = win.hide();
    }
    Ok(false)
}

#[tauri::command]
fn toggle_pet_popover(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
    use tauri::Manager;
    let is_open = app
        .get_webview_window("pet-popover")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if is_open {
        close_pet_popover(app)
    } else {
        open_pet_popover(app, x, y)
    }
}

#[tauri::command]
fn is_pet_popover_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("pet-popover")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
fn clear_agent_sessions(state: State<'_, AppState>) -> Result<bool, String> {
    state.pet.clear_sessions();
    Ok(true)
}

#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String) -> Result<bool, String> {
    if let Some(tray) = app.tray_by_id("agentpet-tray") {
        let _ = tray.set_title(if title.is_empty() { None } else { Some(&title) });
    }
    Ok(true)
}

#[tauri::command]
fn open_ping_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    if let Some(win) = app.get_webview_window("ping-overlay") {
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.show();
        return Ok(true);
    }

    let (screen_w, screen_h) = if let Ok(Some(mon)) = app.primary_monitor() {
        let sz = mon.size();
        let scale = mon.scale_factor();
        (sz.width as f64 / scale, sz.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    };

    let win = WebviewWindowBuilder::new(
        &app,
        "ping-overlay",
        WebviewUrl::App("index.html?ping_overlay=1".into()),
    )
    .title("Ping Overlay")
    .inner_size(screen_w, screen_h)
    .position(0.0, 0.0)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .resizable(false)
    .initialization_script("\
        window.__IS_PING_OVERLAY__ = true;\
        window.__TAURI_WINDOW_LABEL__ = 'ping-overlay';\
        (function() {\
          var s = document.createElement('style');\
          s.textContent = 'html, body { background: transparent !important; }';\
          (document.head || document.documentElement).appendChild(s);\
        })();\
    ")
    .build()
    .map_err(|e| format!("Failed to create ping overlay window: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};
        if let Ok(ns_win_ptr) = win.ns_window() {
            unsafe {
                let ns_win: &NSWindow = &*(ns_win_ptr as *const NSWindow);
                ns_win.setOpaque(false);
                ns_win.setHasShadow(false);
                ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
                ns_win.setIgnoresMouseEvents(true);
                ns_win.setCollectionBehavior(
                    NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );
            }
        }
    }

    let _ = win.set_ignore_cursor_events(true);
    let _ = win.show();
    Ok(true)
}

#[tauri::command]
fn close_ping_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("ping-overlay") {
        let _ = win.hide();
        Ok(false)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn toggle_ping_overlay(app: tauri::AppHandle, enable: Option<bool>) -> Result<bool, String> {
    use tauri::Manager;
    let is_open = app
        .get_webview_window("ping-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    let target = enable.unwrap_or(!is_open);
    if target {
        open_ping_overlay(app)
    } else {
        close_ping_overlay(app)
    }
}

#[tauri::command]
fn is_ping_overlay_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("ping-overlay")
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
fn get_pingloom_settings(state: State<'_, AppState>) -> PingloomSettings {
    get_ping_settings(state)
}

#[tauri::command]
fn save_pingloom_settings(settings: PingloomSettings, state: State<'_, AppState>) -> Result<PingloomSettings, String> {
    save_ping_settings(settings, state)
}

/// Locates the root pingloom assets directory (`public/pingloom` or `assets/pingloom`).
pub fn resolve_pingloom_assets_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("PINGLOOM_ASSETS_DIR") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Some(p);
        }
    }

    let candidates = [
        PathBuf::from("public/pingloom"),
        PathBuf::from("assets/pingloom"),
        PathBuf::from("../public/pingloom"),
        PathBuf::from("../assets/pingloom"),
        PathBuf::from("../../public/pingloom"),
        PathBuf::from("../../assets/pingloom"),
    ];
    for cand in &candidates {
        if cand.is_dir() && cand.join("sounds").is_dir() {
            return Some(cand.clone());
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let exe_candidates = [
                parent.join("../Resources/pingloom"),
                parent.join("../Resources/public/pingloom"),
                parent.join("../Resources/assets/pingloom"),
                parent.join("public/pingloom"),
                parent.join("assets/pingloom"),
            ];
            for cand in &exe_candidates {
                if cand.is_dir() && cand.join("sounds").is_dir() {
                    return Some(cand.clone());
                }
            }
        }
    }

    None
}

/// Resolves a subpath such as "sounds/Danger.ogg" to an existing file path.
pub fn resolve_pingloom_asset_path(subpath: &str) -> Option<PathBuf> {
    let sub = Path::new(subpath);
    if let Some(base) = resolve_pingloom_assets_dir() {
        let full = base.join(sub);
        if full.is_file() {
            return Some(full);
        }
    }

    // Direct check from current dir
    let cwd_candidates = [
        PathBuf::from("public/pingloom").join(sub),
        PathBuf::from("assets/pingloom").join(sub),
        PathBuf::from("../public/pingloom").join(sub),
        PathBuf::from("../assets/pingloom").join(sub),
        PathBuf::from("../../public/pingloom").join(sub),
        PathBuf::from("../../assets/pingloom").join(sub),
    ];
    for cand in &cwd_candidates {
        if cand.is_file() {
            return Some(cand.clone());
        }
    }

    None
}

/// Plays an audio sound file on macOS via `afplay` in a dedicated background worker thread.
pub fn play_sound_file(path: &Path, volume: Option<f32>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("afplay");
        if let Some(vol) = volume {
            let clamped = vol.clamp(0.0, 1.0);
            cmd.arg("-v").arg(format!("{:.2}", clamped));
        }
        cmd.arg(path);

        std::thread::spawn(move || {
            if let Ok(mut child) = cmd.spawn() {
                let _ = child.wait();
            }
        });

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, volume);
        Ok(())
    }
}

/// Triggers audio playback for a ping sound, emote, or sound filename.
/// Returns the resolved PathBuf if successful.
pub fn trigger_ping_sound(sound: &str, volume: Option<f32>) -> Result<PathBuf, String> {
    let subpath = sound_engine::wheel::resolve_sound_filename(sound)
        .ok_or_else(|| format!("Ping sound '{}' not found in assets", sound))?;

    let full_path = resolve_pingloom_asset_path(&subpath)
        .ok_or_else(|| format!("Sound file '{}' could not be located on disk", subpath))?;

    play_sound_file(&full_path, volume)?;
    Ok(full_path)
}

#[tauri::command]
fn play_ping_sound(sound: String, app_handle: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    let (volume, muted) = if let Some(state) = app_handle.try_state::<AppState>() {
        let settings = state.wheel_settings.lock().unwrap();
        (Some(settings.volume as f32 / 100.0), settings.muted)
    } else {
        (Some(0.75), false)
    };

    if muted {
        return Ok(false);
    }

    let full_path = trigger_ping_sound(&sound, volume)?;

    use tauri::Emitter;
    let _ = app_handle.emit("pingloom:sound", serde_json::json!({
        "sound": sound,
        "path": full_path.to_string_lossy(),
        "volume": volume.unwrap_or(0.75),
    }));

    Ok(true)
}

#[tauri::command]
fn get_pingloom_assets_manifest() -> Result<serde_json::Value, String> {
    let assets_dir = resolve_pingloom_assets_dir();

    // 1. Sounds
    let mut sounds = Vec::new();
    if let Some(ref base) = assets_dir {
        let sounds_dir = base.join("sounds");
        if let Ok(entries) = std::fs::read_dir(sounds_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".ogg") && !name.starts_with('.') {
                    sounds.push(name);
                }
            }
        }
    }
    if sounds.is_empty() {
        sounds = sound_engine::wheel::SOUND_FILES.iter().map(|s| s.to_string()).collect();
    }
    sounds.sort();

    // 2. Emotes
    let mut emotes_set = std::collections::BTreeSet::new();
    if let Some(ref base) = assets_dir {
        let emotes_dir = base.join("emotes");
        if let Ok(entries) = std::fs::read_dir(emotes_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(stem) = path.file_stem() {
                    let stem_str = stem.to_string_lossy().to_string();
                    if !stem_str.starts_with('.') {
                        emotes_set.insert(stem_str);
                    }
                }
            }
        }
    }
    let emotes: Vec<String> = if emotes_set.is_empty() {
        sound_engine::wheel::EMOTE_ASSETS.iter().map(|s| s.to_string()).collect()
    } else {
        emotes_set.into_iter().collect()
    };

    // 3. Textures
    let mut textures = Vec::new();
    if let Some(ref base) = assets_dir {
        let textures_dir = base.join("textures");
        if let Ok(entries) = std::fs::read_dir(textures_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    textures.push(name);
                }
            }
        }
    }
    textures.sort();

    // 4. Pings
    let pings: Vec<String> = sound_engine::wheel::PING_ASSETS
        .iter()
        .map(|asset| match asset.id {
            sound_engine::wheel::PingId::Danger => "danger",
            sound_engine::wheel::PingId::Push => "push",
            sound_engine::wheel::PingId::OnMyWay => "omw",
            sound_engine::wheel::PingId::AllIn => "allin",
            sound_engine::wheel::PingId::Assist => "assist",
            sound_engine::wheel::PingId::NeedVision => "needvision",
            sound_engine::wheel::PingId::Missing => "missing",
            sound_engine::wheel::PingId::EnemyVision => "enemyvision",
            sound_engine::wheel::PingId::Generic => "generic",
            sound_engine::wheel::PingId::Bait => "bait",
            sound_engine::wheel::PingId::VisionCleared => "visioncleared",
        }.to_string())
        .collect();

    let pings_details: Vec<serde_json::Value> = sound_engine::wheel::PING_ASSETS
        .iter()
        .map(|asset| {
            let id_str = match asset.id {
                sound_engine::wheel::PingId::Danger => "danger",
                sound_engine::wheel::PingId::Push => "push",
                sound_engine::wheel::PingId::OnMyWay => "omw",
                sound_engine::wheel::PingId::AllIn => "allin",
                sound_engine::wheel::PingId::Assist => "assist",
                sound_engine::wheel::PingId::NeedVision => "needvision",
                sound_engine::wheel::PingId::Missing => "missing",
                sound_engine::wheel::PingId::EnemyVision => "enemyvision",
                sound_engine::wheel::PingId::Generic => "generic",
                sound_engine::wheel::PingId::Bait => "bait",
                sound_engine::wheel::PingId::VisionCleared => "visioncleared",
            };
            let sound_file = sound_engine::wheel::resolve_sound_filename(id_str)
                .unwrap_or_else(|| format!("{}.ogg", asset.sound));
            serde_json::json!({
                "id": id_str,
                "name": asset.name,
                "sound": asset.sound,
                "sound_file": sound_file,
                "icon": asset.icon,
                "color": asset.color,
            })
        })
        .collect();

    let manifest = serde_json::json!({
        "counts": {
            "pings": pings.len(),
            "emotes": emotes.len(),
            "sounds": sounds.len(),
            "textures": textures.len(),
        },
        "pings_count": pings.len(),
        "emotes_count": emotes.len(),
        "sounds_count": sounds.len(),
        "textures_count": textures.len(),
        "pings": pings,
        "emotes": emotes,
        "sounds": sounds,
        "textures": textures,
        "pings_details": pings_details,
    });

    Ok(manifest)
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

#[tauri::command]
fn get_gesture_state(state: State<'_, AppState>) -> String {
    match state.gesture_engine.lock().unwrap().state() {
        GestureState::Idle => "idle".to_string(),
        GestureState::Pending => "pending".to_string(),
        GestureState::Wheel => "wheel".to_string(),
        GestureState::SwallowUp => "swallow_up".to_string(),
    }
}

#[tauri::command]
fn toggle_gesture_engine(enable: Option<bool>, state: State<'_, AppState>) -> bool {
    let mut engine = state.gesture_engine.lock().unwrap();
    let target = enable.unwrap_or(!engine.enabled());
    let _ = engine.set_enabled(target);
    engine.enabled()
}

#[tauri::command]
fn tick_gesture_engine(now_ms: u64, state: State<'_, AppState>) -> serde_json::Value {
    let mut engine = state.gesture_engine.lock().unwrap();
    let decision = engine.tick(now_ms);
    serde_json::to_value(&decision).unwrap_or(serde_json::json!({ "swallow": false, "actions": [], "replay": [] }))
}

#[tauri::command]
fn process_input_event(
    event_type: String,
    vk: Option<u8>,
    button: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    time_ms: Option<u64>,
    dpi_scale: Option<f64>,
    fullscreen_app: Option<bool>,
    state: State<'_, AppState>,
) -> serde_json::Value {
    let mut engine = state.gesture_engine.lock().unwrap();
    let pt = Point::new(x.unwrap_or(0), y.unwrap_or(0));
    let t_ms = time_ms.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    });

    let btn = match button.as_deref() {
        Some("right") => Button::Right,
        Some("middle") => Button::Middle,
        Some("x1") => Button::X1,
        Some("x2") => Button::X2,
        _ => Button::Left,
    };

    let event = match event_type.as_str() {
        "key_down" => InputEvent::KeyDown {
            vk: vk.unwrap_or(0),
            injected: false,
        },
        "key_up" => InputEvent::KeyUp {
            vk: vk.unwrap_or(0),
            injected: false,
        },
        "pointer_down" => InputEvent::PointerDown {
            button: btn,
            point: pt,
            time_ms: t_ms,
            injected: false,
            fullscreen_app: fullscreen_app.unwrap_or(false),
            dpi_scale: dpi_scale.unwrap_or(1.0),
        },
        "pointer_up" => InputEvent::PointerUp {
            button: btn,
            point: pt,
            time_ms: t_ms,
            injected: false,
        },
        "pointer_move" => InputEvent::PointerMove {
            point: pt,
            time_ms: t_ms,
            injected: false,
        },
        _ => return serde_json::json!({ "swallow": false, "actions": [], "replay": [] }),
    };

    let decision = engine.on_event(event);
    serde_json::to_value(&decision).unwrap_or(serde_json::json!({ "swallow": false, "actions": [], "replay": [] }))
}

// MARK: - Remote Authentication (profile-only IPC, secrets stay on the backend)

#[tauri::command]
async fn auth_google_login(state: State<'_, AppState>) -> Result<engine::auth::remote::RemoteUser, String> {
    let auth = state.auth.clone();
    let pending = auth.begin_login()?;
    tauri::async_runtime::spawn_blocking(move || auth.login(pending)).await
        .map_err(|_| "Không hoàn tất được đăng nhập Google.".to_string())?
}

#[tauri::command]
fn auth_google_cancel(state: State<'_, AppState>) { state.auth.cancel(); }

#[tauri::command]
async fn auth_session(state: State<'_, AppState>) -> Result<Option<engine::auth::remote::RemoteUser>, String> {
    let auth = state.auth.clone();
    tauri::async_runtime::spawn_blocking(move || auth.restore()).await
        .map_err(|_| "Không khôi phục được phiên đăng nhập.".to_string())?
}

#[tauri::command]
async fn auth_logout(state: State<'_, AppState>) -> Result<(), String> {
    let auth = state.auth.clone();
    tauri::async_runtime::spawn_blocking(move || auth.logout(false)).await
        .map_err(|_| "Không hoàn tất được đăng xuất.".to_string())?
}

#[tauri::command]
async fn auth_google_discard_cancelled(state: State<'_, AppState>) -> Result<(), String> {
    let auth = state.auth.clone();
    tauri::async_runtime::spawn_blocking(move || auth.logout(true)).await
        .map_err(|_| "Chưa dọn dẹp được phiên đăng nhập đã hủy.".to_string())?
}

// MARK: - Google Calendar Commands

#[tauri::command]
fn google_calendar_status(state: State<'_, AppState>) -> GoogleCalendarAccount {
    state.google_calendar.status()
}

#[tauri::command]
async fn google_calendar_login(
    state: State<'_, AppState>,
) -> Result<GoogleCalendarAccount, String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.login())
        .await
        .map_err(|e| format!("Login task failed: {e}"))?
}

#[tauri::command]
async fn google_calendar_sync(
    state: State<'_, AppState>,
) -> Result<Vec<GoogleCalendarEventDto>, String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.sync_today())
        .await
        .map_err(|e| format!("Sync task failed: {e}"))?
}

#[tauri::command]
async fn google_calendar_disconnect(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.disconnect())
        .await
        .map_err(|e| format!("Disconnect task failed: {e}"))?
}

// MARK: - Gemini Multimodal Live API Key Management

fn resolve_gemini_api_key(memory_key: Option<String>) -> Option<String> {
    if let Some(ref key) = memory_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    std::env::var("GEMINI_API_KEY")
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
}

#[tauri::command]
fn get_gemini_api_key(state: State<'_, AppState>) -> Option<String> {
    let memory_key = state.gemini_api_key.lock().ok().and_then(|g| g.clone());
    resolve_gemini_api_key(memory_key)
}

#[tauri::command]
fn set_gemini_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.gemini_api_key.lock().map_err(|e| e.to_string())?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        *guard = None;
    } else {
        *guard = Some(trimmed.to_string());
    }
    Ok(())
}

// MARK: - Screen Recording permission (Gemini Live screen share)
//
// The webview hands `getDisplayMedia` a stream regardless of TCC; without the
// Screen Recording grant macOS fills it with black frames. These let the UI check
// first and send the user to the right Settings pane instead of sharing black.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Whether this process may capture the screen. Never prompts.
#[tauri::command]
fn check_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: no arguments, no preconditions; available since macOS 10.15.
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Ask macOS for Screen Recording. Shows the system prompt only the first time and
/// returns the current grant; a new grant takes effect after the app restarts.
#[tauri::command]
fn request_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: as above; runs on the main thread like every sync command.
        unsafe { CGRequestScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
async fn open_screen_capture_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            std::process::Command::new("/usr/bin/open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
                .status()
                .map_err(|e| e.to_string())?
                .success()
                .then_some(())
                .ok_or_else(|| "Không mở được System Settings".to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// One JPEG of the main display, base64-encoded.
///
/// WKWebView's `getDisplayMedia` hands this app a stream of black frames even with the
/// Screen Recording grant in place, so the frames Gemini sees come from the system
/// capture tool instead — it runs as a child of this app and inherits its TCC grant.
// ponytail: main display only; add a display argument if multi-monitor picking is wanted.
fn capture_main_display_jpeg() -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let path = std::env::temp_dir().join(format!("rust-sound-screen-{}.jpg", std::process::id()));
    let ok = std::process::Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", "jpg", "-D", "1"])
        .arg(&path)
        .status()
        .map_err(|e| format!("Không chạy được screencapture: {}", e))?
        .success();
    if !ok {
        return Err("screencapture không chụp được màn hình".to_string());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Không đọc được khung hình: {}", e))?;
    let _ = std::fs::remove_file(&path);
    if bytes.is_empty() {
        return Err("Khung hình chụp được rỗng".to_string());
    }
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
async fn capture_screen_jpeg() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(capture_main_display_jpeg)
        .await
        .map_err(|e| e.to_string())?
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


#[tauri::command]
async fn set_app_volume(bundle_id: String, volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) { return Err("Volume must be between 0 and 1".into()); }
    let effective = {
        let mut router = state.router.lock().unwrap();
        let muted = router.get_or_create_channel(&bundle_id).muted;
        if muted { 0.0 } else { volume }
    };
    if bundle_id == "com.spotify.client" {
        let web = state.spotify.web.clone();
        tauri::async_runtime::spawn_blocking(move || if web.connected() { web.set_volume(effective) } else { core::spotify::set_volume(effective) }).await.map_err(|e| e.to_string())??;
    } else {
        AudioProcess::set_app_volume(&bundle_id, effective);
    }
    state.router.lock().unwrap().set_app_volume(&bundle_id, volume);
    Ok(())
}

/// Đưa tiếng của một ứng dụng qua rust-sound, để thanh trượt và EQ chạm được vào nó.
/// Chỉ một app tại một thời điểm: app đang tap trước đó được trả về đường phát thường.
#[tauri::command]
async fn tap_app(bundle_id: String, state: State<'_, AppState>) -> Result<(), String> {
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
fn untap_app(state: State<'_, AppState>) -> Result<(), String> {
    state.app_tap.stop();
    Ok(())
}

#[tauri::command]
fn app_tap_status(state: State<'_, AppState>) -> app_tap::AppTapStatus {
    state.app_tap.status()
}

#[tauri::command]
async fn set_app_mute(bundle_id: String, muted: bool, state: State<'_, AppState>) -> Result<(), String> {
    let vol = if muted { 0.0 } else { state.router.lock().unwrap().get_or_create_channel(&bundle_id).volume };
    if bundle_id == "com.spotify.client" {
        let web = state.spotify.web.clone();
        tauri::async_runtime::spawn_blocking(move || if web.connected() { web.set_volume(vol) } else { core::spotify::set_volume(vol) }).await.map_err(|e| e.to_string())??;
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
fn set_app_eq_band(
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
    if band_index >= 10 || !gain_db.is_finite() || !(-24.0..=24.0).contains(&gain_db) {
        return Err("Invalid EQ band or gain".into());
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

// MARK: - Native Break Overlay Window Manager

pub fn open_break_overlays(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Ok(());
    }

    for (idx, mon) in monitors.iter().enumerate() {
        let label = format!("break-overlay-{}", idx);
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();

        let logical_pos = tauri::LogicalPosition::new(
            pos.x as f64 / scale,
            pos.y as f64 / scale,
        );
        let logical_size = tauri::LogicalSize::new(
            size.width as f64 / scale,
            size.height as f64 / scale,
        );

        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_position(logical_pos);
            let _ = win.set_size(logical_size);
            let _ = win.show();
            if idx == 0 {
                let _ = win.set_focus();
            }
            continue;
        }

        let is_primary = idx == 0;
        let init_script = format!(
            "window.__IS_BREAK_OVERLAY__ = true; window.__BREAK_OVERLAY_PRIMARY__ = {}; window.__TAURI_WINDOW_LABEL__ = '{}';",
            is_primary, label
        );

        let win = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App(format!("index.html?break_overlay=1&primary={}&idx={}", is_primary, idx).into()),
        )
        .title("Rust Sound Break Overlay")
        .inner_size(logical_size.width, logical_size.height)
        .position(logical_pos.x, logical_pos.y)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .initialization_script(&init_script)
        .build()
        .map_err(|e| format!("Failed to create break overlay window {}: {e}", label))?;

        #[cfg(target_os = "macos")]
        {
            use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};
            if let Ok(ns_win_ptr) = win.ns_window() {
                unsafe {
                    let ns_win: &NSWindow = &*(ns_win_ptr as *const NSWindow);
                    ns_win.setOpaque(false);
                    ns_win.setHasShadow(false);
                    ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
                    ns_win.setLevel(1000); // .screenSaver window level
                    ns_win.setCollectionBehavior(
                        NSWindowCollectionBehavior::CanJoinAllSpaces
                            | NSWindowCollectionBehavior::FullScreenAuxiliary,
                    );
                    ns_win.orderFrontRegardless();
                }
            }
        }

        let _ = win.show();
        if is_primary {
            let _ = win.set_focus();
        }
    }

    Ok(())
}

pub fn close_break_overlays(app: &tauri::AppHandle) {
    use tauri::Manager;
    for (label, win) in app.webview_windows() {
        if label.starts_with("break-overlay-") {
            let _ = win.close();
        }
    }
}

// MARK: - Break Timer & Todo IPC Commands

#[tauri::command]
fn start_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.start();
    timer.get_status()
}

#[tauri::command]
fn stop_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.stop(Some(&mut router));
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
fn skip_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.skip(Some(&mut router));
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
fn snooze_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.snooze();
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
fn get_break_timer_status(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    let transition = timer.tick(Some(&mut router));

    if let Some(new_phase) = transition {
        if new_phase == TimerPhase::Breaking {
            if timer.is_screen_lock_enabled() {
                let _ = open_break_overlays(&app);
                state.input_blocker.install();
            }
        } else if timer.phase != TimerPhase::Breaking {
            close_break_overlays(&app);
            state.input_blocker.uninstall();
        }
    }

    timer.get_status()
}

#[tauri::command]
fn sync_break_screen_lock(
    enabled: bool,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let mut timer = state.timer.lock().unwrap();
    timer.set_screen_lock_enabled(enabled);
    if timer.phase == TimerPhase::Breaking {
        if enabled {
            let _ = open_break_overlays(&app);
            state.input_blocker.install();
        } else {
            close_break_overlays(&app);
            state.input_blocker.uninstall();
        }
    }
    Ok(enabled)
}

#[tauri::command]
fn get_break_screen_lock_status(state: State<'_, AppState>) -> bool {
    let timer = state.timer.lock().unwrap();
    timer.is_screen_lock_enabled()
}

#[tauri::command]
fn check_accessibility_permission(state: State<'_, AppState>) -> bool {
    #[cfg(target_os = "macos")]
    {
        let _ = &state;
        pingloom::is_accessibility_trusted(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        state.input_blocker.is_accessibility_trusted(false)
    }
}

#[tauri::command]
fn request_accessibility_permission(state: State<'_, AppState>) -> bool {
    #[cfg(target_os = "macos")]
    {
        let _ = &state;
        pingloom::is_accessibility_trusted(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        state.input_blocker.is_accessibility_trusted(true)
    }
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

#[tauri::command]
fn update_dock_icon(app_handle: tauri::AppHandle, icon_png_base64: String) -> Result<bool, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    // Strip data URL prefix if present
    let raw_b64 = if let Some(idx) = icon_png_base64.find(',') {
        &icon_png_base64[idx + 1..]
    } else {
        &icon_png_base64
    };

    let png_bytes = STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("Invalid base64 icon data: {}", e))?;

    if png_bytes.is_empty() {
        return Err("Empty icon byte stream".into());
    }

    // Update Tauri window icon if accessible
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            if let Ok(img) = tauri::image::Image::from_bytes(&png_bytes) {
                let _ = window.set_icon(img);
            }
        }

        // Dynamically update macOS application Dock icon in real time
        unsafe {
            use objc2::AnyThread;
            use objc2_app_kit::{NSApplication, NSImage};
            use objc2_foundation::{MainThreadMarker, NSData};

            if let Some(mtm) = MainThreadMarker::new() {
                let ns_data = NSData::with_bytes(&png_bytes);
                let ns_image = NSImage::initWithData(NSImage::alloc(), &ns_data);
                if let Some(image) = ns_image {
                    NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image));
                    return Ok(true);
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
    }

    Ok(true)
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
    let auth = Arc::new(engine::auth::remote::RemoteAuth::new(option_env!("RUST_SOUND_AUTH_URL").unwrap_or("")));
    let pet = PetManager::new();
    pet.start_daemon();
    let input_blocker = InputBlocker::new();

    let state = AppState {
        router: Arc::new(Mutex::new(router)),
        spotify: spotify::SpotifyIntegration::default(),
        app_tap: app_tap::AppTap::new(),
        preset_store: Mutex::new(preset_store),
        timer: Mutex::new(timer),
        auth,
        pet,
        wheel_settings: Mutex::new(PingloomSettings::default()),
        gesture_engine: Mutex::new(GestureEngine::default()),
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
        input_blocker,
        #[cfg(target_os = "macos")]
        gesture_listener: Mutex::new(None),
        gemini_api_key: Mutex::new(std::env::var("GEMINI_API_KEY").ok().filter(|k| !k.trim().is_empty())),
        google_calendar: Arc::new(engine::GoogleCalendarService::default()),
    };

    let app = tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            pet_notification_status,
            request_pet_notification_permission,
            send_pet_notification,
            get_spotify_status,
            get_spotify_spectrum,
            connect_spotify_audio,
            spotify_control,
            spotify_account,
            spotify_login,
            spotify_logout,
            spotify_browse,
            spotify_devices,
            spotify_select_device,
            spotify_play_uri,
            spotify_play_tracks,
            spotify_set_shuffle,
            spotify_set_repeat,
            spotify_local_player,
            spotify_playback_login,
            spotify_playback_connected,
            spotify_open_automation_settings,
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
            tap_app,
            untap_app,
            app_tap_status,
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
            sync_break_screen_lock,
            get_break_screen_lock_status,
            check_accessibility_permission,
            request_accessibility_permission,
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
            auth_google_cancel,
            auth_google_discard_cancelled,
            auth_session,
            auth_logout,
            get_gemini_api_key,
            set_gemini_api_key,
            check_screen_capture_permission,
            request_screen_capture_permission,
            open_screen_capture_settings,
            capture_screen_jpeg,
            get_pet_care_state,
            get_pet_activity_theme,
            set_pet_activity_theme,
            format_tool_activity,
            feed_pet_action,
            reset_pet_care_state,
            get_agent_sessions,
            show_main_window,
            quit_app,
            dismiss_agent_session,
            get_agent_integrations,
            toggle_agent_hook,
            open_pet_overlay,
            close_pet_overlay,
            toggle_pet_overlay,
            is_pet_overlay_open,
            open_pet_popover,
            close_pet_popover,
            toggle_pet_popover,
            is_pet_popover_open,
            clear_agent_sessions,
            update_tray_title,
            open_ping_overlay,
            close_ping_overlay,
            toggle_ping_overlay,
            is_ping_overlay_open,
            get_ping_settings,
            save_ping_settings,
            get_pingloom_settings,
            save_pingloom_settings,
            get_ping_catalog,
            simulate_ping_gesture,
            get_gesture_state,
            toggle_gesture_engine,
            tick_gesture_engine,
            process_input_event,
            get_audio_filter_settings,
            set_audio_filter_settings,
            test_filter_audio_buffer,
            get_virtual_audio_status,
            update_dock_icon,
            play_ping_sound,
            get_pingloom_assets_manifest,
            google_calendar_status,
            google_calendar_login,
            google_calendar_sync,
            google_calendar_disconnect
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("Could not hide main window: {error}");
                    }
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                let state = app.state::<AppState>();
                state.spotify.start(state.router.clone());
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
                        let _ = window.set_icon(icon);
                    }
                }

                // macOS Status Bar Menu Item (AgentPet Tray Icon)
                {
                    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                    let app_handle_for_tray = app.handle().clone();
                    if let Ok(tray_img) = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                        let _ = TrayIconBuilder::with_id("agentpet-tray")
                            .icon(tray_img)
                            .icon_as_template(true)
                            .title("AgentPet")
                            .tooltip("AgentPet Companion & Monitor")
                            .on_tray_icon_event(move |_tray, event| {
                                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, .. }
                                    | TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Up, position, .. } = event
                                {
                                    let scale = app_handle_for_tray.monitor_from_point(position.x, position.y)
                                        .ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
                                    let anchor = tray_popover_anchor(position, scale);
                                    let _ = toggle_pet_popover(app_handle_for_tray.clone(), Some(anchor.x), Some(anchor.y));
                                }
                            })
                            .build(app);
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

                // Native Pingloom EventTap gesture monitor
                {
                    use tauri::Emitter;

                    let app_handle_for_pingloom = app.handle().clone();
                    let callback: pingloom::ActionCallback = Arc::new(move |action, origin, scale| {
                        let action_type = match &action {
                            pingloom::Action::WheelOpen { .. } => "wheel_open",
                            pingloom::Action::WheelMove { .. } => "wheel_slice",
                            pingloom::Action::Select { .. } => "select",
                            pingloom::Action::Click { .. } => "click",
                            pingloom::Action::Cancel => "wheel_close",
                            pingloom::Action::Toggled { .. } => "toggled",
                            pingloom::Action::Sound { .. } => "sound",
                        };
                        let action_payload = serde_json::json!({
                            "action": action,
                            "origin": origin,
                            "scale": scale,
                            "event_type": action_type,
                        });
                        let _ = app_handle_for_pingloom.emit("pingloom:action", &action_payload);

                        // Trigger audio sound playback for Select, Sound, and Click actions
                        match &action {
                            pingloom::Action::Select { wheel, slot, .. } => {
                                use tauri::Manager;
                                if let Some(state) = app_handle_for_pingloom.try_state::<AppState>() {
                                    let settings = state.wheel_settings.lock().unwrap().clone();
                                    if !settings.muted {
                                        let sound_opt = match wheel {
                                            pingloom::WheelKind::Ping => {
                                                settings.wheel.get(*slot).cloned()
                                            }
                                            pingloom::WheelKind::Emote => {
                                                if settings.emote_sound {
                                                    settings.emote_wheel.get(*slot).cloned()
                                                } else {
                                                    None
                                                }
                                            }
                                        };
                                        if let Some(sound_name) = sound_opt {
                                            let vol = Some(settings.volume as f32 / 100.0);
                                            if let Ok(path) = trigger_ping_sound(&sound_name, vol) {
                                                let _ = app_handle_for_pingloom.emit("pingloom:sound", serde_json::json!({
                                                    "sound": sound_name,
                                                    "path": path.to_string_lossy(),
                                                    "volume": vol.unwrap_or(0.75),
                                                }));
                                            }
                                        }
                                    }
                                }
                            }
                            pingloom::Action::Sound { sound } => {
                                use tauri::Manager;
                                if let Some(state) = app_handle_for_pingloom.try_state::<AppState>() {
                                    let settings = state.wheel_settings.lock().unwrap().clone();
                                    if !settings.muted {
                                        let vol = Some(settings.volume as f32 / 100.0);
                                        if let Ok(path) = trigger_ping_sound(sound, vol) {
                                            let _ = app_handle_for_pingloom.emit("pingloom:sound", serde_json::json!({
                                                "sound": sound,
                                                "path": path.to_string_lossy(),
                                                "volume": vol.unwrap_or(0.75),
                                            }));
                                        }
                                    }
                                }
                            }
                            pingloom::Action::Click { wheel, .. } => {
                                use tauri::Manager;
                                if let Some(state) = app_handle_for_pingloom.try_state::<AppState>() {
                                    let settings = state.wheel_settings.lock().unwrap().clone();
                                    if !settings.muted {
                                        let sound_opt = match wheel {
                                            pingloom::WheelKind::Ping => {
                                                if settings.click_ping {
                                                    Some(settings.click_ping_id.clone())
                                                } else {
                                                    None
                                                }
                                            }
                                            pingloom::WheelKind::Emote => {
                                                if settings.emote_click && settings.emote_sound {
                                                    Some(settings.click_emote_id.clone())
                                                } else {
                                                    None
                                                }
                                            }
                                        };
                                        if let Some(sound_name) = sound_opt {
                                            let vol = Some(settings.volume as f32 / 100.0);
                                            if let Ok(path) = trigger_ping_sound(&sound_name, vol) {
                                                let _ = app_handle_for_pingloom.emit("pingloom:sound", serde_json::json!({
                                                    "sound": sound_name,
                                                    "path": path.to_string_lossy(),
                                                    "volume": vol.unwrap_or(0.75),
                                                }));
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    });

                    let mut default_settings = pingloom::Settings::default();
                    default_settings.game_check = false;
                    eprintln!("[Pingloom] Starting gesture monitor with default settings: trigger={:?}, emote={:?}, threshold={}", default_settings.trigger, default_settings.emote_trigger, default_settings.drag_threshold_px);
                    match pingloom::start_gesture_monitor(default_settings, callback) {
                        Ok(listener) => {
                            use tauri::Manager;
                            eprintln!("[Pingloom] NativeGestureListener successfully attached to event tap.");
                            if let Some(state) = app.try_state::<AppState>() {
                                *state.gesture_listener.lock().unwrap() = Some(listener);
                            }
                        }
                        Err(err) => {
                            eprintln!("[Pingloom] Failed to initialize NativeGestureListener: {}", err);
                        }
                    }

                    // Automatically initialize click-through transparent desktop overlay
                    let app_handle_overlay = app.handle().clone();
                    if let Err(e) = open_ping_overlay(app_handle_overlay) {
                        eprintln!("Failed to auto-open ping overlay: {}", e);
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Err(error) = show_main_window(app_handle.clone()) {
                eprintln!("Could not reopen main window: {error}");
            }
        }
        if let tauri::RunEvent::Exit = event {
            use tauri::Manager;
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.spotify.stop();
                state.pet.stop_daemon();
                state.input_blocker.uninstall();
                #[cfg(target_os = "macos")]
                if let Ok(mut guard) = state.gesture_listener.lock() {
                    if let Some(mut listener) = guard.take() {
                        listener.stop();
                    }
                }
            }
            close_break_overlays(app_handle);
        }
    });
}




#[cfg(test)]
mod pet_tray_tests {
    /// The share Gemini sees is this JPEG, so a capture that returns nothing or
    /// something that is not a JPEG is the whole feature broken.
    #[test]
    fn native_screen_capture_returns_a_jpeg() {
        if !super::check_screen_capture_permission() {
            eprintln!("skipped: no Screen Recording grant for the test runner");
            return;
        }
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;

        let base64_jpeg = super::capture_main_display_jpeg().expect("capture failed");
        let bytes = STANDARD.decode(base64_jpeg).expect("not valid base64");
        assert!(bytes.len() > 1024, "frame too small: {} bytes", bytes.len());
        assert_eq!(&bytes[..3], &[0xFF, 0xD8, 0xFF], "not a JPEG");
    }

    #[test]
    fn retina_tray_anchor_uses_logical_offsets() {
        let anchor = super::tray_popover_anchor(tauri::PhysicalPosition::new(2000.0, 40.0), 2.0);
        assert_eq!((anchor.x, anchor.y), (840.0, 30.0));
    }

    #[test]
    fn gemini_api_key_resolution_and_state() {
        assert_eq!(
            super::resolve_gemini_api_key(Some("test-gemini-key".to_string())),
            Some("test-gemini-key".to_string())
        );
        assert_eq!(super::resolve_gemini_api_key(Some("   ".to_string())), None);

        let memory = std::sync::Mutex::new(None);
        {
            let mut guard = memory.lock().unwrap();
            let trimmed = "my-secret-key".trim();
            *guard = Some(trimmed.to_string());
        }
        assert_eq!(memory.lock().unwrap().as_deref(), Some("my-secret-key"));

        {
            let mut guard = memory.lock().unwrap();
            let trimmed = "".trim();
            if trimmed.is_empty() {
                *guard = None;
            }
        }
        assert_eq!(memory.lock().unwrap().as_deref(), None);
    }
}
