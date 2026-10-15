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

#[derive(Debug, Default, Clone)]
pub struct SessionStore {
    sessions: HashMap<String, AgentSession>,
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
        Self {
            sessions: HashMap::new(),
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
        if is_session_end(&event.agent_kind, &event.event_name) {
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
        // Prune sessions older than 15 minutes of inactivity if not working
        self.sessions.retain(|_, sess| {
            if sess.state == AgentState::Working {
                true
            } else {
                now_ts.saturating_sub(sess.last_event_at) < 900
            }
        });
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

        let now_ts = chrono::Utc::now().timestamp();
        let history = self.get_active_history_sessions(now_ts);
        if history.iter().any(|s| s.state == AgentState::Working) {
            PetMood::Working
        } else if history.iter().any(|s| s.state == AgentState::Waiting) {
            PetMood::Waiting
        } else {
            PetMood::Idle
        }
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
