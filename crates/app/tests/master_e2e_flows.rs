use rust_sound_lib::core::{get_memory_info, trim_memory_cache, AudioDevice};
use rust_sound_lib::engine::wheel::{get_default_catalog, pick_slice, DIRECTIONS};
use rust_sound_lib::engine::{
    ActivityFormatter, ActivityTheme, AgentEvent, AgentState, AudioFilterSettings, AudioRouter,
    AuthService, BreakClock, BreakClockConfig, BreakTickResult, BreakTimerManager, Button,
    GestureEngine, GestureState, InputEvent, MicFilterConfig, ModelPricing, OutputFilterConfig,
    PetCareState, PetCareStore, PingloomSettings, Pkce, Point, QuestionDetector,
    SessionStore, TimerPhase,
};
use std::env;
use std::fs;
use std::time::{Duration, SystemTime};

// MARK: - Flow 1: Master Audio Pipeline, EQ & Voice Filter E2E

#[test]
fn test_flow_1_audio_pipeline_routing_and_dsp_filters() {
    let sample_rate = 48000.0f32;
    let mut router = AudioRouter::new(sample_rate);
    let app_bundle = "com.spotify.client";

    // 1. Hardware device enumeration
    let devices = AudioDevice::enumerate_system_devices();
    assert!(!devices.is_empty(), "Must enumerate at least one system audio device");

    let inputs = AudioDevice::enumerate_system_input_devices();
    assert!(!inputs.is_empty(), "Must enumerate microphone input devices");

    // 2. Master Volume, Mute & Stereo Balance
    let orig_vol = AudioDevice::get_master_volume();
    assert!(orig_vol >= 0.0 && orig_vol <= 1.0);
    let _ = AudioDevice::set_master_volume(orig_vol);
    let _ = AudioDevice::set_master_mute(false);

    // Stereo balance attenuation
    router.set_master_balance(0.5); // 50% Right
    assert_eq!(router.get_master_balance(), 0.5);

    // 3. Application Channel Setup & Processing
    let channel = router.get_or_create_channel(app_bundle);
    channel.volume = 0.80;
    channel.eq.set_band_gain(0, 4.0); // +4 dB on 32 Hz
    channel.eq.set_band_gain(5, -3.0); // -3 dB on 1 kHz

    let mut audio_buffer = vec![0.5f32; 256];
    channel.process(&mut audio_buffer);
    assert!(!audio_buffer.is_empty());
    assert!(audio_buffer[0] > 0.0);

    // Mute channel
    channel.muted = true;
    channel.process(&mut audio_buffer);
    for sample in &audio_buffer {
        assert_eq!(*sample, 0.0, "Muted channel must zero samples");
    }

    // 4. Master 10-Band Linear Phase Parametric EQ
    assert_eq!(router.master_eq().bands().len(), 10);
    router.set_master_eq_band(0, 5.5); // Bass boost 32 Hz
    router.set_master_eq_band(1, 4.0); // Bass boost 64 Hz
    assert_eq!(router.master_eq().bands()[0].gain, 5.5);
    assert_eq!(router.master_eq().bands()[1].gain, 4.0);

    let mut master_buffer = vec![0.3f32; 128];
    router.process_master(&mut master_buffer);
    assert!(master_buffer[0] != 0.0);

    // Reset flat
    router.reset_master_eq();
    for band in router.master_eq().bands() {
        assert_eq!(band.gain, 0.0);
    }

    // 5. Real-Time Audio Filter Engine (Voice Isolation, Noise Gate, Rumble Cut)
    let filter_settings = AudioFilterSettings {
        mic: MicFilterConfig {
            enabled: true,
            noise_gate_enabled: true,
            noise_gate_threshold_db: -40.0,
            high_pass_enabled: true,
            high_pass_cutoff_hz: 85.0,
            voice_presence_enabled: true,
            voice_presence_db: 3.5,
            de_esser_enabled: true,
        },
        output: OutputFilterConfig {
            enabled: true,
            dialogue_boost: true,
            night_mode_compression: true,
            bass_warmth: true,
            de_hiss: true,
        },
    };
    router.set_filter_settings(filter_settings);

    // Feed quiet background typing noise (-60dB) -> Noise gate must attenuate
    let mut quiet_noise = vec![0.0008f32; 512];
    let stats = router.process_mic_buffer(&mut quiet_noise);
    assert!(!stats.gate_open, "Gate must remain closed on quiet ambient noise");
    assert!(stats.output_peak_db <= stats.input_peak_db);

    // Restore volume
    let _ = AudioDevice::set_master_volume(orig_vol);
}

