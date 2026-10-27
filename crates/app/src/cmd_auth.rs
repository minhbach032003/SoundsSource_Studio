use tauri::State;
use crate::AppState;

// MARK: - Remote Authentication (profile-only IPC, secrets stay on the backend)

#[tauri::command]
pub async fn auth_google_login(state: State<'_, AppState>) -> Result<sound_engine::auth::remote::RemoteUser, String> {
    let auth = state.auth.clone();
    let pending = auth.begin_login()?;
    let user = tauri::async_runtime::spawn_blocking(move || auth.login(pending)).await
        .map_err(|_| "Không hoàn tất được đăng nhập Google.".to_string())??;

    // Trigger cloud synchronization of companion progress
    let auth_sync = state.auth.clone();
    let pet = state.pet.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let local_doc = pet.get_care_document();
        if let Ok(Some(remote_doc)) = auth_sync.sync_pet_progress(&local_doc) {
            pet.merge_and_save_care_document(remote_doc);
        }
    }).await;

    Ok(user)
}

#[tauri::command]
pub fn auth_google_cancel(state: State<'_, AppState>) { state.auth.cancel(); }

#[tauri::command]
pub async fn auth_session(state: State<'_, AppState>) -> Result<Option<sound_engine::auth::remote::RemoteUser>, String> {
    let auth = state.auth.clone();
    let user = tauri::async_runtime::spawn_blocking(move || auth.restore()).await
        .map_err(|_| "Không khôi phục được phiên đăng nhập.".to_string())??;

    if user.is_some() {
        let auth_sync = state.auth.clone();
        let pet = state.pet.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            let local_doc = pet.get_care_document();
            if let Ok(Some(remote_doc)) = auth_sync.sync_pet_progress(&local_doc) {
                pet.merge_and_save_care_document(remote_doc);
            }
        }).await;
    }

    Ok(user)
}

#[tauri::command]
pub async fn auth_sync_pet_progress(state: State<'_, AppState>) -> Result<crate::PetCareStateDto, String> {
    let auth = state.auth.clone();
    let pet = state.pet.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let local_doc = pet.get_care_document();
        if let Ok(Some(remote_doc)) = auth.sync_pet_progress(&local_doc) {
            pet.merge_and_save_care_document(remote_doc);
        }
        pet.get_care_state().into()
    }).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_logout(state: State<'_, AppState>) -> Result<(), String> {
    let auth = state.auth.clone();
    tauri::async_runtime::spawn_blocking(move || auth.logout(false)).await
        .map_err(|_| "Không hoàn tất được đăng xuất.".to_string())?
}

#[tauri::command]
pub async fn auth_google_discard_cancelled(state: State<'_, AppState>) -> Result<(), String> {
    let auth = state.auth.clone();
    tauri::async_runtime::spawn_blocking(move || auth.logout(true)).await
        .map_err(|_| "Chưa dọn dẹp được phiên đăng nhập đã hủy.".to_string())?
}

// MARK: - Gemini Multimodal Live API Key Management

pub fn resolve_gemini_api_key(memory_key: Option<String>) -> Option<String> {
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
pub fn get_gemini_api_key(state: State<'_, AppState>) -> Option<String> {
    let memory_key = state.gemini_api_key.lock().ok().and_then(|g| g.clone());
    resolve_gemini_api_key(memory_key)
}

#[tauri::command]
pub fn set_gemini_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.gemini_api_key.lock().map_err(|e| e.to_string())?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        *guard = None;
    } else {
        *guard = Some(trimmed.to_string());
    }
    Ok(())
}
