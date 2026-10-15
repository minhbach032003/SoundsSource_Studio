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
pub use server::AgentPetServer;
pub use session::{AgentSession, SessionStore};
pub use transcript::{TranscriptReader, UsageDelta};

use chrono::Utc;
use std::sync::{Arc, Mutex};

pub struct PetManager {
    care_store: Arc<Mutex<PetCareStore>>,
    sessions: Arc<Mutex<SessionStore>>,
    server: Arc<AgentPetServer>,
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
        }
    }

    pub fn start_daemon(&self) {
        let _ = self
            .server
            .start(self.sessions.clone(), self.care_store.clone());
    }

    pub fn stop_daemon(&self) {
        self.server.stop();
    }

    pub fn get_care_state(&self) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        store.load()
    }

    pub fn apply_care_action(&self, action: &str) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        let mut state = store.load();
        let now_ts = Utc::now().timestamp();
        state.apply_care_action(action, now_ts);
        let _ = store.save(&state);
        state
    }

    pub fn reset_care_state(&self) -> PetCareState {
        let store = self.care_store.lock().unwrap();
        let state = PetCareState::default();
        let _ = store.save(&state);
        state
    }

    pub fn get_sessions(&self) -> Vec<AgentSession> {
        let mut sess = self.sessions.lock().unwrap();
        let now_ts = Utc::now().timestamp();
        sess.prune(now_ts);
        sess.to_display_list_with_history(now_ts)
    }

    pub fn dismiss_session(&self, id: &str) {
        let mut sess = self.sessions.lock().unwrap();
        sess.remove(id);
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
