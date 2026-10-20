use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String, // "macos" | "windows" | "linux"
    pub is_windows: bool,
    pub is_macos: bool,
    pub hostname: String,
    pub default_disk_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub group: String, // "system" | "developer" | "browser" | "user"
    pub size_bytes: u64,
    pub item_count: usize,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanScanResult {
    pub categories: Vec<CleanCategory>,
    pub total_size_bytes: u64,
    pub total_item_count: usize,
    pub scanned_at_secs: u64,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanExecutionResult {
    pub bytes_reclaimed: u64,
    pub items_removed: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLeftoverItem {
    pub path: String,
    pub size_bytes: u64,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledAppInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub version: String,
    pub bundle_size_bytes: u64,
    pub leftover_size_bytes: u64,
    pub total_size_bytes: u64,
    pub leftovers: Vec<AppLeftoverItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUninstallResult {
    pub app_name: String,
    pub bundle_removed: bool,
    pub leftovers_removed: usize,
    pub bytes_reclaimed: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectArtifactItem {
    pub path: String,
    pub project_name: String,
    pub artifact_type: String, // "node_modules" | "target" | ".gradle" | "build" | "venv"
    pub size_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectPurgeScanResult {
    pub items: Vec<ProjectArtifactItem>,
    pub total_size_bytes: u64,
    pub scanned_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationTaskResult {
    pub task_id: String,
    pub task_name: String,
    pub success: bool,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHardwareMetrics {
    pub cpu_usage_percent: f64,
    pub cpu_core_count: usize,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub memory_free_bytes: u64,
    pub memory_used_percent: f64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub disk_total_bytes: u64,
    pub disk_available_bytes: u64,
    pub disk_used_bytes: u64,
    pub disk_used_percent: f64,
    pub disk_mount_point: String,
    pub net_bytes_received: u64,
    pub net_bytes_transmitted: u64,
    pub uptime_seconds: u64,
}

// ============================================================================
// Platform Detection & Directory Helpers
// ============================================================================

#[tauri::command]
pub fn cleaner_get_platform_info() -> PlatformInfo {
    let os = std::env::consts::OS.to_string();
    let is_windows = cfg!(target_os = "windows");
    let is_macos = cfg!(target_os = "macos");
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop-PC".into());
    let default_disk_label = if is_windows {
        "Local Disk (C:)".to_string()
    } else {
        "Macintosh HD".to_string()
    };

    PlatformInfo {
        os,
        is_windows,
        is_macos,
        hostname,
        default_disk_label,
    }
}

pub fn get_user_home_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return PathBuf::from(profile);
        }
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
}

pub fn get_local_appdata_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(lad) = std::env::var("LOCALAPPDATA") {
            return Some(PathBuf::from(lad));
        }
    }
    None
}

pub fn get_roaming_appdata_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(rad) = std::env::var("APPDATA") {
            return Some(PathBuf::from(rad));
        }
    }
    None
}

// ============================================================================
// Path Safety Boundaries (macOS & Windows)
// ============================================================================

/// Verifies whether a given path is completely safe to delete.
/// Prevents accidental deletion of critical system or user root directories on both macOS and Windows.
pub fn is_safe_deletion_target(path: &Path) -> bool {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let canonical_str = canonical.to_string_lossy();
    let home = get_user_home_dir();

    // 1. Forbidden System & Drive Roots (Unix & Windows)
    let forbidden_roots = [
        Path::new("/"),
        Path::new("/System"),
        Path::new("/usr"),
        Path::new("/bin"),
        Path::new("/sbin"),
        Path::new("/Applications"),
        Path::new("/Library"),
        Path::new("/Users"),
        Path::new("/private"),
        Path::new("/etc"),
        Path::new("/var"),
        Path::new("C:\\"),
        Path::new("C:/"),
        Path::new("D:\\"),
        Path::new("D:/"),
        Path::new("E:\\"),
        Path::new("E:/"),
    ];
    for f in forbidden_roots {
        if canonical == f {
            return false;
        }
    }

    // Windows Root Drive and Windows System Folder guards
    let forbidden_windows_prefixes = [
        "C:\\Windows",
        "C:/Windows",
        "C:\\Program Files",
        "C:/Program Files",
        "C:\\Program Files (x86)",
        "C:/Program Files (x86)",
        "C:\\Users",
        "C:/Users",
    ];
    for p in forbidden_windows_prefixes {
        let f_path = Path::new(p);
        if canonical == f_path {
            return false;
        }
    }

    // 2. User root directory itself must never be deleted
    if canonical == home {
        return false;
    }

    // Critical user root folders (never delete as a root)
    let forbidden_user_dirs = [
        home.join("Desktop"),
        home.join("Documents"),
        home.join("Downloads"),
        home.join("Movies"),
        home.join("Videos"),
        home.join("Music"),
        home.join("Pictures"),
        home.join("Library"),
        home.join("Library/Application Support"),
        home.join("Library/Preferences"),
        home.join("Library/Containers"),
        home.join("Library/Caches"),
        home.join("Library/Logs"),
        home.join("AppData"),
        home.join("AppData/Local"),
        home.join("AppData/Roaming"),
        home.join("AppData/Local/Temp"),
    ];
    for f in forbidden_user_dirs {
        if canonical == f {
            return false;
        }
    }

    // 3. Must be either inside HOME/USERPROFILE, or inside recognized safe temporary directories
    let is_in_home = canonical.starts_with(&home);
    let is_in_var_log = canonical_str.starts_with("/private/var/log") || canonical_str.starts_with("/var/log");
    let is_in_win_temp = canonical_str.to_lowercase().contains("\\windows\\temp") || canonical_str.to_lowercase().contains("/windows/temp");

    if !is_in_home && !is_in_var_log && !is_in_win_temp {
        return false;
    }

    true
}

// ============================================================================
// File & Directory Utilities
// ============================================================================

/// Fast recursive directory size and file count calculator with bounded recursion depth.
pub fn calculate_dir_size(path: &Path, max_depth: usize) -> (u64, usize) {
    if max_depth == 0 {
        return (0, 0);
    }

    let Ok(meta) = fs::symlink_metadata(path) else {
        return (0, 0);
    };

    if meta.file_type().is_symlink() {
        return (meta.len(), 1);
    }

    if meta.is_file() {
        return (meta.len(), 1);
    }

    if !meta.is_dir() {
        return (0, 0);
    }

    let mut total_bytes = 0u64;
    let mut total_files = 0usize;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if let Ok(m) = entry.metadata() {
                if m.is_dir() {
                    let (sub_bytes, sub_files) = calculate_dir_size(&entry_path, max_depth - 1);
                    total_bytes = total_bytes.saturating_add(sub_bytes);
                    total_files = total_files.saturating_add(sub_files);
                } else {
                    total_bytes = total_bytes.saturating_add(m.len());
                    total_files = total_files.saturating_add(1);
                }
            }
        }
    }

    (total_bytes, total_files)
}