// MARK: - Flow 2: Pingloom Tactical Radial Wheel & Hotkey Gesture Engine E2E

#[test]
fn test_flow_2_pingloom_wheel_and_gesture_lifecycle() {
    let settings = PingloomSettings::default();
    assert_eq!(settings.wheel.len(), 8);
    assert_eq!(settings.emote_wheel.len(), 8);
    assert!(settings.validate().is_ok());

    // 1. Gesture Engine instantiation & Hotkey binding
    let mut engine = GestureEngine::default();
    assert_eq!(engine.state(), GestureState::Idle);

    // Press Alt Trigger (0xa4)
    let alt_down = InputEvent::KeyDown {
        vk: 0xa4,
        injected: false,
    };
    engine.on_event(alt_down);

    // PointerDown Left button
    let ptr_down = InputEvent::PointerDown {
        button: Button::Left,
        point: Point::new(500, 500),
        time_ms: 10,
        injected: false,
        fullscreen_app: false,
        dpi_scale: 1.0,
    };
    let decision = engine.on_event(ptr_down);
    assert!(decision.swallow);
    assert_eq!(engine.state(), GestureState::Pending);

    // PointerMove beyond threshold to North (dy = -80)
    let ptr_move = InputEvent::PointerMove {
        point: Point::new(500, 420),
        time_ms: 20,
        injected: false,
    };
    let move_decision = engine.on_event(ptr_move);
    assert_eq!(engine.state(), GestureState::Wheel);
    assert!(!move_decision.actions.is_empty());

    // PointerUp -> triggers selection
    let ptr_up = InputEvent::PointerUp {
        button: Button::Left,
        point: Point::new(500, 420),
        time_ms: 30,
        injected: false,
    };
    let release_decision = engine.on_event(ptr_up);
    assert!(release_decision.swallow);
    assert_eq!(engine.state(), GestureState::Idle);

    // 2. Geometry detection test
    let dead_zone = settings.drag_threshold_px as f64;
    let north_slice = pick_slice(0.0, -80.0, dead_zone).expect("North slice");
    assert_eq!(north_slice, 0);
    assert_eq!(DIRECTIONS[north_slice], "N");

    let east_slice = pick_slice(80.0, 0.0, dead_zone).expect("East slice");
    assert_eq!(east_slice, 2);
    assert_eq!(DIRECTIONS[east_slice], "E");

    // 3. Catalog enumeration test
    let catalog = get_default_catalog();
    assert!(catalog.iter().any(|c| c.id == "danger"));
    assert!(catalog.iter().any(|c| c.id == "omw"));
    assert!(catalog.iter().any(|c| c.id == "come_at_me"));

    // 4. Persistence test
    let temp_file = env::temp_dir().join(format!("pingloom_settings_{}.json", uuid::Uuid::new_v4()));
    let json = serde_json::to_string_pretty(&settings).unwrap();
    assert!(fs::write(&temp_file, json).is_ok());

    let reloaded: PingloomSettings =
        serde_json::from_str(&fs::read_to_string(&temp_file).unwrap()).unwrap();
    assert_eq!(reloaded.wheel.len(), 8);
    let _ = fs::remove_file(temp_file);
}

