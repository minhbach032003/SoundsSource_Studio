use rust_sound_lib::engine::wheel::{pick_slice, get_default_catalog, DIRECTIONS};
use rust_sound_lib::{
    AppState, AudioRouter, BreakTimerManager, GestureEngine, GestureState,
    InputBlocker, InputEvent, PetManager, PingloomSettings, Point, PresetStore,
};
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
        memory: std::sync::Arc::new(sound_core::MemoryCleaner::new(std::env::temp_dir().join(format!("policy_{}.json", std::process::id())))),
        wheel_settings: Mutex::new(PingloomSettings::default()),
        gesture_engine: Mutex::new(GestureEngine::default()),
        gemini_api_key: Mutex::new(None),
        start_time: Instant::now(),
        background_mode: AtomicBool::new(false),
        input_blocker: InputBlocker::new(),
        #[cfg(target_os = "macos")]
        gesture_listener: Mutex::new(None),
        google_calendar: Default::default(),
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

    // 6. Verify GestureEngine state machine transitions in AppState
    let mut engine = state.gesture_engine.lock().unwrap();
    assert_eq!(engine.state(), GestureState::Idle);

    // KeyDown Alt (0xa4)
    let alt_down = InputEvent::KeyDown { vk: 0xa4, injected: false };
    engine.on_event(alt_down);

    // PointerDown Left button
    let ptr_down = InputEvent::PointerDown {
        button: rust_sound_lib::Button::Left,
        point: Point::new(100, 100),
        time_ms: 10,
        injected: false,
        fullscreen_app: false,
        dpi_scale: 1.0,
    };
    let decision = engine.on_event(ptr_down);
    assert!(decision.swallow);
    assert_eq!(engine.state(), GestureState::Pending);

    // PointerMove beyond threshold
    let ptr_move = InputEvent::PointerMove {
        point: Point::new(150, 100),
        time_ms: 20,
        injected: false,
    };
    let move_decision = engine.on_event(ptr_move);
    assert_eq!(engine.state(), GestureState::Wheel);
    assert!(!move_decision.actions.is_empty());

    // PointerUp releases and selects
    let ptr_up = InputEvent::PointerUp {
        button: rust_sound_lib::Button::Left,
        point: Point::new(150, 100),
        time_ms: 30,
        injected: false,
    };
    let up_decision = engine.on_event(ptr_up);
    assert!(up_decision.swallow);
    assert_eq!(engine.state(), GestureState::Idle);
}

#[test]
fn test_pingloom_native_macos_event_tap_and_permissions_e2e() {
    #[cfg(target_os = "macos")]
    {
        use std::sync::Arc;

        // 1. Accessibility permissions check returns a valid boolean
        let trusted = pingloom::is_accessibility_trusted(false);
        let _ = trusted;

        // 2. Test NativeGestureListener lifecycle and start_gesture_monitor
        let actions_received = Arc::new(Mutex::new(Vec::new()));
        let cb_actions = Arc::clone(&actions_received);
        let callback: pingloom::ActionCallback = Arc::new(move |action, origin, scale| {
            cb_actions.lock().unwrap().push((action, origin, scale));
        });

        let default_settings = pingloom::Settings::default();
        let mut listener = pingloom::start_gesture_monitor(default_settings, callback)
            .expect("start_gesture_monitor succeeds");
        assert!(listener.is_running());

        // 3. Test settings update on listener
        let mut new_settings = pingloom::Settings::default();
        new_settings.drag_threshold_px = 40;
        assert!(listener.update_settings(new_settings).is_ok());

        // 4. Test serialization of pingloom:action payload
        let sample_action = pingloom::Action::WheelOpen {
            wheel: pingloom::WheelKind::Ping,
            origin: pingloom::Point::new(400, 300),
        };
        let action_payload = serde_json::json!({
            "action": sample_action,
            "origin": Some(pingloom::Point::new(400, 300)),
            "scale": 1.0,
            "event_type": "wheel_open",
        });
        let payload_str = serde_json::to_string(&action_payload).expect("payload serializes");
        assert!(payload_str.contains("wheel_open"));
        assert!(payload_str.contains("400"));

        // 5. Test stop
        listener.stop();
        assert!(!listener.is_running());
    }
}