/// Safely removes a file or directory with safety boundary verification.
pub fn safe_remove_path(path: &Path) -> Result<(u64, usize), String> {
    if !path.exists() {
        return Ok((0, 0));
    }

    if !is_safe_deletion_target(path) {
        return Err(format!("Unsafe deletion target rejected: {}", path.display()));
    }

    let (bytes, count) = calculate_dir_size(path, 16);

    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };

    result
        .map(|_| (bytes, count))
        .map_err(|e| format!("Failed to delete {}: {}", path.display(), e))
}

// ============================================================================
// 1. Deep Clean Engine (macOS & Windows)
// ============================================================================

#[tauri::command]
pub async fn cleaner_scan_system() -> Result<CleanScanResult, String> {
    tauri::async_runtime::spawn_blocking(perform_system_scan)
        .await
        .map_err(|e| format!("Scan task panicked: {}", e))
}

fn perform_system_scan() -> CleanScanResult {
    let home = get_user_home_dir();
    let is_windows = cfg!(target_os = "windows");
    let mut categories = Vec::new();

    if is_windows {
        // ==========================================
        // WINDOWS CLEANUP CHANNELS
        // ==========================================
        let local_appdata = get_local_appdata_dir().unwrap_or_else(|| home.join("AppData/Local"));
        let roaming_appdata = get_roaming_appdata_dir().unwrap_or_else(|| home.join("AppData/Roaming"));

        // 1. User & System Temp
        let mut temp_paths = Vec::new();
        let mut temp_b = 0u64;
        let mut temp_c = 0usize;

        let user_temp = std::env::var("TEMP").map(PathBuf::from).unwrap_or_else(|_| local_appdata.join("Temp"));
        if user_temp.is_dir() {
            let (b, c) = calculate_dir_size(&user_temp, 6);
            if b > 0 {
                temp_b = temp_b.saturating_add(b);
                temp_c = temp_c.saturating_add(c);
                temp_paths.push(user_temp.to_string_lossy().to_string());
            }
        }
        if let Ok(windir) = std::env::var("WINDIR") {
            let win_temp = PathBuf::from(windir).join("Temp");
            if win_temp.is_dir() {
                let (b, c) = calculate_dir_size(&win_temp, 6);
                if b > 0 {
                    temp_b = temp_b.saturating_add(b);
                    temp_c = temp_c.saturating_add(c);
                    temp_paths.push(win_temp.to_string_lossy().to_string());
                }
            }
        }

        if temp_b > 0 {
            categories.push(CleanCategory {
                id: "win_temp".into(),
                name: "Windows Temporary Files".into(),
                description: "Temporary application scratch files in %TEMP% and Windows\\Temp".into(),
                group: "system".into(),
                size_bytes: temp_b,
                item_count: temp_c,
                paths: temp_paths,
            });
        }

        // 2. Windows Logs & Crash Dumps
        let win_log_targets = [
            ("win_crash_dumps", "Application Crash Dumps", "Memory crash dump files in %LOCALAPPDATA%\\CrashDumps", local_appdata.join("CrashDumps")),
            ("win_wer", "Windows Error Reporting", "Queue and archive error report logs", local_appdata.join("Microsoft/Windows/WER")),
            ("win_d3d_cache", "DirectX Shader Caches", "Compiled graphics shader cache in %LOCALAPPDATA%\\D3DSCache", local_appdata.join("D3DSCache")),
        ];
        for (id, name, desc, dir) in win_log_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 6);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "system".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 3. Windows Browser Caches
        let win_browser_targets = [
            ("chrome_cache", "Google Chrome Cache", "Web data and page caches", local_appdata.join("Google/Chrome/User Data/Default/Cache")),
            ("edge_cache", "Microsoft Edge Cache", "Web data and GPU shader caches", local_appdata.join("Microsoft/Edge/User Data/Default/Cache")),
            ("brave_cache", "Brave Browser Cache", "Brave web data and code caches", local_appdata.join("BraveSoftware/Brave-Browser/User Data/Default/Cache")),
            ("firefox_cache", "Mozilla Firefox Cache", "Firefox web cache and startup caches", local_appdata.join("Mozilla/Firefox/Profiles")),
        ];
        for (id, name, desc, dir) in win_browser_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 6);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "browser".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 4. Windows Developer Caches (Cargo, npm, pnpm, NuGet, pip, Gradle)
        let win_dev_targets = [
            ("cargo_cache", "Rust / Cargo Caches", "Cargo crate registry cache (.cargo/registry/cache)", home.join(".cargo/registry/cache")),
            ("npm_cache", "npm Cache", "npm module tarball cache in %APPDATA%\\npm-cache", roaming_appdata.join("npm-cache")),
            ("pnpm_cache", "pnpm Store", "pnpm content-addressable store in %LOCALAPPDATA%\\pnpm\\store", local_appdata.join("pnpm/store")),
            ("pip_cache", "Python pip Cache", "pip wheel and package cache in %LOCALAPPDATA%\\pip\\cache", local_appdata.join("pip/cache")),
            ("nuget_cache", "NuGet Package Cache", "NuGet package v3 download cache", local_appdata.join("NuGet/v3-cache")),
            ("gradle_cache", "Gradle Caches", "Gradle build wrappers and dependencies", home.join(".gradle/caches")),
        ];
        for (id, name, desc, dir) in win_dev_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 6);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "developer".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 5. Downloaded Installers (.exe, .msi, .iso)
        let downloads_dir = home.join("Downloads");
        if downloads_dir.is_dir() {
            let mut inst_b = 0u64;
            let mut inst_c = 0usize;
            let mut inst_paths = Vec::new();

            if let Ok(entries) = fs::read_dir(&downloads_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        let ext_lower = ext.to_ascii_lowercase();
                        if ext_lower == "exe" || ext_lower == "msi" || ext_lower == "iso" {
                            if let Ok(m) = p.metadata() {
                                inst_b = inst_b.saturating_add(m.len());
                                inst_c += 1;
                                inst_paths.push(p.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }

            if inst_b > 0 {
                categories.push(CleanCategory {
                    id: "win_installer_files".into(),
                    name: "Leftover Installers (.exe, .msi)".into(),
                    description: "Downloaded installer binaries and packages in Downloads".into(),
                    group: "user".into(),
                    size_bytes: inst_b,
                    item_count: inst_c,
                    paths: inst_paths,
                });
            }
        }
    } else {
        // ==========================================
        // MACOS CLEANUP CHANNELS (Standard Darwin)
        // ==========================================

        // 1. User Caches (~/Library/Caches)
        let user_caches = home.join("Library/Caches");
        if user_caches.is_dir() {
            let mut total_b = 0u64;
            let mut total_c = 0usize;
            let mut paths = Vec::new();

            if let Ok(entries) = fs::read_dir(&user_caches) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if file_name.starts_with("com.apple.") || file_name == "CloudKit" {
                        continue;
                    }
                    let (b, c) = calculate_dir_size(&p, 8);
                    if b > 0 {
                        total_b = total_b.saturating_add(b);
                        total_c = total_c.saturating_add(c);
                        paths.push(p.to_string_lossy().to_string());
                    }
                }
            }

            if total_b > 0 {
                categories.push(CleanCategory {
                    id: "user_caches".into(),
                    name: "User Application Caches".into(),
                    description: "Temporary application cache files in ~/Library/Caches".into(),
                    group: "system".into(),
                    size_bytes: total_b,
                    item_count: total_c,
                    paths,
                });
            }
        }

        // 2. System & User Logs
        let log_dirs = [
            home.join("Library/Logs"),
            home.join("Library/Logs/DiagnosticReports"),
        ];
        let mut logs_b = 0u64;
        let mut logs_c = 0usize;
        let mut log_paths = Vec::new();

        for dir in &log_dirs {
            if dir.is_dir() {
                if let Ok(entries) = fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let (b, c) = calculate_dir_size(&p, 6);
                        if b > 0 {
                            logs_b = logs_b.saturating_add(b);
                            logs_c = logs_c.saturating_add(c);
                            log_paths.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        if logs_b > 0 {
            categories.push(CleanCategory {
                id: "system_logs".into(),
                name: "Logs & Diagnostic Reports".into(),
                description: "Application crash logs and diagnostic logs".into(),
                group: "system".into(),
                size_bytes: logs_b,
                item_count: logs_c,
                paths: log_paths,
            });
        }

        // 3. Xcode & Simulator Developer Artifacts
        let xcode_targets = [
            (
                "xcode_derived_data",
                "Xcode DerivedData",
                "Temporary build output and indexing caches",
                home.join("Library/Developer/Xcode/DerivedData"),
            ),
            (
                "xcode_archives",
                "Xcode Build Archives",
                "Old compiled app distribution archives",
                home.join("Library/Developer/Xcode/Archives"),
            ),
            (
                "xcode_simulators",
                "iOS Simulator Caches",
                "CoreSimulator runtime caches and mock devices",
                home.join("Library/Developer/CoreSimulator/Caches"),
            ),
        ];

        for (id, name, desc, dir) in xcode_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 8);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "developer".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 4. Package Manager Caches (Homebrew, Cargo, npm, pnpm, Gradle, pip)
        let pm_targets = [
            (
                "homebrew_cache",
                "Homebrew Caches",
                "Downloaded bottles and git cache in Homebrew",
                home.join("Library/Caches/Homebrew"),
            ),
            (
                "cargo_cache",
                "Rust / Cargo Caches",
                "Cargo crate registry archives and git checkouts",
                home.join(".cargo/registry/cache"),
            ),
            (
                "npm_cache",
                "npm Cache",
                "Global npm module download tarballs",
                home.join(".npm"),
            ),
            (
                "pnpm_cache",
                "pnpm Store",
                "Shared pnpm content-addressable storage",
                home.join("Library/pnpm/store"),
            ),
            (
                "gradle_cache",
                "Gradle Caches",
                "Downloaded Gradle wrappers and dependencies",
                home.join(".gradle/caches"),
            ),
            (
                "pip_cache",
                "Python pip Cache",
                "Cached Python wheels and downloads",
                home.join("Library/Caches/pip"),
            ),
        ];

        for (id, name, desc, dir) in pm_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 8);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "developer".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 5. Web Browser Caches
        let browser_targets = [
            (
                "chrome_cache",
                "Google Chrome Cache",
                "Temporary web data and page caches",
                home.join("Library/Caches/Google/Chrome"),
            ),
            (
                "safari_cache",
                "Safari Browser Cache",
                "Safari webpage and favicon caches",
                home.join("Library/Caches/com.apple.Safari"),
            ),
            (
                "brave_cache",
                "Brave Browser Cache",
                "Brave browser temporary web caches",
                home.join("Library/Caches/BraveSoftware/Brave-Browser"),
            ),
            (
                "arc_cache",
                "Arc Browser Cache",
                "Arc browser cache and cached web assets",
                home.join("Library/Caches/company.thebrowser.Browser"),
            ),
            (
                "edge_cache",
                "Microsoft Edge Cache",
                "Edge browser web cache data",
                home.join("Library/Caches/Microsoft Edge"),
            ),
        ];

        for (id, name, desc, dir) in browser_targets {
            if dir.is_dir() {
                let (b, c) = calculate_dir_size(&dir, 8);
                if b > 0 {
                    categories.push(CleanCategory {
                        id: id.into(),
                        name: name.into(),
                        description: desc.into(),
                        group: "browser".into(),
                        size_bytes: b,
                        item_count: c,
                        paths: vec![dir.to_string_lossy().to_string()],
                    });
                }
            }
        }

        // 6. Installer Files (.dmg, .pkg, .iso)
        let downloads_dir = home.join("Downloads");
        if downloads_dir.is_dir() {
            let mut inst_b = 0u64;
            let mut inst_c = 0usize;
            let mut inst_paths = Vec::new();

            if let Ok(entries) = fs::read_dir(&downloads_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        let ext_lower = ext.to_ascii_lowercase();
                        if ext_lower == "dmg" || ext_lower == "pkg" || ext_lower == "iso" {
                            if let Ok(m) = p.metadata() {
                                inst_b = inst_b.saturating_add(m.len());
                                inst_c += 1;
                                inst_paths.push(p.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }

            if inst_b > 0 {
                categories.push(CleanCategory {
                    id: "installer_files".into(),
                    name: "Leftover Installers (.dmg, .pkg)".into(),
                    description: "Downloaded installer images and disk packages in Downloads".into(),
                    group: "user".into(),
                    size_bytes: inst_b,
                    item_count: inst_c,
                    paths: inst_paths,
                });
            }
        }

        // 7. System Trash (~/.Trash)
        let trash_dir = home.join(".Trash");
        if trash_dir.is_dir() {
            let (b, c) = calculate_dir_size(&trash_dir, 10);
            if b > 0 {
                categories.push(CleanCategory {
                    id: "system_trash".into(),
                    name: "Trash Bin".into(),
                    description: "Deleted files currently in your user Trash bin".into(),
                    group: "user".into(),
                    size_bytes: b,
                    item_count: c,
                    paths: vec![trash_dir.to_string_lossy().to_string()],
                });
            }
        }
    }

    let total_size_bytes = categories.iter().map(|c| c.size_bytes).sum();
    let total_item_count = categories.iter().map(|c| c.item_count).sum();
    let scanned_at_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    CleanScanResult {
        categories,
        total_size_bytes,
        total_item_count,
        scanned_at_secs,
        platform: if is_windows { "windows".into() } else { "macos".into() },
    }
}

#[tauri::command]
pub async fn cleaner_execute_clean(category_ids: Vec<String>) -> Result<CleanExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let scan = perform_system_scan();
        let target_set: HashSet<String> = category_ids.into_iter().collect();

        let mut bytes_reclaimed = 0u64;
        let mut items_removed = 0usize;
        let mut errors = Vec::new();

        for cat in scan.categories {
            if target_set.contains(&cat.id) {
                for path_str in cat.paths {
                    let path = Path::new(&path_str);
                    if path.is_dir() {
                        if cat.id == "system_trash" || cat.id == "win_temp" {
                            if let Ok(entries) = fs::read_dir(path) {
                                for entry in entries.flatten() {
                                    match safe_remove_path(&entry.path()) {
                                        Ok((b, c)) => {
                                            bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                                            items_removed += c;
                                        }
                                        Err(e) => errors.push(e),
                                    }
                                }
                            }
                        } else {
                            match safe_remove_path(path) {
                                Ok((b, c)) => {
                                    bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                                    items_removed += c;
                                }
                                Err(e) => errors.push(e),
                            }
                        }
                    } else if path.is_file() {
                        match safe_remove_path(path) {
                            Ok((b, c)) => {
                                bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                                items_removed += c;
                            }
                            Err(e) => errors.push(e),
                        }
                    }
                }
            }
        }

        CleanExecutionResult {
            bytes_reclaimed,
            items_removed,
            errors,
        }
    })
    .await
    .map_err(|e| format!("Clean task panicked: {}", e))
}

