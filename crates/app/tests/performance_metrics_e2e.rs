use rust_sound_lib::core::{get_memory_info, trim_memory_cache};
use rust_sound_lib::{
    AppPerformanceMetrics, AppState, AudioRouter, BreakTimerManager, InputBlocker, PresetStore, GestureEngine, PetManager, PingloomSettings,
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
        assert!(mem.phys_footprint_bytes > 0, "Physical footprint should be positive");
        assert!(mem.phys_footprint_mb > 0.0, "Physical footprint MB should be positive");
    }

    // 2. Verify memory pressure relief executes safely
    let freed_hint = trim_memory_cache();
    let _ = freed_hint;

    // 3. Verify AppState lifecycle with metrics and background toggle
    let temp_file = env::temp_dir().join(format!("rust_sound_perf_e2e_{}.json", std::process::id()));
    let store = PresetStore::new(&temp_file);
    let router = AudioRouter::new(48000.0);
    let timer = BreakTimerManager::default();
    let auth = std::sync::Arc::new(rust_sound_lib::engine::auth::remote::RemoteAuth::new(""));
    let pet = PetManager::new();

    let state = AppState {
        router: std::sync::Arc::new(Mutex::new(router)),
        spotify: Default::default(),
        app_tap: Default::default(),
        preset_store: Mutex::new(store),
        timer: Mutex::new(timer),
        auth,
        pet,
        wheel_settings: Mutex::new(PingloomSettings::default()),
        gesture_engine: Mutex::new(GestureEngine::default()),
        gemini_api_key: Mutex::new(None),
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
        input_blocker: InputBlocker::new(),
        #[cfg(target_os = "macos")]
        gesture_listener: Mutex::new(None),
    };

    assert!(!state.background_mode.load(Ordering::Relaxed));
    state.background_mode.store(true, Ordering::Relaxed);
    assert!(state.background_mode.load(Ordering::Relaxed));

    let metrics = AppPerformanceMetrics {
        resident_size_bytes: mem.resident_size_bytes,
        resident_size_mb: mem.resident_size_mb,
        virtual_size_bytes: mem.virtual_size_bytes,
        virtual_size_mb: mem.virtual_size_mb,
        phys_footprint_bytes: mem.phys_footprint_bytes,
        phys_footprint_mb: mem.phys_footprint_mb,
        peak_phys_footprint_bytes: mem.peak_phys_footprint_bytes,
        peak_phys_footprint_mb: mem.peak_phys_footprint_mb,
        uptime_seconds: state.start_time.elapsed().as_secs(),
        background_mode_active: state.background_mode.load(Ordering::Relaxed),
    };

    assert!(metrics.background_mode_active);

    // Cleanup
    if temp_file.exists() {
        let _ = std::fs::remove_file(temp_file);
    }
}
