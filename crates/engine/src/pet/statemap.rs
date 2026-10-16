use crate::pet::event::AgentState;

pub fn map_event_to_state(agent_kind: &str, event_name: &str) -> Option<AgentState> {
    // 1. Direct normalised state names
    match event_name.to_ascii_lowercase().as_str() {
        "working" => return Some(AgentState::Working),
        "waiting" => return Some(AgentState::Waiting),
        "done" => return Some(AgentState::Done),
        "registered" => return Some(AgentState::Registered),
        "idle" => return Some(AgentState::Idle),
        _ => {}
    }

    let kind = agent_kind.to_ascii_lowercase();

    match kind.as_str() {
        "claude" | "claudecode" => match event_name {
            "SessionStart" => Some(AgentState::Registered),
            "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => Some(AgentState::Working),
            "Notification" => Some(AgentState::Waiting),
            "Stop" => Some(AgentState::Done),
            _ => None,
        },
        "codex" => match event_name {
            "SessionStart" => Some(AgentState::Registered),
            "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "SubagentStart" => {
                Some(AgentState::Working)
            }
            "PermissionRequest" => Some(AgentState::Waiting),
            "Stop" | "SubagentStop" => Some(AgentState::Done),
            _ => None,
        },
        "gemini" => match event_name {
            "SessionStart" => Some(AgentState::Registered),
            "BeforeAgent" | "BeforeModel" | "BeforeTool" | "AfterTool"
            | "BeforeToolSelection" | "AfterModel" => Some(AgentState::Working),
            "Notification" => Some(AgentState::Waiting),
            "AfterAgent" | "SessionEnd" => Some(AgentState::Done),
            _ => None,
        },
        "cursor" => match event_name {
            "sessionStart" => Some(AgentState::Registered),
            "beforeSubmitPrompt" | "preToolUse" | "beforeShellExecution" => {
                Some(AgentState::Working)
            }
            "stop" | "subagentStop" | "sessionEnd" => Some(AgentState::Done),
            _ => None,
        },
        "copilot" => match event_name {
            "SessionStart" => Some(AgentState::Registered),
            "UserPromptSubmit" | "UserPromptSubmitted" | "PostToolUse" | "PreToolUse" => {
                Some(AgentState::Working)
            }
            "Notification" | "PermissionRequest" => Some(AgentState::Waiting),
            "Stop" | "AgentStop" | "SessionEnd" => Some(AgentState::Done),
            _ => None,
        },
        "droid" => match event_name {
            "SessionStart" => Some(AgentState::Registered),
            "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => Some(AgentState::Working),
            "Notification" => Some(AgentState::Waiting),
            "Stop" => Some(AgentState::Done),
            _ => None,
        },
        "pi" => match event_name {
            "SessionStart" | "session_start" => Some(AgentState::Registered),
            "agent_start" | "tool_call" | "working" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => Some(AgentState::Working),
            "agent_stop" | "done" | "Stop" => Some(AgentState::Done),
            "needs_input" | "waiting" | "Notification" | "PermissionRequest" => Some(AgentState::Waiting),
            _ => None,
        },
        "grok" => match event_name {
            "session_start" => Some(AgentState::Registered),
            "user_prompt_submit" | "pre_tool_use" | "post_tool_use" => Some(AgentState::Working),
            "notification" => Some(AgentState::Waiting),
            "stop" => Some(AgentState::Done),
            _ => None,
        },
        _ => None,
    }
}

pub fn is_session_end(agent_kind: &str, event_name: &str) -> bool {
    let k = agent_kind.to_ascii_lowercase();
    match k.as_str() {
        "claude" | "claudecode" | "gemini" | "droid" | "pi" => event_name == "SessionEnd" || event_name == "session_shutdown",
        "cursor" => event_name == "sessionEnd",
        "grok" => event_name == "session_end",
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_statemap_claude_events() {
        assert_eq!(
            map_event_to_state("claude", "SessionStart"),
            Some(AgentState::Registered)
        );
        assert_eq!(
            map_event_to_state("claude", "UserPromptSubmit"),
            Some(AgentState::Working)
        );
        assert_eq!(
            map_event_to_state("claude", "Notification"),
            Some(AgentState::Waiting)
        );
        assert_eq!(
            map_event_to_state("claude", "Stop"),
            Some(AgentState::Done)
        );
    }

    #[test]
    fn test_statemap_codex_and_cursor() {
        assert_eq!(
            map_event_to_state("codex", "PermissionRequest"),
            Some(AgentState::Waiting)
        );
        assert_eq!(
            map_event_to_state("cursor", "beforeShellExecution"),
            Some(AgentState::Working)
        );
    }
}
