use crate::pet::activity::{ActivityFormatter, ActivityTheme};
use crate::pet::event::{AgentEvent, AgentState, PetMood};
use crate::pet::question::QuestionDetector;
use crate::pet::statemap::{is_session_end, map_event_to_state};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentSession {
    pub id: String,
    pub agent_kind: String,
    pub state: AgentState,
    pub project: Option<String>,
    pub message: Option<String>,
    pub model: Option<String>,
    pub tool_name: Option<String>,
    pub tool_summary: Option<String>,
    pub started_at: i64,
    pub last_event_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionArchive {
    pub session_id: String,
    pub agent_kind: String,
    pub project: Option<String>,
    pub title: Option<String>,
    pub message: Option<String>,
    pub token_count: Option<u64>,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration: f64,
}

#[derive(Debug, Default, Clone)]
pub struct SessionStore {
    sessions: HashMap<String, AgentSession>,
    // Retain shutdown watermarks so late handlers cannot resurrect a session.
    watermarks: HashMap<String, (u64, bool)>,
    archive_dir: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
struct HistorySessionEntry {
    #[serde(alias = "sessionId", alias = "session_id")]
    session_id: String,
    #[serde(alias = "agentKind", alias = "agent_kind")]
    agent_kind: String,
    project: Option<String>,
    message: Option<String>,
    #[serde(alias = "startedAt", alias = "started_at")]
    started_at: Option<String>,
    #[serde(alias = "endedAt", alias = "ended_at")]
    ended_at: Option<String>,
    duration: Option<f64>,
}

impl SessionStore {
    pub fn new() -> Self {
        let archive_dir = std::env::var("HOME").ok().map(|h| {
            std::path::Path::new(&h).join(".agentpet").join("history")
        });
        Self {
            sessions: HashMap::new(),
            watermarks: HashMap::new(),
            archive_dir,
        }
    }

    pub fn with_archive_dir(archive_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            sessions: HashMap::new(),
            watermarks: HashMap::new(),
            archive_dir: Some(archive_dir.into()),
        }
    }

    pub fn archive_session(&self, sess: &AgentSession, ended_at: i64) {
        let Some(ref dir) = self.archive_dir else { return };
        let _ = std::fs::create_dir_all(dir);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let file_path = dir.join(format!("{today}.json"));

        let mut archives: Vec<SessionArchive> = if file_path.exists() {
            std::fs::read_to_string(&file_path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        if !archives.iter().any(|a| a.session_id == sess.id) {
            let duration = (ended_at.saturating_sub(sess.started_at) as f64).max(0.0);
            archives.push(SessionArchive {
                session_id: sess.id.clone(),
                agent_kind: sess.agent_kind.clone(),
                project: sess.project.clone(),
                title: sess.tool_summary.clone().or(sess.message.clone()),
                message: sess.message.clone(),
                token_count: None,
                started_at: sess.started_at,
                ended_at,
                duration,
            });
            if let Ok(json) = serde_json::to_string_pretty(&archives) {
                let _ = std::fs::write(&file_path, json);
            }
        }
    }

    pub fn sessions(&self) -> &HashMap<String, AgentSession> {
        &self.sessions
    }

    pub fn get(&self, id: &str) -> Option<&AgentSession> {
        self.sessions.get(id)
    }

    pub fn remove(&mut self, id: &str) -> Option<AgentSession> {
        self.sessions.remove(id)
    }

    pub fn clear(&mut self) {
        self.sessions.clear();
        self.watermarks.clear();
    }

    pub fn load_history_sessions(history_file: &std::path::Path, now_ts: i64) -> Vec<AgentSession> {
        let Ok(content) = std::fs::read_to_string(history_file) else {
            return Vec::new();
        };
        let Ok(entries) = serde_json::from_str::<Vec<HistorySessionEntry>>(&content) else {
            return Vec::new();
        };

        let mut list = Vec::new();
        for entry in entries.into_iter().rev().take(12) {
            let is_ended = entry.ended_at.is_some();
            let state = if is_ended {
                AgentState::Done
            } else if entry
                .message
                .as_ref()
                .map(|m| m.to_ascii_lowercase().contains("waiting"))
                .unwrap_or(false)
            {
                AgentState::Waiting
            } else {
                AgentState::Working
            };

            let started_ts = entry
                .started_at
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(now_ts);

            let ended_ts = entry
                .ended_at
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(started_ts + entry.duration.unwrap_or(0.0) as i64);

            list.push(AgentSession {
                id: entry.session_id,
                agent_kind: entry.agent_kind,
                state,
                project: entry.project,
                message: entry.message,
                model: None,
                tool_name: None,
                tool_summary: None,
                started_at: started_ts,
                last_event_at: ended_ts,
            });
        }
        list
    }

    fn get_active_history_sessions(&self, now_ts: i64) -> Vec<AgentSession> {
        if let Ok(home) = std::env::var("HOME") {
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            let file = std::path::Path::new(&home)
                .join(".agentpet")
                .join("history")
                .join(format!("{today}.json"));
            Self::load_history_sessions(&file, now_ts)
        } else {
            Vec::new()
        }
    }

    /// Ingests an incoming AgentEvent.
    /// Returns `(new_state, is_meal_completed)`.
    pub fn apply(&mut self, event: AgentEvent, now_ts: i64) -> (Option<AgentState>, bool) {
        let session_id = event.session_id.clone();
        let ending = is_session_end(&event.agent_kind, &event.event_name);
        let registering = map_event_to_state(&event.agent_kind, &event.event_name) == Some(AgentState::Registered);
        let order = event.sequence.or_else(|| event.timestamp.and_then(|ts| u64::try_from(ts).ok())
            .and_then(|ts| ts.checked_mul(1_000_000)));
        if let Some(&(last, ended)) = self.watermarks.get(&session_id) {
            if order.is_some_and(|next| next < last || (event.sequence.is_some() && next == last))
                || (ended && !registering) {
                return (None, false);
            }
        }
        if order.is_some() || ending {
            self.watermarks.insert(session_id.clone(), (order.unwrap_or(0), ending));
        }
        if ending {
            self.sessions.remove(&session_id);
            return (None, false);
        }

        let mut new_state = map_event_to_state(&event.agent_kind, &event.event_name);

        // Turn-ending Question Detection:
        // Claude Code fires "Stop" identically on completion or when waiting for user response.
        // If the message or assistant text is a question, refine state to Waiting!
        if new_state == Some(AgentState::Done) {
            let is_question = event
                .message
                .as_deref()
                .map(QuestionDetector::looks_like_question)
                .unwrap_or(false);
            if is_question {
                new_state = Some(AgentState::Waiting);
            }
        }

        let mut meal_completed = false;

        // Thematic Activity Formatting
        let formatted_activity = ActivityFormatter::format(
            &event.event_name,
            event.tool_name.as_deref(),
            event.file_path.as_deref(),
            event.message.as_deref(),
            ActivityTheme::Chef,
        );

        if let Some(st) = new_state {
            if let Some(existing) = self.sessions.get_mut(&session_id) {
                if (existing.state == AgentState::Working || existing.state == AgentState::Waiting)
                    && st == AgentState::Done
                {
                    meal_completed = true;
                }
                existing.state = st;
                existing.last_event_at = now_ts;
                if event.project.is_some() {
                    existing.project = event.project;
                }
                if event.message.is_some() {
                    existing.message = event.message;
                }
                if event.model.is_some() {
                    existing.model = event.model;
                }
                if event.tool_name.is_some() {
                    existing.tool_name = event.tool_name;
                }
                existing.tool_summary = event.tool_summary.or(Some(formatted_activity));
            } else {
                if st == AgentState::Done {
                    meal_completed = true;
                }
                let sess = AgentSession {
                    id: session_id.clone(),
                    agent_kind: event.agent_kind,
                    state: st,
                    project: event.project,
                    message: event.message,
                    model: event.model,
                    tool_name: event.tool_name,
                    tool_summary: event.tool_summary.or(Some(formatted_activity)),
                    started_at: now_ts,
                    last_event_at: now_ts,
                };
                self.sessions.insert(session_id, sess);
            }
        }

        (new_state, meal_completed)
    }

    pub fn prune(&mut self, now_ts: i64) {
        let mut to_archive = Vec::new();

        self.sessions.retain(|_, sess| {
            let quiet = now_ts.saturating_sub(sess.last_event_at);
            match sess.state {
                AgentState::Done if quiet >= 30 => {
                    sess.state = AgentState::Idle;
                    sess.last_event_at = now_ts;
                    true
                }
                AgentState::Working | AgentState::Waiting => {
                    if quiet >= 300 {
                        to_archive.push(sess.clone());
                        false
                    } else {
                        true
                    }
                }
                AgentState::Registered => {
                    if quiet >= 90 {
                        to_archive.push(sess.clone());
                        false
                    } else {
                        true
                    }
                }
                AgentState::Idle => {
                    if quiet >= 600 {
                        to_archive.push(sess.clone());
                        false
                    } else {
                        true
                    }
                }
                _ => true,
            }
        });

        for sess in to_archive {
            self.archive_session(&sess, now_ts);
        }
    }

    pub fn aggregate_mood(&self) -> PetMood {
        if self.sessions.values().any(|s| s.state == AgentState::Working) {
            return PetMood::Working;
        }
        if self.sessions.values().any(|s| s.state == AgentState::Waiting) {
            return PetMood::Waiting;
        }
        if self.sessions.values().any(|s| s.state == AgentState::Done) {
            return PetMood::Done;
        }

        // Historical records are not a live event bridge.
        PetMood::Idle
    }

    pub fn to_display_list(&self) -> Vec<AgentSession> {
        let mut list: Vec<AgentSession> = self.sessions.values().cloned().collect();
        list.sort_by(|a, b| {
            let priority_a = match a.state {
                AgentState::Working => 0,
                AgentState::Waiting => 1,
                AgentState::Done => 2,
                AgentState::Registered => 3,
                AgentState::Idle => 4,
            };
            let priority_b = match b.state {
                AgentState::Working => 0,
                AgentState::Waiting => 1,
                AgentState::Done => 2,
                AgentState::Registered => 3,
                AgentState::Idle => 4,
            };
            priority_a.cmp(&priority_b).then_with(|| b.last_event_at.cmp(&a.last_event_at))
        });
        list
    }

    pub fn to_display_list_with_history(&self, now_ts: i64) -> Vec<AgentSession> {
        let mut map = self.sessions.clone();

        for hist in self.get_active_history_sessions(now_ts) {
            map.entry(hist.id.clone()).or_insert(hist);
        }

        let mut list: Vec<AgentSession> = map.into_values().collect();
        list.sort_by(|a, b| {
            let priority_a = match a.state {
                AgentState::Working => 0,
                AgentState::Waiting => 1,
                AgentState::Done => 2,
                AgentState::Registered => 3,
                AgentState::Idle => 4,
            };
            let priority_b = match b.state {
                AgentState::Working => 0,
                AgentState::Waiting => 1,
                AgentState::Done => 2,
                AgentState::Registered => 3,
                AgentState::Idle => 4,
            };
            priority_a.cmp(&priority_b).then_with(|| b.last_event_at.cmp(&a.last_event_at))
        });
        list
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parity_pi_payloads_and_shutdown() {
        let mut store = SessionStore::new();
        for (name, expected) in [("SessionStart", AgentState::Registered),
            ("UserPromptSubmit", AgentState::Working), ("PreToolUse", AgentState::Working),
            ("Notification", AgentState::Waiting), ("Stop", AgentState::Done)] {
            let mut event = AgentEvent::new("pi-live", "pi", name);
            event.tool_name = Some("Read".into());
            assert_eq!(store.apply(event, 1000).0, Some(expected), "{name}");
            assert_eq!(store.get("pi-live").unwrap().tool_name.as_deref(), Some("Read"));
        }
        store.apply(AgentEvent::new("pi-live", "pi", "SessionEnd"), 1001);
        assert!(store.get("pi-live").is_none());
    }

    #[test]
    fn parity_legacy_fractional_timestamp() {
        let event: AgentEvent = serde_json::from_str(r#"{"sessionId":"legacy","agentKind":"claude","eventName":"Stop","timestamp":1792100000.125}"#).unwrap();
        assert_eq!(event.timestamp, Some(1792100000));
    }

    #[test]
    fn parity_aging_is_deterministic() {
        let mut store = SessionStore::new();
        for (id, state) in [("done", "done"), ("active", "working"), ("waiting", "waiting"), ("registered", "registered")] {
            store.apply(AgentEvent::new(id, "pi", state), 1000);
        }
        store.prune(1029);
        assert_eq!(store.get("done").unwrap().state, AgentState::Done);
        store.prune(1030);
        assert_eq!(store.get("done").unwrap().state, AgentState::Idle);
        store.prune(1090);
        assert!(store.get("registered").is_none());
        store.prune(1300);
        assert!(store.get("active").is_none());
        assert!(store.get("waiting").is_none());
        store.prune(1630);
        assert!(store.get("done").is_none());
    }

    #[test]
    fn test_session_lifecycle_and_meal_completion() {
        let mut store = SessionStore::new();
        assert_eq!(store.aggregate_mood(), PetMood::Idle);

        // 1. SessionStart
        let ev1 = AgentEvent {
            session_id: "sess-1".into(),
            agent_kind: "claude".into(),
            event_name: "SessionStart".into(),
            project: Some("rust-sound".into()),
            model: Some("Claude 3.7 Sonnet".into()),
            ..Default::default()
        };
        let (state, meal) = store.apply(ev1, 1000);
        assert_eq!(state, Some(AgentState::Registered));
        assert!(!meal);

        // 2. User submits prompt
        let ev2 = AgentEvent {
            session_id: "sess-1".into(),
            agent_kind: "claude".into(),
            event_name: "UserPromptSubmit".into(),
            message: Some("Refactoring code".into()),
            ..Default::default()
        };
        let (state2, meal2) = store.apply(ev2, 1010);
        assert_eq!(state2, Some(AgentState::Working));
        assert!(!meal2);
        assert_eq!(store.aggregate_mood(), PetMood::Working);

        // 3. Stop -> done (meal completed)
        let ev3 = AgentEvent {
            session_id: "sess-1".into(),
            agent_kind: "claude".into(),
            event_name: "Stop".into(),
            ..Default::default()
        };
        let (state3, meal3) = store.apply(ev3, 1050);
        assert_eq!(state3, Some(AgentState::Done));
        assert!(meal3);
        assert_eq!(store.aggregate_mood(), PetMood::Done);
    }

    #[test]
    fn test_archive_persistence_on_prune() {
        let temp_dir = std::env::temp_dir().join(format!("session_archive_test_{}", uuid::Uuid::new_v4()));
        let mut store = SessionStore::with_archive_dir(&temp_dir);

        let event = AgentEvent {
            event_name: "SessionStart".to_string(),
            session_id: "sess_arch_1".to_string(),
            agent_kind: "claude".to_string(),
            project: Some("/test/project".to_string()),
            message: Some("Archivable task".to_string()),
            ..Default::default()
        };
        store.apply(event, 1000);

        // Advance 100s (> 90s staleRegisteredAfter) -> should prune and archive
        store.prune(1100);
        assert!(store.get("sess_arch_1").is_none());

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let archive_file = temp_dir.join(format!("{today}.json"));
        assert!(archive_file.exists());

        let archives: Vec<SessionArchive> = serde_json::from_str(&std::fs::read_to_string(&archive_file).unwrap()).unwrap();
        assert_eq!(archives.len(), 1);
        assert_eq!(archives[0].session_id, "sess_arch_1");
        assert_eq!(archives[0].agent_kind, "claude");

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_history_session_merging_and_mood() {
        let temp_dir = std::env::temp_dir().join(format!("pet_hist_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let file = temp_dir.join("2026-10-15.json");

        let json = r#"[
            {
                "sessionId": "claude-hist-1",
                "agentKind": "claude",
                "project": "/Users/mac/Documents/rust-sound",
                "message": "Claude is waiting for input",
                "startedAt": "2026-10-15T02:00:00Z",
                "endedAt": null,
                "duration": 120.0
            }
        ]"#;
        std::fs::write(&file, json).unwrap();

        let loaded = SessionStore::load_history_sessions(&file, 1792033800);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "claude-hist-1");
        assert_eq!(loaded[0].state, AgentState::Waiting);
        assert_eq!(loaded[0].project.as_deref(), Some("/Users/mac/Documents/rust-sound"));

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}

#[cfg(test)]
mod review_order_tests {
    use super::*;
    fn event(name: &str, sequence: u64) -> AgentEvent {
        serde_json::from_value(serde_json::json!({"session_id":"race", "agent_kind":"pi", "event_name":name, "sequence":sequence})).unwrap()
    }
    #[test]
    fn delayed_work_cannot_overwrite_completion_or_resurrect_shutdown() {
        let store = std::sync::Arc::new(std::sync::Mutex::new(SessionStore::new()));
        store.lock().unwrap().apply(event("SessionStart", 1), 100);
        store.lock().unwrap().apply(event("PreToolUse", 2), 100);
        let (release, wait) = std::sync::mpsc::channel();
        let delayed = store.clone();
        let work = std::thread::spawn(move || {
            wait.recv().unwrap();
            delayed.lock().unwrap().apply(event("PreToolUse", 3), 102);
        });
        store.lock().unwrap().apply(event("Stop", 4), 101);
        release.send(()).unwrap(); work.join().unwrap();
        assert_eq!(store.lock().unwrap().get("race").unwrap().state, AgentState::Done);
        store.lock().unwrap().apply(event("SessionEnd", 6), 103);
        store.lock().unwrap().apply(event("PreToolUse", 5), 104);
        assert!(store.lock().unwrap().get("race").is_none());
        store.lock().unwrap().apply(event("SessionStart", 7), 105);
        assert_eq!(store.lock().unwrap().get("race").unwrap().state, AgentState::Registered);
    }
}
