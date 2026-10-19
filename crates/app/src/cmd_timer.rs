use tauri::State;
use crate::AppState;
use sound_engine::{TimerPhase, TimerStatus, TodoItem};

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
pub fn start_break_timer(state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.start();
    timer.get_status()
}

#[tauri::command]
pub fn stop_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.stop(Some(&mut router));
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
pub fn skip_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    let mut router = state.router.lock().unwrap();
    timer.skip(Some(&mut router));
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
pub fn snooze_break_timer(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.snooze();
    close_break_overlays(&app);
    state.input_blocker.uninstall();
    timer.get_status()
}

#[tauri::command]
pub fn get_break_timer_status(state: State<'_, AppState>, app: tauri::AppHandle) -> TimerStatus {
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
pub fn sync_break_screen_lock(
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
pub fn get_break_screen_lock_status(state: State<'_, AppState>) -> bool {
    let timer = state.timer.lock().unwrap();
    timer.is_screen_lock_enabled()
}

#[tauri::command]
pub fn set_timer_durations(study_sec: u64, break_sec: u64, state: State<'_, AppState>) -> TimerStatus {
    let mut timer = state.timer.lock().unwrap();
    timer.set_durations(study_sec, break_sec);
    timer.get_status()
}

#[tauri::command]
pub fn add_todo_item(
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
pub fn toggle_todo_item(id: String, state: State<'_, AppState>) -> Vec<TodoItem> {
    let mut timer = state.timer.lock().unwrap();
    timer.toggle_todo(&id);
    timer.get_todos().to_vec()
}

#[tauri::command]
pub fn delete_todo_item(id: String, state: State<'_, AppState>) -> Vec<TodoItem> {
    let mut timer = state.timer.lock().unwrap();
    timer.delete_todo(&id);
    timer.get_todos().to_vec()
}

#[tauri::command]
pub fn get_todo_items(state: State<'_, AppState>) -> Vec<TodoItem> {
    let timer = state.timer.lock().unwrap();
    timer.get_todos().to_vec()
}
