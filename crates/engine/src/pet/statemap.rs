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
        "windsurf" => match event_name {
            "pre_user_prompt" => Some(AgentState::Working),
            "post_cascade_response" | "post_cascade_response_with_transcript" => Some(AgentState::Done),
            _ => None,
        },
        "opencode" => match event_name {
            "session.created" => Some(AgentState::Working),
            "session.idle" => Some(AgentState::Done),
            _ => None,
        },
        "antigravity" => match event_name {
            "PreInvocation" | "PreToolUse" | "PostToolUse" | "PostInvocation" => Some(AgentState::Working),
            "Stop" => Some(AgentState::Done),
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
        "kiro" | "kirocli" => match event_name {
            "agentSpawn" | "AgentSpawn" => Some(AgentState::Registered),
            "userPromptSubmit" | "UserPromptSubmit" | "preToolUse" | "PreToolUse"
            | "postToolUse" | "PostToolUse" => Some(AgentState::Working),
            "notification" | "Notification" => Some(AgentState::Waiting),
            "stop" | "Stop" => Some(AgentState::Done),
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
            "agent_start" | "tool_call" | "working" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "turn_start" | "tool_execution_start" => Some(AgentState::Working),
            "agent_stop" | "done" | "Stop" | "agent_end" | "session_shutdown" => Some(AgentState::Done),
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
        "jcode" => match event_name {
            "session_start" => Some(AgentState::Registered),
            "turn_start" | "post_tool" => Some(AgentState::Working),
            "turn_end" => Some(AgentState::Done),
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
    fn test_all_13_agent_mappings() {
        assert_eq!(map_event_to_state("claude", "SessionStart"), Some(AgentState::Registered));
        assert_eq!(map_event_to_state("claude", "UserPromptSubmit"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("claude", "Notification"), Some(AgentState::Waiting));
        assert_eq!(map_event_to_state("claude", "Stop"), Some(AgentState::Done));

        assert_eq!(map_event_to_state("codex", "PermissionRequest"), Some(AgentState::Waiting));
        assert_eq!(map_event_to_state("gemini", "BeforeAgent"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("cursor", "beforeSubmitPrompt"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("windsurf", "pre_user_prompt"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("windsurf", "post_cascade_response"), Some(AgentState::Done));
        assert_eq!(map_event_to_state("opencode", "session.created"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("antigravity", "PreInvocation"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("copilot", "SessionStart"), Some(AgentState::Registered));
        assert_eq!(map_event_to_state("kiro", "agentSpawn"), Some(AgentState::Registered));
        assert_eq!(map_event_to_state("droid", "SessionStart"), Some(AgentState::Registered));
        assert_eq!(map_event_to_state("pi", "tool_execution_start"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("grok", "user_prompt_submit"), Some(AgentState::Working));
        assert_eq!(map_event_to_state("jcode", "turn_end"), Some(AgentState::Done));
    }
}
