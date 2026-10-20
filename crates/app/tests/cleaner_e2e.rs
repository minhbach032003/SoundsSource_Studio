use rust_sound_lib::cmd_cleaner::*;
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn test_cleaner_safety_boundaries_rigorous() {
    // Critical system paths must ALWAYS be rejected
    assert!(!is_safe_deletion_target(Path::new("/")));
    assert!(!is_safe_deletion_target(Path::new("/System")));
    assert!(!is_safe_deletion_target(Path::new("/System/Library")));
    assert!(!is_safe_deletion_target(Path::new("/usr")));
    assert!(!is_safe_deletion_target(Path::new("/bin")));
    assert!(!is_safe_deletion_target(Path::new("/Applications")));
    assert!(!is_safe_deletion_target(Path::new("/Library")));
    assert!(!is_safe_deletion_target(Path::new("/Users")));

    if let Ok(home) = std::env::var("HOME") {
        let h = PathBuf::from(home);
        // User root directory itself must never be deleted
        assert!(!is_safe_deletion_target(&h));

        // Core user folders must never be deleted as a whole
        assert!(!is_safe_deletion_target(&h.join("Desktop")));
        assert!(!is_safe_deletion_target(&h.join("Documents")));
        assert!(!is_safe_deletion_target(&h.join("Downloads")));
        assert!(!is_safe_deletion_target(&h.join("Library")));
        assert!(!is_safe_deletion_target(&h.join("Library/Application Support")));
        assert!(!is_safe_deletion_target(&h.join("Library/Preferences")));
        assert!(!is_safe_deletion_target(&h.join("Library/Containers")));
        assert!(!is_safe_deletion_target(&h.join("Library/Caches")));
        assert!(!is_safe_deletion_target(&h.join("Library/Logs")));

        // Specific subdirectories inside caches and dev tools are permitted
        assert!(is_safe_deletion_target(&h.join("Library/Caches/com.test.app")));
        assert!(is_safe_deletion_target(&h.join("Library/Logs/com.test.app.log")));
        assert!(is_safe_deletion_target(&h.join("Library/Developer/Xcode/DerivedData/Module-abc")));
        assert!(is_safe_deletion_target(&h.join(".cargo/registry/cache")));
    }
}

#[test]
fn test_calculate_dir_size_and_safe_removal() {
    let tmp_path = std::env::temp_dir().join(format!("test_cleaner_dir_{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp_path);
    fs::create_dir_all(&tmp_path).expect("create dir");

    fs::write(tmp_path.join("file1.dat"), vec![0u8; 1024]).expect("write 1");
    fs::write(tmp_path.join("file2.dat"), vec![1u8; 2048]).expect("write 2");

    let sub = tmp_path.join("sub");
    fs::create_dir_all(&sub).expect("create sub");
    fs::write(sub.join("file3.dat"), vec![2u8; 512]).expect("write 3");

    let (bytes, count) = calculate_dir_size(&tmp_path, 5);
    assert_eq!(bytes, 1024 + 2048 + 512);
    assert_eq!(count, 3);
    let _ = fs::remove_dir_all(&tmp_path);
}

#[test]
fn test_cleaner_optimize_tasks_execution() {
    tauri::async_runtime::block_on(async {
        // Test known tasks
        let res_dns = cleaner_optimize_task("dns_flush".into()).await.expect("task run");
        assert_eq!(res_dns.task_id, "dns_flush");
        assert!(!res_dns.task_name.is_empty());

        let res_mem = cleaner_optimize_task("memory_purge".into()).await.expect("task run");
        assert_eq!(res_mem.task_id, "memory_purge");
        assert!(res_mem.success);

        // Test invalid task
        let res_bad = cleaner_optimize_task("invalid_task_xyz".into()).await.expect("task run");
        assert!(!res_bad.success);
        assert_eq!(res_bad.message, "Unrecognized optimization task ID");
    });
}

#[test]
fn test_cleaner_hardware_metrics_contract() {
    let metrics = cleaner_get_hardware_metrics().expect("metrics");
    assert!(metrics.cpu_core_count > 0);
    assert!(metrics.cpu_usage_percent >= 0.0 && metrics.cpu_usage_percent <= 100.0);
    assert!(metrics.memory_total_bytes > 0);
    assert!(metrics.memory_used_percent >= 0.0 && metrics.memory_used_percent <= 100.0);
    assert!(metrics.disk_total_bytes > 0);
    assert!(metrics.disk_used_percent >= 0.0 && metrics.disk_used_percent <= 100.0);
    assert_eq!(metrics.disk_mount_point, "/");
}
