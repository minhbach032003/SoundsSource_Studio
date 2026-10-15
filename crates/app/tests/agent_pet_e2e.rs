use rust_sound_lib::engine::{
    AgentEvent, AgentState, HookManager, PetCareState, PetCareStore, PetHunger,
    PetManager, PetMood, SessionStore,
};
use std::env;
use std::io::Write;
use std::os::unix::net::UnixStream;
use std::thread;
use std::time::Duration;

#[test]
fn test_pet_care_progression_lifecycle() {
    let mut state = PetCareState::default();
    assert_eq!(state.level(), 1);
    assert_eq!(state.display_level(), 0);
    assert_eq!(state.stage_name(), "Hatchling");
    assert_eq!(state.hunger(1000), PetHunger::Peckish);

    // Feed 50,000 tokens -> +10 XP
    let gained = state.feed_tokens(50_000, 1000);
    assert_eq!(gained, 10);
    assert_eq!(state.xp, 10);
    assert_eq!(state.hunger(1000), PetHunger::Full);

    // Record 5 meals -> +125 XP (Total: 135 XP -> Level 2)
    for _ in 0..5 {
        state.record_meal(1000);
    }
    assert_eq!(state.xp, 135);
    assert_eq!(state.level(), 2);
    assert_eq!(state.display_level(), 1);
    assert!(state.unlocked_achievements.contains("firstMeal"));

    // Check store persistence
    let temp_file = env::temp_dir().join(format!("pet_care_test_{}.json", std::process::id()));
    let store = PetCareStore::new(&temp_file);
    assert!(store.save(&state).is_ok());

    let loaded = store.load();
    assert_eq!(loaded.xp, state.xp);
    assert_eq!(loaded.total_meals, 5);
    assert_eq!(loaded.total_tokens, 50_000);

    let _ = std::fs::remove_file(temp_file);
}

#[test]
fn test_agent_session_aggregation_and_moods() {
    let mut store = SessionStore::new();
    assert_eq!(store.aggregate_mood(), PetMood::Idle);

    // 1. Session start for Cursor
    let ev1 = AgentEvent {
        session_id: "cursor-101".into(),
        agent_kind: "cursor".into(),
        event_name: "sessionStart".into(),
        project: Some("/Users/mac/Projects/rust-sound".into()),
        message: None,
        model: None,
        tool_name: None,
        tool_summary: None,
        timestamp: Some(1000),
    };
    store.apply(ev1, 1000);
    assert_eq!(store.aggregate_mood(), PetMood::Idle);

    // 2. Claude submits prompt -> Working
    let ev2 = AgentEvent {
        session_id: "claude-202".into(),
        agent_kind: "claude".into(),
        event_name: "UserPromptSubmit".into(),
        project: Some("/Users/mac/Projects/agentpet".into()),
        message: Some("Porting engine to Rust".into()),
        model: Some("Claude 3.7 Sonnet".into()),
        tool_name: None,
        tool_summary: None,
        timestamp: Some(1010),
    };
    store.apply(ev2, 1010);
    assert_eq!(store.aggregate_mood(), PetMood::Working);

    // 3. Claude needs permission -> Waiting
    let ev3 = AgentEvent {
        session_id: "claude-202".into(),
        agent_kind: "claude".into(),
        event_name: "Notification".into(),
        project: None,
        message: None,
        model: None,
        tool_name: Some("Bash".into()),
        tool_summary: Some("cargo build".into()),
        timestamp: Some(1020),
    };
    store.apply(ev3, 1020);
    assert_eq!(store.aggregate_mood(), PetMood::Waiting);

    // 4. Finished session -> Done
    let ev4 = AgentEvent {
        session_id: "claude-202".into(),
        agent_kind: "claude".into(),
        event_name: "Stop".into(),
        project: None,
        message: None,
        model: None,
        tool_name: None,
        tool_summary: None,
        timestamp: Some(1030),
    };
    let (_, meal) = store.apply(ev4, 1030);
    assert!(meal);
    assert_eq!(store.aggregate_mood(), PetMood::Done);

    let display_list = store.to_display_list();
    assert_eq!(display_list.len(), 2);
}

#[test]
fn test_agent_integrations_catalog() {
    let catalog = HookManager::catalog();
    assert!(catalog.len() >= 5);
    assert!(catalog.iter().any(|a| a.kind == "claude"));
    assert!(catalog.iter().any(|a| a.kind == "codex"));
    assert!(catalog.iter().any(|a| a.kind == "cursor"));
    assert!(catalog.iter().any(|a| a.kind == "gemini"));
    assert!(catalog.iter().any(|a| a.kind == "pi"));
}

#[test]
fn test_pet_manager_and_unix_socket_server() {
    let pet = PetManager::new();
    pet.start_daemon();

    // Verify initial care state
    let care = pet.get_care_state();
    assert!(care.level() >= 1);

    // Apply care actions
    let after_coffee = pet.apply_care_action("coffee");
    assert!(after_coffee.xp >= care.xp + 25);

    let after_tuna = pet.apply_care_action("tuna");
    assert!(after_tuna.xp >= after_coffee.xp + 20);

    // Send a live test event over Unix socket
    let socket_path = rust_sound_lib::engine::AgentPetServer::default_socket_path();
    if let Ok(mut stream) = UnixStream::connect(&socket_path) {
        let test_event = serde_json::json!({
            "sessionId": "test-e2e-session",
            "agentKind": "claude",
            "eventName": "UserPromptSubmit",
            "project": "rust-sound",
            "message": "Testing Unix socket ingestion",
            "timestamp": 1234567890
        });
        let _ = writeln!(stream, "{}", test_event);
        let _ = stream.flush();

        // Brief yield for background thread processing
        thread::sleep(Duration::from_millis(150));

        let sessions = pet.get_sessions();
        assert!(sessions.iter().any(|s| s.id == "test-e2e-session" && s.state == AgentState::Working));
    }
}
