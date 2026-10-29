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

/// One JPEG of the main display, base64-encoded and already scaled to `max_edge`.
///
/// This used to spawn `/usr/sbin/screencapture` once a second, write a full-resolution
/// JPEG to /tmp, read it back and base64 the lot across IPC — megabytes a second to
/// produce a frame the webview immediately scaled down anyway. ImageIO scales while it
/// encodes, so the oversized original never exists as bytes, and the TCC check lands on
/// this app instead of on a child process.
pub fn capture_main_display_jpeg(max_edge: usize, quality: f64) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let bytes = sound_core::screen::capture_main_display_jpeg(max_edge, quality)?;
    Ok(STANDARD.encode(bytes))
}

/// `max_edge` and `quality` come from the uplink, so the encode matches what it sends.
#[tauri::command]
pub async fn capture_screen_jpeg(
    max_edge: Option<usize>,
    quality: Option<f64>,
) -> Result<String, String> {
    let max_edge = max_edge
        .filter(|value| *value > 0)
        .unwrap_or(sound_core::screen::DEFAULT_MAX_EDGE)
        .clamp(160, 4096);
    let quality = quality
        .filter(|value| value.is_finite())
        .unwrap_or(sound_core::screen::DEFAULT_QUALITY)
        .clamp(0.1, 1.0);
    tauri::async_runtime::spawn_blocking(move || capture_main_display_jpeg(max_edge, quality))
        .await
        .map_err(|e| e.to_string())?
}

/// How macOS identifies this build, and therefore whether the permissions granted to it
/// survive the next rebuild. Read once and cached: `codesign` is a process spawn.
#[tauri::command]
pub fn app_signing_identity() -> sound_core::SigningIdentity {
    static CACHED: std::sync::OnceLock<sound_core::SigningIdentity> = std::sync::OnceLock::new();
    CACHED.get_or_init(sound_core::screen::signing_identity).clone()
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

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct NoteHit {
    pub path: String,
    pub excerpt: String,
}

/// The Obsidian vault Obsidian itself has open, else the only one it knows about.
fn obsidian_vault() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME unset")?;
    let raw = std::fs::read_to_string(format!("{home}/Library/Application Support/obsidian/obsidian.json"))
        .map_err(|_| "Chưa tìm thấy Obsidian vault trên máy")?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let vaults: Vec<&serde_json::Value> = json["vaults"].as_object().map(|v| v.values().collect()).unwrap_or_default();
    let open: Vec<_> = vaults.iter().filter(|v| v["open"].as_bool() == Some(true)).collect();
    let pick = if open.len() == 1 { open[0] } else if vaults.len() == 1 { &vaults[0] } else { return Err("Có nhiều vault, mở một vault trong Obsidian".into()) };
    pick["path"].as_str().map(Into::into).ok_or_else(|| "Vault thiếu path".into())
}

fn collect_markdown(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') { continue; }
        if path.is_dir() { collect_markdown(&path, out); }
        else if path.extension().is_some_and(|e| e == "md") { out.push(path); }
    }
}

fn tokens(s: &str) -> impl Iterator<Item = String> + '_ {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_')).filter(|w| !w.is_empty()).map(str::to_lowercase)
}

/// BM25 over (relative path, text), the file name counting three times, so a rare term
/// outweighs a common one; the excerpt is the matching paragraphs, capped for a voice turn.
// ponytail: lexical BM25, swap for embeddings if questions use synonyms the notes never contain.
pub fn rank_notes(query: &str, notes: &[(String, String)]) -> Vec<NoteHit> {
    use std::collections::{HashMap, HashSet};
    let terms: HashSet<String> = tokens(query).collect();
    if terms.is_empty() || notes.is_empty() { return Vec::new(); }
    let docs: Vec<(HashMap<&String, f64>, f64)> = notes.iter().map(|(path, text)| {
        let name = path.rsplit('/').next().unwrap_or(path);
        let (mut tf, mut len) = (HashMap::new(), 0.0);
        for (w, weight) in tokens(name).map(|w| (w, 3.0)).chain(tokens(text).map(|w| (w, 1.0))) {
            len += weight;
            if let Some(t) = terms.get(&w) { *tf.entry(t).or_insert(0.0) += weight; }
        }
        (tf, len)
    }).collect();
    let n = docs.len() as f64;
    let avg = docs.iter().map(|d| d.1).sum::<f64>() / n;
    let idf: HashMap<&String, f64> = terms.iter().map(|t| {
        let df = docs.iter().filter(|d| d.0.contains_key(t)).count() as f64;
        (t, (1.0 + (n - df + 0.5) / (df + 0.5)).ln())
    }).collect();
    let mut scored: Vec<(f64, usize)> = docs.iter().enumerate().filter_map(|(i, (tf, len))| {
        let s: f64 = tf.iter().map(|(t, f)| idf[t] * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len / avg))).sum();
        (s > 0.0).then_some((s, i))
    }).collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().take(3).map(|(_, i)| {
        let (path, text) = &notes[i];
        let mut excerpt = String::new();
        for para in text.split("\n\n").filter(|p| terms.iter().any(|t| p.to_lowercase().contains(t.as_str()))) {
            if excerpt.chars().count() > 1500 { break; }
            excerpt.push_str(para.trim());
            excerpt.push_str("\n\n");
        }
        let source = if excerpt.is_empty() { text.as_str() } else { excerpt.as_str() };
        NoteHit { path: path.clone(), excerpt: source.chars().take(1800).collect() }
    }).collect()
}

/// Lets Gemini Live answer from the user's own Obsidian notes before its own knowledge.
#[tauri::command]
pub async fn search_notes(query: String) -> Result<Vec<NoteHit>, String> {
    let vault = obsidian_vault()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        collect_markdown(&vault, &mut files);
        let notes: Vec<(String, String)> = files.iter().filter_map(|f| {
            let rel = f.strip_prefix(&vault).ok()?.to_string_lossy().into_owned();
            Some((rel, std::fs::read_to_string(f).ok()?))
        }).collect();
        rank_notes(&query, &notes)
    }).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod notes_tests {
    use super::rank_notes;

    #[test]
    fn ranks_by_terms_and_skips_unrelated_notes() {
        let notes = vec![
            ("Rust/ownership.md".to_string(), "# Ownership\n\nBorrow checker rules.\n\nUnrelated recipe.".to_string()),
            ("Cooking.md".to_string(), "Phở bò recipe".to_string()),
        ];
        let hits = rank_notes("rust borrow", &notes);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "Rust/ownership.md");
        assert!(hits[0].excerpt.contains("Borrow checker") && !hits[0].excerpt.contains("recipe"));
        assert!(rank_notes("kubernetes", &notes).is_empty());

        // A rare term outranks a term every note shares.
        let notes = vec![
            ("a.md".to_string(), "query query query".to_string()),
            ("b.md".to_string(), "useMutation query".to_string()),
        ];
        assert_eq!(rank_notes("useMutation query", &notes)[0].path, "b.md");
    }
}
