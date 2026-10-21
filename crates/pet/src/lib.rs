pub mod activity;
pub mod break_clock;
pub mod care;
pub mod event;
pub mod hooks;
pub mod pricing;
pub mod question;
pub mod server;
pub mod session;
pub mod statemap;
pub mod transcript;

pub use activity::{ActivityFormatter, ActivityTheme};
pub use break_clock::{BreakClock, BreakClockConfig, BreakTickResult};
pub use care::{MEAL_XP, PetCareState, PetCareStore, PetHunger, TOKENS_PER_XP};
pub use event::{AgentEvent, AgentKind, AgentState, PetMood};
pub use hooks::{AgentIntegrationInfo, HookManager};
pub use pricing::ModelPricing;
pub use question::QuestionDetector;
pub use server::{AgentPetServer, BridgeStatus};
pub use session::{AgentSession, SessionStore};
pub use transcript::{TranscriptReader, UsageDelta};

use chrono::Utc;
use std::sync::{Arc, Mutex};

pub struct PetManager {
    care_store: Arc<Mutex<PetCareStore>>,
    sessions: Arc<Mutex<SessionStore>>,
    server: Arc<AgentPetServer>,
    /// Stops a pending listener retry from resurrecting the bridge during shutdown.
    shutting_down: Arc<std::sync::atomic::AtomicBool>,
}