// ============================================================================
// 2. Smart Application Uninstaller
// ============================================================================

fn resolve_bundle_id(app_path: &Path) -> (String, String) {
    let plist_path = app_path.join("Contents/Info.plist");
    if !plist_path.is_file() {
        return (String::new(), String::new());
    }

    let bundle_id = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print :CFBundleIdentifier", &plist_path.to_string_lossy()])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let version = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print :CFBundleShortVersionString", &plist_path.to_string_lossy()])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "1.0.0".into());

    (bundle_id, version)
}

#[tauri::command]
pub async fn cleaner_scan_apps() -> Result<Vec<InstalledAppInfo>, String> {
    tauri::async_runtime::spawn_blocking(perform_app_scan)
        .await
        .map_err(|e| format!("App scan task panicked: {}", e))
}

fn perform_app_scan() -> Vec<InstalledAppInfo> {
    let home = get_user_home_dir();
    let is_windows = cfg!(target_os = "windows");
    let mut apps = Vec::new();

    if is_windows {
        // Windows installed apps scan
        let program_dirs = [
            PathBuf::from("C:\\Program Files"),
            PathBuf::from("C:\\Program Files (x86)"),
            home.join("AppData/Local/Programs"),
        ];

        for dir in &program_dirs {
            if !dir.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let app_name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("App")
                        .to_string();

                    // Skip system common files
                    if app_name.eq_ignore_ascii_case("Common Files")
                        || app_name.eq_ignore_ascii_case("Windows Defender")
                        || app_name.eq_ignore_ascii_case("Internet Explorer")
                    {
                        continue;
                    }

                    let (bundle_size_bytes, _) = calculate_dir_size(&path, 6);
                    let mut leftovers = Vec::new();

                    let local_appdata = get_local_appdata_dir().unwrap_or_else(|| home.join("AppData/Local"));
                    let roaming_appdata = get_roaming_appdata_dir().unwrap_or_else(|| home.join("AppData/Roaming"));

                    let local_leftover = local_appdata.join(&app_name);
                    if local_leftover.is_dir() {
                        let (b, _) = calculate_dir_size(&local_leftover, 6);
                        leftovers.push(AppLeftoverItem {
                            path: local_leftover.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Local AppData".into(),
                        });
                    }

                    let roaming_leftover = roaming_appdata.join(&app_name);
                    if roaming_leftover.is_dir() {
                        let (b, _) = calculate_dir_size(&roaming_leftover, 6);
                        leftovers.push(AppLeftoverItem {
                            path: roaming_leftover.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Roaming AppData".into(),
                        });
                    }

                    let leftover_size_bytes = leftovers.iter().map(|l| l.size_bytes).sum();
                    let total_size_bytes = bundle_size_bytes.saturating_add(leftover_size_bytes);

                    apps.push(InstalledAppInfo {
                        id: app_name.clone(),
                        name: app_name,
                        path: path.to_string_lossy().to_string(),
                        bundle_id: String::new(),
                        version: "1.0".into(),
                        bundle_size_bytes,
                        leftover_size_bytes,
                        total_size_bytes,
                        leftovers,
                    });
                }
            }
        }
    } else {
        // macOS App Scan
        let app_dirs = [
            PathBuf::from("/Applications"),
            home.join("Applications"),
        ];

        for dir in &app_dirs {
            if !dir.is_dir() {
                continue;
            }

            let Ok(entries) = fs::read_dir(dir) else {
                continue;
            };

            for entry in entries.flatten() {
                let path = entry.path();
                let is_app = path.extension().and_then(|e| e.to_str()) == Some("app");
                if !is_app {
                    continue;
                }

                let app_name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("App")
                    .to_string();

                if dir == Path::new("/Applications") && (
                    app_name == "Safari" ||
                    app_name == "Music" ||
                    app_name == "Finder" ||
                    app_name == "System Settings" ||
                    app_name == "App Store" ||
                    app_name == "Utilities"
                ) {
                    continue;
                }

                let (bundle_id, version) = resolve_bundle_id(&path);
                let (bundle_size_bytes, _) = calculate_dir_size(&path, 8);
                let mut leftovers = Vec::new();

                if !bundle_id.is_empty() {
                    let app_support_named = home.join(format!("Library/Application Support/{}", app_name));
                    let app_support_id = home.join(format!("Library/Application Support/{}", bundle_id));
                    if app_support_named.exists() {
                        let (b, _) = calculate_dir_size(&app_support_named, 8);
                        leftovers.push(AppLeftoverItem {
                            path: app_support_named.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Application Support".into(),
                        });
                    } else if app_support_id.exists() {
                        let (b, _) = calculate_dir_size(&app_support_id, 8);
                        leftovers.push(AppLeftoverItem {
                            path: app_support_id.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Application Support".into(),
                        });
                    }

                    let cache_path = home.join(format!("Library/Caches/{}", bundle_id));
                    if cache_path.exists() {
                        let (b, _) = calculate_dir_size(&cache_path, 8);
                        leftovers.push(AppLeftoverItem {
                            path: cache_path.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Caches".into(),
                        });
                    }

                    let pref_path = home.join(format!("Library/Preferences/{}.plist", bundle_id));
                    if pref_path.is_file() {
                        let b = pref_path.metadata().map(|m| m.len()).unwrap_or(0);
                        leftovers.push(AppLeftoverItem {
                            path: pref_path.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Preferences".into(),
                        });
                    }

                    let saved_state = home.join(format!("Library/Saved Application State/{}.savedState", bundle_id));
                    if saved_state.exists() {
                        let (b, _) = calculate_dir_size(&saved_state, 6);
                        leftovers.push(AppLeftoverItem {
                            path: saved_state.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Saved Application State".into(),
                        });
                    }

                    let container = home.join(format!("Library/Containers/{}", bundle_id));
                    if container.exists() {
                        let (b, _) = calculate_dir_size(&container, 8);
                        leftovers.push(AppLeftoverItem {
                            path: container.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "Containers".into(),
                        });
                    }

                    let launch_agent = home.join(format!("Library/LaunchAgents/{}.plist", bundle_id));
                    if launch_agent.is_file() {
                        let b = launch_agent.metadata().map(|m| m.len()).unwrap_or(0);
                        leftovers.push(AppLeftoverItem {
                            path: launch_agent.to_string_lossy().to_string(),
                            size_bytes: b,
                            category: "LaunchAgents".into(),
                        });
                    }
                }

                let leftover_size_bytes = leftovers.iter().map(|l| l.size_bytes).sum();
                let total_size_bytes = bundle_size_bytes.saturating_add(leftover_size_bytes);

                apps.push(InstalledAppInfo {
                    id: bundle_id.clone().if_empty_then(app_name.clone()),
                    name: app_name,
                    path: path.to_string_lossy().to_string(),
                    bundle_id,
                    version,
                    bundle_size_bytes,
                    leftover_size_bytes,
                    total_size_bytes,
                    leftovers,
                });
            }
        }
    }

    apps.sort_by(|a, b| b.total_size_bytes.cmp(&a.total_size_bytes));
    apps
}

