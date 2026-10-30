//! Main-window-only, ephemeral consent for native desktop actions.
use sound_core::desktop::{DesktopAction, DesktopResult, PreparedDesktopAction};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct DesktopControl(Arc<Mutex<Control>>);
struct Control<T = PreparedDesktopAction> {
    enabled: bool,
    generation: u64,
    next_id: u64,
    preparing: bool,
    pending: Option<Pending<T>>,
}
impl<T> Default for Control<T> {
    fn default() -> Self {
        Self {
            enabled: false,
            generation: 0,
            next_id: 0,
            preparing: false,
            pending: None,
        }
    }
}
struct Pending<T> {
    id: String,
    expires: Instant,
    action: T,
}
#[derive(serde::Serialize)]
pub struct DesktopApproval {
    id: String,
    description: String,
    target: String,
}

fn main_only(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("Desktop Control chỉ khả dụng trong cửa sổ chính.".into())
    }
}
impl<T> Control<T> {
    fn cancel(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.pending = None;
        self.preparing = false;
    }
    fn reserve(&mut self) -> Result<(u64, String), String> {
        if !self.enabled {
            return Err("Desktop Control đang tắt.".into());
        }
        if self
            .pending
            .as_ref()
            .is_some_and(|p| p.expires <= Instant::now())
        {
            self.pending = None;
        }
        if self.preparing || self.pending.is_some() {
            return Err("Đang chờ duyệt một thao tác khác.".into());
        }
        self.preparing = true;
        self.next_id = self.next_id.wrapping_add(1);
        Ok((
            self.generation,
            format!("{}:{}", self.generation, self.next_id),
        ))
    }
    fn current(&self, generation: u64) -> bool {
        self.enabled && self.generation == generation
    }
    fn take(&mut self, id: &str) -> Result<T, String> {
        if !self.enabled {
            return Err("Desktop Control đang tắt.".into());
        }
        if !self.pending.as_ref().is_some_and(|p| p.id == id) {
            return Err("Yêu cầu đã hủy hoặc đã dùng.".into());
        }
        let pending = self.pending.take().ok_or("Yêu cầu đã hủy")?;
        if pending.expires <= Instant::now() {
            return Err("Xác nhận đã hết hạn. Hãy yêu cầu lại.".into());
        }
        Ok(pending.action)
    }
}
impl DesktopControl {
    pub fn disable(&self) {
        if let Ok(mut state) = self.0.lock() {
            state.enabled = false;
            state.cancel();
        }
    }
}

#[tauri::command]
pub fn desktop_set_enabled(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopControl>,
    enabled: bool,
) -> Result<String, String> {
    main_only(window.label())?;
    if enabled && !cfg!(target_os = "macos") {
        return Err("Desktop Control hiện chỉ hỗ trợ macOS.".into());
    }
    let mut state = state
        .0
        .lock()
        .map_err(|_| "Desktop Control không khả dụng")?;
    state.cancel();
    state.enabled = enabled;
    Ok(state.generation.to_string())
}

#[tauri::command]
pub fn desktop_list_apps(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopControl>,
    lease: String,
) -> Result<Vec<sound_core::desktop::DesktopApp>, String> {
    main_only(window.label())?;
    let state = state
        .0
        .lock()
        .map_err(|_| "Desktop Control không khả dụng")?;
    if !state.enabled || state.generation.to_string() != lease {
        return Err("Phiên điều khiển đã tắt hoặc hết hạn.".into());
    }
    sound_core::desktop::list_apps()
}

#[tauri::command]
pub async fn desktop_prepare(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopControl>,
    lease: String,
    action: DesktopAction,
) -> Result<DesktopApproval, String> {
    main_only(window.label())?;
    action.validate()?;
    let state = state.0.clone();
    let (generation, id) = {
        let mut state = state.lock().map_err(|_| "Desktop Control không khả dụng")?;
        if state.generation.to_string() != lease {
            return Err("Phiên điều khiển đã hết hạn.".into());
        }
        state.reserve()?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let description = action.description();
        let prepared = PreparedDesktopAction::prepare(action);
        let mut state = state.lock().map_err(|_| "Desktop Control không khả dụng")?;
        if !state.current(generation) {
            return Err("Yêu cầu đã hủy.".into());
        }
        state.preparing = false;
        let prepared = prepared?;
        let target = prepared.target_label.clone();
        state.pending = Some(Pending {
            id: id.clone(),
            expires: Instant::now() + Duration::from_secs(30),
            action: prepared,
        });
        Ok(DesktopApproval {
            id,
            description,
            target,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn desktop_approve(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopControl>,
    id: String,
) -> Result<DesktopResult, String> {
    main_only(window.label())?;
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // One bounded operation; stop revokes anything not already executing.
        let mut state = state.lock().map_err(|_| "Desktop Control không khả dụng")?;
        state.take(&id)?.execute()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn desktop_request_chrome_permission(window: tauri::WebviewWindow) -> Result<(), String> {
    main_only(window.label())?;
    tauri::async_runtime::spawn_blocking(sound_core::desktop::request_chrome_permission)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_consent_rejects_disabled_concurrent_replayed_and_stale_work() {
        let mut state = Control::<u8>::default();
        assert!(state.reserve().is_err());
        state.enabled = true;
        let (generation, id) = state.reserve().unwrap();
        assert!(state.reserve().is_err());
        assert!(state.current(generation));
        state.cancel();
        assert!(!state.current(generation));
        assert!(state.take(&id).is_err());
        assert!(state.reserve().is_ok());
        assert!(main_only("pet-overlay").is_err());
        assert!(main_only("main").is_ok());
    }

    #[test]
    fn desktop_approval_is_bound_single_use_and_expires() {
        let mut state = Control::<u8> {
            enabled: true,
            ..Control::default()
        };
        state.pending = Some(Pending {
            id: "one".into(),
            expires: Instant::now() + Duration::from_secs(30),
            action: 42,
        });
        assert!(state.take("other").is_err());
        assert!(state.reserve().is_err());
        assert_eq!(state.take("one").unwrap(), 42);
        assert!(state.take("one").is_err());
        state.pending = Some(Pending {
            id: "expired".into(),
            expires: Instant::now(),
            action: 99,
        });
        assert!(state.take("expired").is_err());
        assert!(state.pending.is_none());
        state.pending = Some(Pending {
            id: "cancelled".into(),
            expires: Instant::now() + Duration::from_secs(30),
            action: 12,
        });
        state.cancel();
        assert!(state.take("cancelled").is_err());
    }
}
