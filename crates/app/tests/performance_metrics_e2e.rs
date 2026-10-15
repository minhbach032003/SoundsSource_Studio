use rust_sound_lib::core::{get_memory_info, trim_memory_cache};
use rust_sound_lib::{
    AppPerformanceMetrics, AppState, AudioRouter, BreakTimerManager, PresetStore, AuthService, PetManager,
};
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;

#[test]
fn test_performance_metrics_and_memory_trim_lifecycle() {
    // 1. Verify core memory diagnostics
    let mem = get_memory_info();
    #[cfg(target_os = "macos")]
    {
        assert!(mem.resident_size_bytes > 0, "Resident size should be positive");
        assert!(mem.resident_size_mb > 0.0, "Resident size MB should be positive");
        assert!(mem.virtual_size_bytes >= mem.resident_size_bytes);
    }

    // 2. Verify memory pressure relief executes safely
    let freed_hint = trim_memory_cache();
    let _ = freed_hint;

    // 3. Verify AppState lifecycle with metrics and background toggle
    let temp_file = env::temp_dir().join(format!("rust_sound_perf_e2e_{}.json", std::process::id()));
    let store = PresetStore::new(&temp_file);
    let router = AudioRouter::new(48000.0);
    let timer = BreakTimerManager::default();
    let auth = AuthService::new("secret", "mock_conn");
    let pet = PetManager::new();

    let state = AppState {
        router: Mutex::new(router),
        preset_store: Mutex::new(store),
        timer: Mutex::new(timer),
        auth,
        pet,
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
    };

    assert!(!state.background_mode.load(Ordering::Relaxed));
    state.background_mode.store(true, Ordering::Relaxed);
    assert!(state.background_mode.load(Ordering::Relaxed));

    let metrics = AppPerformanceMetrics {
        resident_size_bytes: mem.resident_size_bytes,
        resident_size_mb: mem.resident_size_mb,
        virtual_size_bytes: mem.virtual_size_bytes,
        virtual_size_mb: mem.virtual_size_mb,
        uptime_seconds: state.start_time.elapsed().as_secs(),
        background_mode_active: state.background_mode.load(Ordering::Relaxed),
    };

    assert!(metrics.background_mode_active);

    // Cleanup
    if temp_file.exists() {
        let _ = std::fs::remove_file(temp_file);
    }
}
