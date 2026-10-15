use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    Claude,
    Codex,
    Gemini,
    Cursor,
    Copilot,
    Windsurf,
    Antigravity,
    Kiro,
    Droid,
    Pi,
    Grok,
    Jcode,
    Unknown,
}

impl AgentKind {
    pub fn from_str_name(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "claude" | "claudecode" => Self::Claude,
            "codex" => Self::Codex,
            "gemini" => Self::Gemini,
            "cursor" => Self::Cursor,
            "copilot" => Self::Copilot,
            "windsurf" => Self::Windsurf,
            "antigravity" => Self::Antigravity,
            "kiro" => Self::Kiro,
            "droid" => Self::Droid,
            "pi" => Self::Pi,
            "grok" => Self::Grok,
            "jcode" => Self::Jcode,
            _ => Self::Unknown,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Claude => "Claude Code",
            Self::Codex => "Codex",
            Self::Gemini => "Gemini CLI",
            Self::Cursor => "Cursor",
            Self::Copilot => "GitHub Copilot",
            Self::Windsurf => "Windsurf",
            Self::Antigravity => "Antigravity",
            Self::Kiro => "Kiro CLI",
            Self::Droid => "Factory Droid",
            Self::Pi => "Pi",
            Self::Grok => "Grok Build",
            Self::Jcode => "jcode",
            Self::Unknown => "Custom Agent",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentState {
    Registered,
    Working,
    Waiting,
    Done,
    Idle,
}

impl AgentState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Registered => "registered",
            Self::Working => "working",
            Self::Waiting => "waiting",
            Self::Done => "done",
            Self::Idle => "idle",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetMood {
    Idle,
    Working,
    Waiting,
    Done,
    Celebrate,
    Sleepy,
    LevelUp,
}

impl PetMood {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Working => "working",
            Self::Waiting => "waiting",
            Self::Done => "done",
            Self::Celebrate => "celebrate",
            Self::Sleepy => "sleepy",
            Self::LevelUp => "levelup",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    #[serde(alias = "session", alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "agent", alias = "agentKind")]
    pub agent_kind: String,
    #[serde(alias = "event", alias = "eventName")]
    pub event_name: String,
    pub project: Option<String>,
    pub message: Option<String>,
    pub model: Option<String>,
    #[serde(alias = "tool", alias = "toolName")]
    pub tool_name: Option<String>,
    #[serde(alias = "summary", alias = "toolSummary")]
    pub tool_summary: Option<String>,
    pub timestamp: Option<i64>,
}
