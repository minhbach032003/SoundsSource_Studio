pub mod care;
pub mod event;
pub mod hooks;
pub mod server;
pub mod session;
pub mod statemap;

pub use care::{PetCareState, PetCareStore, PetHunger, MEAL_XP, TOKENS_PER_XP};
pub use event::{AgentEvent, AgentKind, AgentState, PetMood};
pub use hooks::{AgentIntegrationInfo, HookManager};
pub use server::AgentPetServer;
pub use session::{AgentSession, SessionStore};

use chrono::Utc;
use std::sync::{Arc, Mutex};

pub struct PetManager {
    care_store: Arc<Mutex<PetCareStore>>,
    sessions: Arc<Mutex<SessionStore>>,
    server: Arc<AgentPetServer>,
}

impl PetManager {
    pub fn new() -> Self {
        let care_store = Arc::new(Mutex::new(PetCareStore::new(PetCareStore::default_path())));
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let server = Arc::new(AgentPetServer::new(AgentPetServer::default_socket_path()));

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
        sess.to_display_list()
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