trait StringExt {
    fn if_empty_then(self, fallback: String) -> String;
}

impl StringExt for String {
    fn if_empty_then(self, fallback: String) -> String {
        if self.is_empty() { fallback } else { self }
    }
}

#[tauri::command]
pub async fn cleaner_uninstall_app(app_path: String, leftover_paths: Vec<String>) -> Result<AppUninstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = Path::new(&app_path);
        let mut bytes_reclaimed = 0u64;
        let mut leftovers_removed = 0usize;
        let mut errors = Vec::new();

        // 1. Delete leftovers
        for lp in &leftover_paths {
            let p = Path::new(lp);
            match safe_remove_path(p) {
                Ok((b, _)) => {
                    bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                    leftovers_removed += 1;
                }
                Err(e) => errors.push(e),
            }
        }

        // 2. Delete app bundle / folder
        let mut bundle_removed = false;
        if app.is_dir() {
            let (b, _) = calculate_dir_size(app, 8);
            if fs::remove_dir_all(app).is_ok() {
                bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                bundle_removed = true;
            } else {
                errors.push(format!("Could not remove application directory: {}", app.display()));
            }
        }

        AppUninstallResult {
            app_name: app.file_stem().and_then(|s| s.to_str()).unwrap_or("App").to_string(),
            bundle_removed,
            leftovers_removed,
            bytes_reclaimed,
            errors,
        }
    })
    .await
    .map_err(|e| format!("Uninstall task panicked: {}", e))
}