impl PetManager {
    pub fn new() -> Self {
        let care_path = PetCareStore::default_path();
        let secondary = PetCareStore::default_secondary_path();
        let store = match secondary {
            Some(sec) => PetCareStore::with_secondary(care_path, sec),
            None => PetCareStore::new(care_path),
        };
        let care_store = Arc::new(Mutex::new(store));
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let server = Arc::new(AgentPetServer::new(AgentPetServer::default_socket_path()));

        Self {
            care_store,
            sessions,
            server,
            shutting_down: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    pub fn with_paths(socket_path: std::path::PathBuf, care_path: std::path::PathBuf) -> Self {
        let care_store = Arc::new(Mutex::new(PetCareStore::new(care_path)));
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let server = Arc::new(AgentPetServer::new(socket_path));

        Self {
            care_store,
            sessions,
            server,
            shutting_down: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    pub fn start_daemon(&self) {
        self.shutting_down.store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = HookManager::ensure_agentpet_cli();
        HookManager::auto_heal_installed_hooks();
        if let Err(error) = self.server.start(self.sessions.clone(), self.care_store.clone()) {
            eprintln!("AgentPet activity listener failed to start: {error}");
            self.retry_daemon();
        }
    }

    /// Relaunching while the previous process still holds both socket paths used to leave
    /// the app running with no bridge for the rest of its life, silently. Keep trying while
    /// the old instance finishes shutting down.
    fn retry_daemon(&self) {
        let server = self.server.clone();
        let sessions = self.sessions.clone();
        let care_store = self.care_store.clone();
        let shutting_down = self.shutting_down.clone();
        std::thread::spawn(move || {
            for attempt in 1..=12u32 {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                match server.start(sessions.clone(), care_store.clone()) {
                    Ok(()) => {
                        eprintln!("AgentPet activity listener recovered on attempt {attempt}");
                        return;
                    }
                    Err(error) => {
                        eprintln!("AgentPet listener retry {attempt} failed: {error}");
                    }
                }
            }
        });
    }

    pub fn bridge_status(&self) -> BridgeStatus {
        self.server.status()
    }

    pub fn stop_daemon(&self) {
        self.shutting_down.store(true, std::sync::atomic::Ordering::SeqCst);
        self.server.stop();
    }

    pub fn get_care_state(&self) -> PetCareState {
        self.get_care_state_for_pet(None)
    }

    pub fn get_care_state_for_pet(&self, pet_id: Option<&str>) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        store.load_for_pet(pet_id)
    }

    pub fn apply_care_action(&self, action: &str) -> PetCareState {
        self.apply_care_action_for_pet(None, action)
    }

    pub fn apply_care_action_for_pet(&self, pet_id: Option<&str>, action: &str) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        let mut state = store.load_for_pet(pet_id);
        let now_ts = Utc::now().timestamp();
        state.apply_care_action(action, now_ts);
        let _ = store.save_for_pet(pet_id, &state);
        state
    }

    pub fn reset_care_state(&self) -> PetCareState {
        self.reset_care_state_for_pet(None)
    }

    pub fn reset_care_state_for_pet(&self, pet_id: Option<&str>) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        let state = PetCareState::default();
        let _ = store.save_for_pet(pet_id, &state);
        state
    }

    pub fn get_sessions(&self) -> Vec<AgentSession> {
        let mut sess = self.sessions.lock().unwrap();
        let now_ts = Utc::now().timestamp();
        sess.prune(now_ts);
        sess.to_display_list()
    }

    pub fn dismiss_session(&self, id: &str) {
        let mut sess = self.sessions.lock().unwrap();
        sess.remove(id);
    }

    pub fn clear_sessions(&self) {
        let mut sess = self.sessions.lock().unwrap();
        sess.clear();
    }

    pub fn get_integrations(&self) -> Vec<AgentIntegrationInfo> {
        HookManager::catalog()
    }

    pub fn toggle_hook(&self, kind: &str, enable: bool) -> Result<(), String> {
        if enable {
            HookManager::install(kind)
        } else {
            HookManager::uninstall(kind)
        }
    }
}

impl Default for PetManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    #[test]
    fn socket_activity_drives_live_sessions_once_without_history() {
        if std::env::var_os("RUST_SOUND_SOCKET_TEST_CHILD").is_none() {
            let home = tempfile::tempdir().unwrap();
            let output = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "pet::tests::socket_activity_drives_live_sessions_once_without_history", "--nocapture"])
                .env("HOME", home.path()).env("RUST_SOUND_SOCKET_TEST_CHILD", "1")
                .output().unwrap();
            assert!(output.status.success(), "{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
            return;
        }
        let home = std::path::PathBuf::from(std::env::var("HOME").unwrap());
        let history = home.join(".agentpet/history");
        std::fs::create_dir_all(&history).unwrap();
        std::fs::write(history.join(format!("{}.json", chrono::Local::now().format("%Y-%m-%d"))),
            r#"[{"sessionId":"archive","agentKind":"claude","message":"working"}]"#).unwrap();
        let pet = PetManager::with_paths(home.join(".agentpet/agentpet.sock"), home.join("care.json"));
        pet.start_daemon();
        assert!(pet.get_sessions().is_empty(), "archives must not create live activity");
        assert_eq!(std::fs::canonicalize(home.join(".agentpet/agentpet.sock")).unwrap(),
            std::fs::canonicalize(home.join(".rust-sound/pet.sock")).unwrap());
        let cli = HookManager::ensure_agentpet_cli().unwrap();
        let mut dispatcher = Command::new("/bin/sh").args(["-c", &format!("{cli} hook --agent pi")])
            .stdin(Stdio::piped()).spawn().unwrap();
        dispatcher.stdin.take().unwrap().write_all(br#"{"session_id":"socket-fixture","hook_event_name":"PreToolUse","tool_name":"Read","cwd":"/fixture","timestamp":1792100000.125}"#).unwrap();
        assert!(dispatcher.wait().unwrap().success());
        let deadline = Instant::now() + Duration::from_secs(3);
        while pet.get_care_state().total_tokens == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        // Let an erroneous second aliased delivery arrive before checking care.
        std::thread::sleep(Duration::from_millis(200));
        let sessions = pet.get_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentState::Working);
        assert_eq!(sessions[0].tool_name.as_deref(), Some("Read"));
        assert_eq!(pet.get_care_state().total_tokens, 500);
        pet.stop_daemon();
    }
}