#[test]
fn test_pingloom_assets_pipeline_and_manifest_e2e() {
    // 1. Verify root pingloom assets directory resolves
    let assets_dir = rust_sound_lib::resolve_pingloom_assets_dir();
    assert!(assets_dir.is_some(), "Pingloom assets directory must resolve");
    let base = assets_dir.unwrap();
    assert!(base.join("sounds").is_dir(), "sounds directory must exist");
    assert!(base.join("emotes").is_dir(), "emotes directory must exist");
    assert!(base.join("textures").is_dir(), "textures directory must exist");

    // 2. Verify subpath asset resolution
    let danger_sound = rust_sound_lib::resolve_pingloom_asset_path("sounds/Danger.ogg");
    assert!(danger_sound.is_some(), "Danger.ogg must be found on disk");
    assert!(danger_sound.unwrap().is_file());

    let omw_sound = rust_sound_lib::resolve_pingloom_asset_path("sounds/OnMyWay.ogg");
    assert!(omw_sound.is_some(), "OnMyWay.ogg must be found on disk");

    let emote_sound = rust_sound_lib::resolve_pingloom_asset_path("emotes/gg_heart.ogg");
    assert!(emote_sound.is_some(), "gg_heart.ogg must be found on disk");

    // 3. Verify trigger_ping_sound for various sound identifiers
    let danger_res = rust_sound_lib::trigger_ping_sound("danger", Some(0.0));
    assert!(danger_res.is_ok(), "trigger_ping_sound('danger') must succeed");

    let omw_res = rust_sound_lib::trigger_ping_sound("omw", Some(0.0));
    assert!(omw_res.is_ok(), "trigger_ping_sound('omw') must succeed");

    let direct_sound_res = rust_sound_lib::trigger_ping_sound("Danger.ogg", Some(0.0));
    assert!(direct_sound_res.is_ok(), "trigger_ping_sound('Danger.ogg') must succeed");

    let button_sound_res = rust_sound_lib::trigger_ping_sound("button.ogg", Some(0.0));
    assert!(button_sound_res.is_ok(), "trigger_ping_sound('button.ogg') must succeed");

    let emote_res = rust_sound_lib::trigger_ping_sound("gg_heart", Some(0.0));
    assert!(emote_res.is_ok(), "trigger_ping_sound('gg_heart') must succeed");

    let invalid_res = rust_sound_lib::trigger_ping_sound("non_existent_xyz_123", Some(0.0));
    assert!(invalid_res.is_err(), "Invalid sound name must return error");

    // 4. Verify sound_engine audio resolver
    assert_eq!(
        sound_engine::wheel::resolve_sound_filename("danger"),
        Some("sounds/Danger.ogg".to_string())
    );
    assert_eq!(
        sound_engine::wheel::resolve_sound_filename("omw"),
        Some("sounds/OnMyWay.ogg".to_string())
    );
    assert_eq!(
        sound_engine::wheel::resolve_sound_filename("push"),
        Some("sounds/SRP_9.ogg".to_string())
    );
    assert_eq!(
        sound_engine::wheel::resolve_sound_filename("allin"),
        Some("sounds/SRP_4.ogg".to_string())
    );
}

#[test]
fn test_pingloom_action_sound_and_select_lifecycle() {
    // Test Action::Sound serialization and deserialization
    let sound_action = pingloom::Action::Sound {
        sound: "Danger.ogg".to_string(),
    };
    let json_val = serde_json::to_value(&sound_action).expect("serializes to json");
    assert_eq!(json_val["type"], "sound");
    assert_eq!(json_val["data"]["sound"], "Danger.ogg");

    let deserialized: pingloom::Action = serde_json::from_value(json_val).expect("deserializes");
    assert_eq!(deserialized, sound_action);

    // Test Action::Select serialization and deserialization
    let select_action = pingloom::Action::Select {
        wheel: pingloom::WheelKind::Ping,
        slot: 2,
        point: pingloom::Point::new(200, 250),
    };
    let select_json = serde_json::to_value(&select_action).expect("serializes to json");
    assert_eq!(select_json["type"], "select");
    assert_eq!(select_json["data"]["slot"], 2);

    let deserialized_select: pingloom::Action = serde_json::from_value(select_json).expect("deserializes");
    assert_eq!(deserialized_select, select_action);
}
