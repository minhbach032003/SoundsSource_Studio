pub mod app_tap;
pub mod cmd_audio;
pub mod cmd_auth;
pub mod cmd_calendar;
pub mod cmd_pet;
pub mod cmd_system;
pub mod cmd_timer;
pub mod cmd_wheel;
pub mod spotify;
pub mod spotify_sink;

pub use cmd_audio::*;
pub use cmd_auth::*;
pub use cmd_calendar::*;
pub use cmd_pet::*;
pub use cmd_system::*;
pub use cmd_timer::*;
pub use cmd_wheel::*;
pub use spotify::*;

pub use sound_core as core;
pub use sound_engine as engine;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub use core::{
    get_memory_info, should_suppress_event, trim_memory_cache, AudioProcess,
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