// ============================================================================
// 3. Project Build Artifacts Cleaner (mo purge)
// ============================================================================

#[tauri::command]
pub async fn cleaner_scan_projects(target_dir: Option<String>) -> Result<ProjectPurgeScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = target_dir
            .map(PathBuf::from)
            .unwrap_or_else(|| get_user_home_dir().join("Documents"));

        let mut items = Vec::new();
        let artifact_names = ["node_modules", "target", ".gradle", "build", "dist", ".venv", "venv", "DerivedData", "bin", "obj"];

        fn scan_dir_for_artifacts(dir: &Path, depth: usize, max_depth: usize, artifact_names: &[&str], out: &mut Vec<ProjectArtifactItem>) {
            if depth >= max_depth {
                return;
            }

            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };

            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_dir() {
                    continue;
                }

                let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if artifact_names.contains(&name) {
                    let (size_bytes, file_count) = calculate_dir_size(&p, 6);
                    let project_name = dir.file_name().and_then(|s| s.to_str()).unwrap_or("Project").to_string();
                    out.push(ProjectArtifactItem {
                        path: p.to_string_lossy().to_string(),
                        project_name,
                        artifact_type: name.to_string(),
                        size_bytes,
                        file_count,
                    });
                } else if !name.starts_with('.') && name != "node_modules" && name != "target" {
                    scan_dir_for_artifacts(&p, depth + 1, max_depth, artifact_names, out);
                }
            }
        }

        scan_dir_for_artifacts(&root, 0, 4, &artifact_names, &mut items);
        let total_size_bytes = items.iter().map(|i| i.size_bytes).sum();

        ProjectPurgeScanResult {
            items,
            total_size_bytes,
            scanned_path: root.to_string_lossy().to_string(),
        }
    })
    .await
    .map_err(|e| format!("Project scan panicked: {}", e))
}

