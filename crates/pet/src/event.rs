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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    #[serde(alias = "filePath", alias = "file_path")]
    pub file_path: Option<String>,
    #[serde(alias = "transcriptPath", alias = "transcript_path")]
    pub transcript_path: Option<String>,
    pub tokens: Option<u64>,
    #[serde(alias = "costUSD", alias = "cost_usd")]
    pub cost_usd: Option<f64>,
    #[serde(default, deserialize_with = "decode_timestamp")]
    pub timestamp: Option<i64>,
    /// Monotonic sender time in microseconds; optional for legacy clients.
    pub sequence: Option<u64>,
}

impl AgentEvent {
    pub fn new(session_id: impl Into<String>, agent_kind: impl Into<String>, event_name: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
            agent_kind: agent_kind.into(),
            event_name: event_name.into(),
            ..Default::default()
        }
    }
}

// Swift Date encodes fractional epoch seconds. Reject nonnumeric/out-of-range input.
fn decode_timestamp<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<i64>, D::Error> {
    let value = Option::<serde_json::Number>::deserialize(deserializer)?;
    value.map(|n| {
        if let Some(integer) = n.as_i64() { return Ok(integer); }
        let seconds = n.as_f64().ok_or_else(|| serde::de::Error::custom("Invalid timestamp"))?;
        if !seconds.is_finite() || seconds < i64::MIN as f64 || seconds >= i64::MAX as f64 {
            return Err(serde::de::Error::custom("Timestamp out of range"));
        }
        Ok(seconds.trunc() as i64)
    }).transpose()
}
