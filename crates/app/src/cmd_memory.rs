//! Tauri surface for the memory cleaner. All behaviour lives in `sound_core::memory` and
//! `sound_core::memory_cleaner`; this file only crosses the IPC boundary.

use crate::AppState;
use sound_core::memory;
use sound_core::memory_cleaner::MemoryAutoStatus;
use sound_core::{AutoCleanPolicy, MemoryArea, MemoryCleanReport, MemoryRunRecord, MemorySnapshot};
use tauri::State;

#[tauri::command]
pub fn memory_snapshot() -> MemorySnapshot {
    memory::snapshot()
}

/// Which levers this machine actually has. The UI renders the list rather than hardcoding
/// one, so a Windows build never shows `purge` and a macOS build never shows a standby
/// list that does not exist here.
#[tauri::command]
pub fn memory_areas() -> Vec<MemoryArea> {
    memory::areas()
}

/// `allow_prompt` is the user saying yes to an authentication dialog in advance. The
/// scheduler always passes false; only an explicit button press passes true.
#[tauri::command]
pub async fn memory_clean(
    area_ids: Vec<String>,
    allow_prompt: bool,
    state: State<'_, AppState>,
) -> Result<MemoryCleanReport, String> {
    let cleaner = state.memory.clone();
    tauri::async_runtime::spawn_blocking(move || cleaner.run_now(&area_ids, allow_prompt))
        .await
        .map_err(|e| format!("Memory clean failed: {e}"))
}

#[tauri::command]
pub fn memory_auto_policy(state: State<'_, AppState>) -> AutoCleanPolicy {
    state.memory.policy()
}

/// Returns the stored policy, which is the sanitized form of what was sent: the UI shows
/// what will run, not what it asked for.
#[tauri::command]
pub fn memory_set_auto_policy(
    policy: AutoCleanPolicy,
    state: State<'_, AppState>,
) -> AutoCleanPolicy {
    state.memory.set_policy(&policy)
}

/// The policy, what the scheduler would do right now and why, and the run log.
#[tauri::command]
pub async fn memory_auto_status(state: State<'_, AppState>) -> Result<MemoryAutoStatus, String> {
    let cleaner = state.memory.clone();
    // Reading the snapshot touches the kernel, so keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(move || cleaner.status())
        .await
        .map_err(|e| format!("Could not read the memory cleaner status: {e}"))
}

#[tauri::command]
pub fn memory_run_history(state: State<'_, AppState>) -> Vec<MemoryRunRecord> {
    state.memory.history()
}
