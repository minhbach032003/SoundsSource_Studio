use tauri::State;
use crate::AppState;
use sound_engine::{GoogleCalendarAccount, GoogleCalendarEventDto};

// MARK: - Google Calendar Commands

#[tauri::command]
pub fn google_calendar_status(state: State<'_, AppState>) -> GoogleCalendarAccount {
    state.google_calendar.status()
}

#[tauri::command]
pub async fn google_calendar_login(
    state: State<'_, AppState>,
) -> Result<GoogleCalendarAccount, String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.login())
        .await
        .map_err(|e| format!("Login task failed: {e}"))?
}

#[tauri::command]
pub fn google_calendar_cancel(state: State<'_, AppState>) {
    state.google_calendar.cancel();
}

#[tauri::command]
pub async fn google_calendar_sync(
    state: State<'_, AppState>,
) -> Result<Vec<GoogleCalendarEventDto>, String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.sync_today())
        .await
        .map_err(|e| format!("Sync task failed: {e}"))?
}

#[tauri::command]
pub async fn google_calendar_disconnect(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let service = state.google_calendar.clone();
    tauri::async_runtime::spawn_blocking(move || service.disconnect())
        .await
        .map_err(|e| format!("Disconnect task failed: {e}"))?
}
