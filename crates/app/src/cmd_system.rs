use std::sync::atomic::Ordering;
use tauri::State;
use crate::AppState;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Whether this process may capture the screen. Never prompts.
#[tauri::command]
pub fn check_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Asks macOS to display the system prompt if not yet decided.
///
/// On macOS 15, `CGRequestScreenCaptureAccess` pops the permission dialog on the
/// first call and opens System Settings on subsequent calls if denied.
#[tauri::command]
pub fn request_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGRequestScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
pub async fn open_screen_capture_settings() -> Result<(), String> {
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
pub fn capture_main_display_jpeg() -> Result<String, String> {
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
pub async fn capture_screen_jpeg() -> Result<String, String> {
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
pub fn get_performance_metrics(state: State<'_, AppState>) -> AppPerformanceMetrics {
    let mem = sound_core::get_memory_info();
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

#[tauri::command]
pub fn benchmark_ipc_latency(client_timestamp_ms: f64) -> f64 {
    client_timestamp_ms
}

#[tauri::command]
pub fn trim_memory(state: State<'_, AppState>) -> TrimMemoryResult {
    let freed = sound_core::trim_memory_cache();
    let metrics = get_performance_metrics(state);
    TrimMemoryResult {
        bytes_reclaimed_hint: freed,
        metrics_after: metrics,
    }
}

#[tauri::command]
pub fn set_background_mode(enabled: bool, state: State<'_, AppState>) -> bool {
    state.background_mode.store(enabled, Ordering::Relaxed);
    if enabled {
        sound_core::trim_memory_cache();
    }
    enabled
}

#[tauri::command]
pub fn check_accessibility_permission(state: State<'_, AppState>) -> bool {
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
pub fn request_accessibility_permission(state: State<'_, AppState>) -> bool {
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
pub fn update_dock_icon(app_handle: tauri::AppHandle, icon_png_base64: String) -> Result<bool, String> {
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

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let main = app.get_webview_window("main").ok_or("Main window unavailable")?;
    main.show().map_err(|e| e.to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
