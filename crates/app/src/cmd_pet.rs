use std::sync::Mutex;
use tauri::State;
use crate::{AppState, PetCareStateDto};
use sound_engine::{ActivityFormatter, ActivityTheme, AgentIntegrationInfo, AgentSession};

// MARK: - AgentPet Companion Commands

fn pet_notification_window(window: &tauri::WebviewWindow, request: bool) -> Result<(), String> {
    if window.label() == "main" || (!request && window.label() == "pet-overlay") { Ok(()) }
    else { Err("AgentPet notifications are not available in this window".into()) }
}

#[tauri::command]
pub async fn pet_notification_status(window: tauri::WebviewWindow) -> Result<String, String> {
    pet_notification_window(&window, false)?;
    sound_core::pet_notifications::status().await
}

#[tauri::command]
pub async fn request_pet_notification_permission(window: tauri::WebviewWindow) -> Result<String, String> {
    pet_notification_window(&window, true)?;
    sound_core::pet_notifications::request().await
}

#[tauri::command]
pub async fn send_pet_notification(window: tauri::WebviewWindow, title: String, body: String) -> Result<(), String> {
    pet_notification_window(&window, false)?;
    if title.trim().is_empty() || title.chars().count() > 200 || body.chars().count() > 1000 {
        return Err("Notification title/body exceeds allowed length".into());
    }
    sound_core::pet_notifications::send(title, body).await
}

static ACTIVE_PET_THEME: Mutex<Option<ActivityTheme>> = Mutex::new(None);

#[tauri::command]
pub fn get_pet_activity_theme() -> String {
    let guard = ACTIVE_PET_THEME.lock().unwrap();
    guard.unwrap_or_default().display_name().to_string()
}

#[tauri::command]
pub fn set_pet_activity_theme(theme: String) -> String {
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
pub fn format_tool_activity(
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
pub fn get_pet_care_state(state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.get_care_state().into()
}

#[tauri::command]
pub fn feed_pet_action(action: String, state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.apply_care_action(&action).into()
}

#[tauri::command]
pub fn reset_pet_care_state(state: State<'_, AppState>) -> PetCareStateDto {
    state.pet.reset_care_state().into()
}

#[tauri::command]
pub fn get_agent_sessions(state: State<'_, AppState>) -> Vec<AgentSession> {
    state.pet.get_sessions()
}

#[tauri::command]
pub fn dismiss_agent_session(id: String, state: State<'_, AppState>) {
    state.pet.dismiss_session(&id);
}

#[tauri::command]
pub fn clear_agent_sessions(state: State<'_, AppState>) -> Result<bool, String> {
    state.pet.clear_sessions();
    Ok(true)
}

#[tauri::command]
pub fn get_agent_integrations(state: State<'_, AppState>) -> Vec<AgentIntegrationInfo> {
    state.pet.get_integrations()
}

#[tauri::command]
pub fn toggle_agent_hook(kind: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state.pet.toggle_hook(&kind, enabled)
}

// Tauri/tao show() calls makeKeyAndOrderFront on macOS, even for focused(false).
// Use native non-key ordering on the UI thread for automatic companion display.
pub fn show_pet_without_focus(win: tauri::WebviewWindow) -> Result<(), String> {
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

pub fn tray_popover_anchor(position: tauri::PhysicalPosition<f64>, scale: f64) -> tauri::LogicalPosition<f64> {
    let logical = position.to_logical::<f64>(scale);
    tauri::LogicalPosition::new(logical.x - 160.0, logical.y + 10.0)
}

#[tauri::command]
pub fn open_pet_overlay(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
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
pub fn close_pet_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("pet-overlay") {
        win.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn toggle_pet_overlay(app: tauri::AppHandle, enable: Option<bool>, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
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
pub fn is_pet_overlay_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("pet-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn open_pet_popover(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
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
pub fn close_pet_popover(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("pet-popover") {
        let _ = win.hide();
    }
    Ok(false)
}

#[tauri::command]
pub fn toggle_pet_popover(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<bool, String> {
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
pub fn is_pet_popover_open(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("pet-popover")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn update_tray_title(app: tauri::AppHandle, title: String) -> Result<bool, String> {
    if let Some(tray) = app.tray_by_id("agentpet-tray") {
        let _ = tray.set_title(if title.is_empty() { None } else { Some(&title) });
    }
    Ok(true)
}
