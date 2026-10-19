use std::path::{Path, PathBuf};
use tauri::State;
use crate::AppState;
use sound_engine::{
    Button, CatalogEntry, GestureResult, GestureState, InputEvent,
    PingloomSettings, Point,
};

#[tauri::command]
pub fn open_ping_overlay(app: tauri::AppHandle) -> Result<bool, String> {
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
pub fn close_ping_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("ping-overlay") {
        let _ = win.hide();
        Ok(false)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn toggle_ping_overlay(app: tauri::AppHandle, enable: Option<bool>) -> Result<bool, String> {
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
pub fn is_ping_overlay_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("ping-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn get_ping_settings(state: State<'_, AppState>) -> PingloomSettings {
    state.wheel_settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_ping_settings(settings: PingloomSettings, state: State<'_, AppState>) -> Result<PingloomSettings, String> {
    settings.validate()?;
    let mut current = state.wheel_settings.lock().unwrap();
    *current = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub fn get_pingloom_settings(state: State<'_, AppState>) -> PingloomSettings {
    get_ping_settings(state)
}

#[tauri::command]
pub fn save_pingloom_settings(settings: PingloomSettings, state: State<'_, AppState>) -> Result<PingloomSettings, String> {
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
pub fn play_ping_sound(sound: String, app_handle: tauri::AppHandle) -> Result<bool, String> {
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
pub fn get_pingloom_assets_manifest() -> Result<serde_json::Value, String> {
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
pub fn get_ping_catalog() -> Vec<CatalogEntry> {
    sound_engine::wheel::get_default_catalog()
}

#[tauri::command]
pub fn simulate_ping_gesture(dx: f64, dy: f64, state: State<'_, AppState>) -> Option<GestureResult> {
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
pub fn get_gesture_state(state: State<'_, AppState>) -> String {
    match state.gesture_engine.lock().unwrap().state() {
        GestureState::Idle => "idle".to_string(),
        GestureState::Pending => "pending".to_string(),
        GestureState::Wheel => "wheel".to_string(),
        GestureState::SwallowUp => "swallow_up".to_string(),
    }
}

#[tauri::command]
pub fn toggle_gesture_engine(enable: Option<bool>, state: State<'_, AppState>) -> bool {
    let mut engine = state.gesture_engine.lock().unwrap();
    let target = enable.unwrap_or(!engine.enabled());
    let _ = engine.set_enabled(target);
    engine.enabled()
}

#[tauri::command]
pub fn tick_gesture_engine(now_ms: u64, state: State<'_, AppState>) -> serde_json::Value {
    let mut engine = state.gesture_engine.lock().unwrap();
    let decision = engine.tick(now_ms);
    serde_json::to_value(&decision).unwrap_or(serde_json::json!({ "swallow": false, "actions": [], "replay": [] }))
}

#[tauri::command]
pub fn process_input_event(
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