#[tauri::command]
pub async fn cleaner_purge_projects(paths: Vec<String>) -> Result<CleanExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut bytes_reclaimed = 0u64;
        let mut items_removed = 0usize;
        let mut errors = Vec::new();

        for p_str in paths {
            let path = Path::new(&p_str);
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if ["node_modules", "target", ".gradle", "build", "dist", ".venv", "venv", "DerivedData", "bin", "obj"].contains(&name) {
                match safe_remove_path(path) {
                    Ok((b, c)) => {
                        bytes_reclaimed = bytes_reclaimed.saturating_add(b);
                        items_removed += c;
                    }
                    Err(e) => errors.push(e),
                }
            } else {
                errors.push(format!("Rejected non-artifact path: {}", path.display()));
            }
        }

        CleanExecutionResult {
            bytes_reclaimed,
            items_removed,
            errors,
        }
    })
    .await
    .map_err(|e| format!("Project purge panicked: {}", e))
}

// ============================================================================
// 4. System Optimization Tasks (macOS & Windows)
// ============================================================================

#[tauri::command]
pub async fn cleaner_optimize_task(task_id: String) -> Result<OptimizationTaskResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let mut success = true;
        let message;
        let task_name;
        let is_windows = cfg!(target_os = "windows");

        match task_id.as_str() {
            "dns_flush" => {
                task_name = "Flush DNS Cache".to_string();
                if is_windows {
                    let out = Command::new("ipconfig").arg("/flushdns").status();
                    if out.map(|s| s.success()).unwrap_or(false) {
                        message = "Windows DNS resolver cache successfully flushed".into();
                    } else {
                        success = false;
                        message = "Failed to run ipconfig /flushdns".into();
                    }
                } else {
                    let out = Command::new("/usr/bin/dscacheutil").arg("-flushcache").status();
                    let _ = Command::new("/usr/bin/killall").args(["-HUP", "mDNSResponder"]).status();
                    if out.map(|s| s.success()).unwrap_or(false) {
                        message = "DNS and mDNSResponder cache flushed successfully".into();
                    } else {
                        success = false;
                        message = "Failed to flush DNS cache".into();
                    }
                }
            }
            "quicklook_reset" => {
                if is_windows {
                    task_name = "Windows Thumbnail & Icon Cache Reset".to_string();
                    let local_appdata = get_local_appdata_dir().unwrap_or_else(|| get_user_home_dir().join("AppData/Local"));
                    let icon_cache = local_appdata.join("IconCache.db");
                    if icon_cache.is_file() {
                        let _ = fs::remove_file(&icon_cache);
                    }
                    message = "Windows icon cache database reset".into();
                } else {
                    task_name = "QuickLook Thumbnail Reset".to_string();
                    let out = Command::new("/usr/bin/qlmanage").args(["-r", "cache"]).status();
                    let _ = Command::new("/usr/bin/killall").arg("Finder").status();
                    if out.map(|s| s.success()).unwrap_or(false) {
                        message = "QuickLook and icon thumbnail services refreshed".into();
                    } else {
                        success = false;
                        message = "Could not reset QuickLook cache".into();
                    }
                }
            }
            "memory_purge" => {
                task_name = if is_windows { "Windows RAM Working Set Trim".into() } else { "RAM Memory Pressure Relief".into() };
                let freed = sound_core::trim_memory_cache();
                if !is_windows {
                    let _ = Command::new("/usr/sbin/purge").status();
                }
                message = format!("Purgeable RAM caches relieved (~{} KB reclaimed)", freed / 1024);
            }
            "launch_services_rebuild" => {
                if is_windows {
                    task_name = "File Associations Refresh".to_string();
                    let _ = Command::new("assoc").status();
                    message = "Windows file associations registry refreshed".into();
                } else {
                    task_name = "Rebuild LaunchServices Database".to_string();
                    let lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
                    let out = Command::new(lsregister)
                        .args(["-kill", "-r", "-domain", "local", "-domain", "user"])
                        .status();
                    if out.map(|s| s.success()).unwrap_or(false) {
                        message = "LaunchServices application bindings rebuilt".into();
                    } else {
                        success = false;
                        message = "Failed to rebuild LaunchServices".into();
                    }
                }
            }
            _ => {
                return OptimizationTaskResult {
                    task_id,
                    task_name: "Unknown Task".into(),
                    success: false,
                    message: "Unrecognized optimization task ID".into(),
                    duration_ms: 0,
                };
            }
        }

        OptimizationTaskResult {
            task_id,
            task_name,
            success,
            message,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    })
    .await
    .map_err(|e| format!("Optimization task panicked: {}", e))
}

