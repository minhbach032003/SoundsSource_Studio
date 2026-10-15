use rust_sound_lib::engine::wheel::{pick_slice, get_default_catalog, DIRECTIONS};
use rust_sound_lib::{AppState, AudioRouter, AuthService, BreakTimerManager, PetManager, PingloomSettings, PresetStore};
use std::env;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::Instant;

#[test]
fn test_ping_wheel_settings_and_geometry_e2e() {
    let temp_file = env::temp_dir().join(format!("rust_sound_wheel_e2e_{}.json", std::process::id()));
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
        wheel_settings: Mutex::new(PingloomSettings::default()),
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
    };

    // 1. Verify initial settings and dual triggers
    let initial = state.wheel_settings.lock().unwrap().clone();
    assert_eq!(initial.trigger, "alt");
    assert_eq!(initial.emote_trigger.as_deref(), Some("ctrl"));
    assert_eq!(initial.wheel.len(), 8);
    assert_eq!(initial.emote_wheel.len(), 8);
    assert!(initial.validate().is_ok());

    // 2. Verify geometry resolution
    let dead_zone = initial.drag_threshold_px as f64;
    // Inside dead zone
    assert_eq!(pick_slice(10.0, 10.0, dead_zone), None);

    // North (dy = -100)
    let north_slice = pick_slice(0.0, -100.0, dead_zone).expect("North slice");
    assert_eq!(north_slice, 0);
    assert_eq!(DIRECTIONS[north_slice], "N");
    assert_eq!(initial.wheel[north_slice], "danger");

    // East (dx = 100)
    let east_slice = pick_slice(100.0, 0.0, dead_zone).expect("East slice");
    assert_eq!(east_slice, 2);
    assert_eq!(DIRECTIONS[east_slice], "E");
    assert_eq!(initial.wheel[east_slice], "omw");

    // South (dy = 100)
    let south_slice = pick_slice(0.0, 100.0, dead_zone).expect("South slice");
    assert_eq!(south_slice, 4);
    assert_eq!(DIRECTIONS[south_slice], "S");
    assert_eq!(initial.wheel[south_slice], "assist");

    // 3. Verify catalog enumeration
    let catalog = get_default_catalog();
    assert!(catalog.iter().any(|c| c.id == "danger" && (c.category == "tactical" || c.category == "ping")));
    assert!(catalog.iter().any(|c| c.id == "come_at_me" && (c.category == "emotes" || c.category == "emote")));

    // 4. Verify settings update and validation
    let mut updated = initial.clone();
    updated.volume = 90;
    updated.drag_threshold_px = 64;
    assert!(updated.validate().is_ok());

    *state.wheel_settings.lock().unwrap() = updated.clone();
    assert_eq!(state.wheel_settings.lock().unwrap().volume, 90);
    assert_eq!(state.wheel_settings.lock().unwrap().drag_threshold_px, 64);

    // 5. Verify dual-mode wheel slots distinction
    let current = state.wheel_settings.lock().unwrap();
    assert_eq!(current.wheel[0], "danger"); // Tactical LoL ping
    assert_eq!(current.emote_wheel[0], "come_at_me"); // Emote icon
    assert_ne!(current.wheel[0], current.emote_wheel[0]);
}