// MARK: - Flow 3: Focus Pomodoro Timer & Audio Ducking E2E

#[test]
fn test_flow_3_pomodoro_timer_and_timeboxed_todos() {
    let mut timer = BreakTimerManager::new(25 * 60, 5 * 60);
    let mut router = AudioRouter::new(48000.0);
    router.set_app_volume("com.spotify.client", 0.9);
    router.set_app_volume("com.brave.Browser", 0.7);

    assert_eq!(timer.phase, TimerPhase::Idle);

    // 1. Start Pomodoro
    timer.start();
    assert_eq!(timer.phase, TimerPhase::Studying);
    assert!(!timer.is_ducked);

    // 2. Add timeboxed Todos
    timer.add_todo("Refactor CoreAudio engine");
    timer.add_todo("Calibrate 10-band parametric equalizer");
    assert_eq!(timer.get_todos().len(), 2);

    let id0 = timer.get_todos()[0].id.clone();
    timer.toggle_todo(&id0);
    assert!(timer.get_todos()[0].is_completed);

    // 3. Trigger Warning & Break with Audio Ducking
    timer.stop(None);
    timer.set_durations(8, 20);
    timer.start();
    let transition = timer.tick(Some(&mut router));
    assert_eq!(transition, Some(TimerPhase::Warning));
    assert_eq!(timer.phase, TimerPhase::Warning);

    // Force expiry into break by setting past deadline
    timer.set_deadline_for_test(Some(SystemTime::now() - Duration::from_secs(1)));
    let break_transition = timer.tick(Some(&mut router));
    assert_eq!(break_transition, Some(TimerPhase::Breaking));
    assert_eq!(timer.phase, TimerPhase::Breaking);
    assert!(timer.is_ducked);

    // Verify audio ducked to 0.15 multiplier
    let ch_spotify = router.get_or_create_channel("com.spotify.client");
    assert!((ch_spotify.volume - (0.9 * 0.15)).abs() < 1e-4);

    // 4. Skip break -> Restores audio volumes
    timer.skip(Some(&mut router));
    assert_eq!(timer.phase, TimerPhase::Studying);
    assert!(!timer.is_ducked);

    let ch_spotify_restored = router.get_or_create_channel("com.spotify.client");
    assert!((ch_spotify_restored.volume - 0.9).abs() < 1e-4);
}

// MARK: - Flow 4: AgentPet Companion, Thematic Activity & Question Detector E2E