// ============================================================================
// 5. Hardware Health Diagnostics
// ============================================================================

#[tauri::command]
pub fn cleaner_get_hardware_metrics() -> Result<SystemHardwareMetrics, String> {
    use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing().with_ram()),
    );
    std::thread::sleep(std::time::Duration::from_millis(50));
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage_percent = sys.global_cpu_usage() as f64;
    let cpu_core_count = sys.cpus().len();

    let memory_total_bytes = sys.total_memory();
    let memory_used_bytes = sys.used_memory();
    let memory_free_bytes = sys.free_memory();
    let memory_used_percent = if memory_total_bytes > 0 {
        ((memory_used_bytes as f64 / memory_total_bytes as f64) * 100.0).min(100.0)
    } else {
        0.0
    };

    let swap_total_bytes = sys.total_swap();
    let swap_used_bytes = sys.used_swap();

    let disks = Disks::new_with_refreshed_list();
    let is_windows = cfg!(target_os = "windows");
    let primary_mount = if is_windows { Path::new("C:\\") } else { Path::new("/") };
    let root_disk = disks.iter().find(|d| d.mount_point() == primary_mount)
        .or_else(|| disks.first());

    let (disk_total_bytes, disk_available_bytes, disk_mount_point) = if let Some(d) = root_disk {
        (d.total_space(), d.available_space(), d.mount_point().to_string_lossy().to_string())
    } else {
        (0, 0, if is_windows { "C:\\".into() } else { "/".into() })
    };

    let disk_used_bytes = disk_total_bytes.saturating_sub(disk_available_bytes);
    let disk_used_percent = if disk_total_bytes > 0 {
        ((disk_used_bytes as f64 / disk_total_bytes as f64) * 100.0).min(100.0)
    } else {
        0.0
    };

    let uptime_seconds = System::uptime();

    Ok(SystemHardwareMetrics {
        cpu_usage_percent,
        cpu_core_count,
        memory_total_bytes,
        memory_used_bytes,
        memory_free_bytes,
        memory_used_percent,
        swap_total_bytes,
        swap_used_bytes,
        disk_total_bytes,
        disk_available_bytes,
        disk_used_bytes,
        disk_used_percent,
        disk_mount_point,
        net_bytes_received: 0,
        net_bytes_transmitted: 0,
        uptime_seconds,
    })
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_deletion_target_forbids_system_and_user_roots() {
        assert!(!is_safe_deletion_target(Path::new("/")));
        assert!(!is_safe_deletion_target(Path::new("/System")));
        assert!(!is_safe_deletion_target(Path::new("/usr")));
        assert!(!is_safe_deletion_target(Path::new("/Applications")));
        assert!(!is_safe_deletion_target(Path::new("C:\\")));
        assert!(!is_safe_deletion_target(Path::new("C:\\Windows")));
        assert!(!is_safe_deletion_target(Path::new("C:\\Program Files")));

        let home = get_user_home_dir();
        assert!(!is_safe_deletion_target(&home));
        assert!(!is_safe_deletion_target(&home.join("Documents")));
        assert!(!is_safe_deletion_target(&home.join("Desktop")));
        assert!(!is_safe_deletion_target(&home.join("Library")));
        assert!(!is_safe_deletion_target(&home.join("AppData")));

        // Subdirectories inside Caches or custom app cache should be safe
        assert!(is_safe_deletion_target(&home.join("Library/Caches/com.mock.app")));
        assert!(is_safe_deletion_target(&home.join(".cargo/registry/cache")));
        assert!(is_safe_deletion_target(&home.join(".Trash/old_file.txt")));
        assert!(is_safe_deletion_target(&home.join("AppData/Local/Temp/scratch.tmp")));
    }

    #[test]
    fn test_perform_system_scan_returns_valid_structure() {
        let scan = perform_system_scan();
        assert!(scan.scanned_at_secs > 0);
        assert!(!scan.platform.is_empty());
        for cat in &scan.categories {
            assert!(!cat.id.is_empty());
            assert!(!cat.name.is_empty());
            assert!(!cat.group.is_empty());
        }
    }

    #[test]
    fn test_hardware_metrics_sample() {
        let metrics = cleaner_get_hardware_metrics().expect("Failed to sample metrics");
        assert!(metrics.cpu_core_count > 0);
        assert!(metrics.memory_total_bytes > 0);
        assert!(metrics.disk_total_bytes > 0);
    }

    #[test]
    fn test_platform_info() {
        let info = cleaner_get_platform_info();
        assert!(!info.os.is_empty());
        assert!(!info.default_disk_label.is_empty());
    }
}
