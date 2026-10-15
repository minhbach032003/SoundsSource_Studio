use crate::pet::event::{AgentEvent, AgentState, PetMood};
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

    /// Ingests an incoming AgentEvent.
    /// Returns `(new_state, is_meal_completed)`.
    pub fn apply(&mut self, event: AgentEvent, now_ts: i64) -> (Option<AgentState>, bool) {
        let session_id = event.session_id.clone();
        if is_session_end(&event.agent_kind, &event.event_name) {
            self.sessions.remove(&session_id);
            return (None, false);
        }

        let new_state = map_event_to_state(&event.agent_kind, &event.event_name);
        let mut meal_completed = false;

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
                if event.tool_summary.is_some() {
                    existing.tool_summary = event.tool_summary;
                }
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
                    tool_summary: event.tool_summary,
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
            PetMood::Working
        } else if self.sessions.values().any(|s| s.state == AgentState::Waiting) {
            PetMood::Waiting
        } else if self.sessions.values().any(|s| s.state == AgentState::Done) {
            PetMood::Done
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
            message: None,
            model: Some("Claude 3.7 Sonnet".into()),
            tool_name: None,
            tool_summary: None,
            timestamp: None,
        };
        let (state, meal) = store.apply(ev1, 1000);
        assert_eq!(state, Some(AgentState::Registered));
        assert!(!meal);

        // 2. User submits prompt
        let ev2 = AgentEvent {
            session_id: "sess-1".into(),
            agent_kind: "claude".into(),
            event_name: "UserPromptSubmit".into(),
            project: None,
            message: Some("Refactoring code".into()),
            model: None,
            tool_name: None,
            tool_summary: None,
            timestamp: None,
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
            project: None,
            message: None,
            model: None,
            tool_name: None,
            tool_summary: None,
            timestamp: None,
        };
        let (state3, meal3) = store.apply(ev3, 1050);
        assert_eq!(state3, Some(AgentState::Done));
        assert!(meal3);
        assert_eq!(store.aggregate_mood(), PetMood::Done);
    }
}