#[test]
fn test_flow_4_agent_pet_companion_and_workflow_ingestion() {
    let temp_dir = env::temp_dir().join(format!("agentpet_flow4_{}", uuid::Uuid::new_v4()));
    let _ = fs::create_dir_all(&temp_dir);

    // 1. PetCare Tamagotchi progression
    let mut state = PetCareState::default();
    assert_eq!(state.level(), 1);
    assert_eq!(state.display_level(), 0);
    assert_eq!(state.stage_name(), "Hatchling");

    // Feed 10,000 tokens -> +2 XP
    let gained = state.feed_tokens(10_000, 1000);
    assert_eq!(gained, 2);
    assert_eq!(state.xp, 2);

    // Record meal -> +25 XP
    let meal_xp = state.record_meal(1005);
    assert_eq!(meal_xp, 25);
    assert_eq!(state.xp, 27);
    assert_eq!(state.total_meals, 1);

    // Dual-store persistence
    let store1_path = temp_dir.join("petcare1.json");
    let store2_path = temp_dir.join("petcare2.json");
    let care_store = PetCareStore::with_secondary(&store1_path, &store2_path);
    assert!(care_store.save(&state).is_ok());

    let loaded = care_store.load();
    assert_eq!(loaded.xp, 27);

    // 2. Activity Formatter across Themes
    let chef_act = ActivityFormatter::format(
        "PreToolUse",
        Some("Edit"),
        Some("src/App.tsx"),
        None,
        ActivityTheme::Chef,
    );
    assert!(chef_act.contains("React") || chef_act.contains("App.tsx"));

    let eng_act = ActivityFormatter::format(
        "PreToolUse",
        Some("Bash"),
        None,
        Some("cargo test"),
        ActivityTheme::Engineer,
    );
    assert!(eng_act.contains("cargo test") || eng_act.contains("pipeline") || eng_act.contains("Executing"));

    // 3. Question Detector & State Refinement
    assert!(QuestionDetector::looks_like_question("Should I apply this migration?"));
    assert!(QuestionDetector::looks_like_question("Which component should we update first?"));
    assert!(!QuestionDetector::looks_like_question("Completed all tasks. Let me know if you need anything else."));

    let mut session_store = SessionStore::new();
    let ev_question = AgentEvent {
        session_id: "claude-q1".into(),
        agent_kind: "claude".into(),
        event_name: "Stop".into(),
        message: Some("Would you like me to run the build now?".into()),
        ..Default::default()
    };
    let (st, _) = session_store.apply(ev_question, 2000);
    assert_eq!(st, Some(AgentState::Waiting), "Question must refine Stop event to Waiting");

    // 4. Model Pricing Calculation
    let cost_sonnet = ModelPricing::cost_usd(Some("claude-3-7-sonnet"), 1_000_000, 1_000_000, 0, 0);
    assert!((cost_sonnet - 18.0).abs() < 1e-4);

    // 5. Break Clock
    let mut clock = BreakClock::new();
    let config = BreakClockConfig {
        enabled: true,
        work_interval_secs: 15,
        break_length_secs: 5,
        max_delta_secs: 60,
    };
    assert_eq!(clock.tick(1000, true, &config), BreakTickResult::None);
    assert_eq!(clock.tick(1016, true, &config), BreakTickResult::BreakDue);
    assert!(clock.is_resting());

    let _ = fs::remove_dir_all(temp_dir);
}

// MARK: - Flow 5: Dual Auth, PKCE & Security Subsystem E2E

#[test]
fn test_flow_5_security_pkce_and_dual_auth() {
    // 1. PKCE S256 Challenge Generation & Constant-Time Verification
    let challenge = Pkce::generate_challenge();
    assert_eq!(challenge.code_challenge_method, "S256");
    assert!(challenge.code_verifier.len() >= 43);

    let valid = Pkce::verify(
        &challenge.code_verifier,
        &challenge.code_challenge,
        &challenge.code_challenge_method,
    );
    assert_eq!(valid.unwrap(), true);

    let tampered = format!("{}a", &challenge.code_verifier[1..]);
    assert!(Pkce::verify(&tampered, &challenge.code_challenge, &challenge.code_challenge_method).is_err());

    // 2. Internal HMAC-SHA256 JWT
    let secret = "master-e2e-jwt-secret-key-2026";
    let auth = AuthService::new(secret, "mock_neon_url");
    let claims = auth.jwt.create_claims("user-123", "sess-456", "user@example.com", "Test User");
    let token = auth.jwt.sign(&claims).expect("Signed JWT token");

    let verified = auth.jwt.verify(&token).expect("Token verified");
    assert_eq!(verified.sub, "user-123");
    assert_eq!(verified.email, "user@example.com");

    let mut tampered_token = token.clone();
    tampered_token.push('x');
    assert!(auth.jwt.verify(&tampered_token).is_err());
}

// MARK: - Flow 6: Performance Telemetry & Memory Trim E2E

#[test]
fn test_flow_6_performance_diagnostics_and_memory_trim() {
    let mem = get_memory_info();
    assert!(mem.resident_size_bytes > 0, "Resident set size must be > 0");
    assert!(mem.resident_size_mb > 0.0);

    let freed = trim_memory_cache();
    println!("Master E2E: memory pressure relief executed, hint: {} bytes", freed);
}
