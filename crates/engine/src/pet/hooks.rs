use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentIntegrationInfo {
    pub kind: String,
    pub display_name: String,
    pub is_supported: bool,
    pub is_installed: bool,
    pub note: Option<String>,
}

#[derive(Clone, Copy, PartialEq)]
enum HookFormat {
    ClaudeNested,
    CursorFlat,
    PiExtension,
}

struct AgentSpec {
    kind: &'static str,
    display_name: &'static str,
    format: HookFormat,
    rel_path: &'static [&'static str],
    events: &'static [&'static str],
    note: Option<&'static str>,
}

const SPECS: &[AgentSpec] = &[
    AgentSpec {
        kind: "claude",
        display_name: "Claude Code",
        format: HookFormat::ClaudeNested,
        rel_path: &[".claude", "settings.json"],
        events: &[
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
            "SessionEnd",
        ],
        note: Some("CLI agent: hooks ~/.claude/settings.json"),
    },
    AgentSpec {
        kind: "codex",
        display_name: "Codex",
        format: HookFormat::ClaudeNested,
        rel_path: &[".codex", "hooks.json"],
        events: &[
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "PermissionRequest",
            "Stop",
        ],
        note: Some("CLI / IDE agent: hooks ~/.codex/hooks.json"),
    },
    AgentSpec {
        kind: "gemini",
        display_name: "Gemini CLI",
        format: HookFormat::ClaudeNested,
        rel_path: &[".gemini", "settings.json"],
        events: &[
            "SessionStart",
            "BeforeAgent",
            "BeforeTool",
            "AfterTool",
            "Notification",
            "AfterAgent",
            "SessionEnd",
        ],
        note: Some("Google Gemini CLI hooks"),
    },
    AgentSpec {
        kind: "cursor",
        display_name: "Cursor",
        format: HookFormat::CursorFlat,
        rel_path: &[".cursor", "hooks.json"],
        events: &[
            "sessionStart",
            "beforeSubmitPrompt",
            "preToolUse",
            "stop",
            "sessionEnd",
        ],
        note: Some("Cursor editor hooks (~/.cursor/hooks.json)"),
    },
    AgentSpec {
        kind: "pi",
        display_name: "Pi Coding Agent",
        format: HookFormat::PiExtension,
        rel_path: &[".pi", "agent", "extensions", "rust-sound-pet.ts"],
        events: &[],
        note: Some("Pi extension (~/.pi/agent/extensions/rust-sound-pet.ts)"),
    },
    AgentSpec {
        kind: "droid",
        display_name: "Factory Droid",
        format: HookFormat::ClaudeNested,
        rel_path: &[".factory", "hooks.json"],
        events: &[
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
        ],
        note: Some("Factory Droid CLI hooks"),
    },
];

pub struct HookManager;

impl HookManager {
    pub fn config_path_for(kind: &str) -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;
        let spec = SPECS.iter().find(|s| s.kind == kind)?;
        let mut path = PathBuf::from(home);
        for part in spec.rel_path {
            path.push(part);
        }
        Some(path)
    }

    pub fn is_installed(kind: &str) -> bool {
        let Some(path) = Self::config_path_for(kind) else {
            return false;
        };
        let Some(spec) = SPECS.iter().find(|s| s.kind == kind) else {
            return false;
        };

        if !path.exists() {
            return false;
        }

        if spec.format == HookFormat::PiExtension {
            return path.exists();
        }

        let Ok(content) = fs::read_to_string(&path) else {
            return false;
        };
        let Ok(v) = serde_json::from_str::<Value>(&content) else {
            return false;
        };

        match spec.format {
            HookFormat::ClaudeNested => {
                if let Some(hooks) = v.get("hooks").and_then(|h| h.as_object()) {
                    for ev in spec.events {
                        if let Some(arr) = hooks.get(*ev).and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(inner) = item.get("hooks").and_then(|i| i.as_array()) {
                                    for hook_obj in inner {
                                        if let Some(cmd) =
                                            hook_obj.get("command").and_then(|c| c.as_str())
                                        {
                                            if cmd.contains("agentpet")
                                                || cmd.contains("rust-sound")
                                            {
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                false
            }
            HookFormat::CursorFlat => {
                if let Some(hooks) = v.get("hooks").and_then(|h| h.as_object()) {
                    for ev in spec.events {
                        if let Some(arr) = hooks.get(*ev).and_then(|a| a.as_array()) {
                            for hook_obj in arr {
                                if let Some(cmd) = hook_obj.get("command").and_then(|c| c.as_str())
                                {
                                    if cmd.contains("agentpet") || cmd.contains("rust-sound") {
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }
                false
            }
            HookFormat::PiExtension => path.exists(),
        }
    }

    pub fn catalog() -> Vec<AgentIntegrationInfo> {
        SPECS
            .iter()
            .map(|s| AgentIntegrationInfo {
                kind: s.kind.to_string(),
                display_name: s.display_name.to_string(),
                is_supported: true,
                is_installed: Self::is_installed(s.kind),
                note: s.note.map(|n| n.to_string()),
            })
            .collect()
    }

    pub fn ensure_agentpet_cli() -> String {
        let app_agentpet = PathBuf::from("/Applications/AgentPet.app/Contents/MacOS/agentpet");
        if app_agentpet.exists() {
            return format!("\"{}\"", app_agentpet.to_string_lossy());
        }

        if let Ok(home) = std::env::var("HOME") {
            let cli_path = std::path::Path::new(&home).join(".agentpet").join("agentpet");
            if let Some(parent) = cli_path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            let script = r#"#!/bin/sh
# Universal AgentPet Hook Dispatcher for rust-sound
AGENT="claude"
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

python3 -c '
import sys, json, os, socket, time
agent = "'"$AGENT"'"
payload_str = sys.stdin.read().strip()
data = {}
try:
    if payload_str:
        data = json.loads(payload_str)
except:
    pass

session_id = data.get("session_id") or data.get("sessionId") or f"{agent}-{os.getpid()}"
event = data.get("event") or data.get("eventName") or "UserPromptSubmit"
project = data.get("project") or os.environ.get("PWD") or ""
message = data.get("message") or data.get("prompt") or data.get("tool_name") or ""
tool_name = data.get("tool_name") or data.get("tool") or ""
tool_summary = data.get("tool_summary") or data.get("summary") or ""

out = {
    "session_id": str(session_id),
    "agent_kind": str(agent),
    "event_name": str(event),
    "project": str(project),
    "message": str(message),
    "tool_name": str(tool_name) if tool_name else None,
    "tool_summary": str(tool_summary) if tool_summary else None,
    "timestamp": int(time.time())
}
msg = json.dumps(out) + "\n"

home = os.environ.get("HOME", "")
for sock_path in [f"{home}/.agentpet/agentpet.sock", f"{home}/.rust-sound/pet.sock"]:
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(sock_path)
        s.sendall(msg.encode())
        s.close()
    except:
        pass
'
exit 0
"#;
            let _ = fs::write(&cli_path, script);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&cli_path, fs::Permissions::from_mode(0o755));
            }
            return format!("\"{}\"", cli_path.to_string_lossy());
        }

        "agentpet".to_string()
    }

    pub fn install(kind: &str) -> Result<(), String> {
        let path = Self::config_path_for(kind).ok_or("Invalid agent kind")?;
        let spec = SPECS
            .iter()
            .find(|s| s.kind == kind)
            .ok_or("Agent not found")?;

        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let cli_cmd = Self::ensure_agentpet_cli();
        let cmd = format!("{} hook --agent {}", cli_cmd, spec.kind);

        match spec.format {
            HookFormat::PiExtension => {
                let code = r#"// Rust Sound Pi Coding Agent Extension
import { createConnection } from "node:net";
export default function (pi: any) {
  const home = process.env.HOME || "";
  const sockPaths = [`${home}/.agentpet/agentpet.sock`, `${home}/.rust-sound/pet.sock`];
  const send = (eventName: string, message?: string) => {
    const payload = JSON.stringify({
      sessionId: `pi-${process.pid}`,
      agentKind: "pi",
      eventName,
      project: process.cwd(),
      message,
      timestamp: Math.floor(Date.now() / 1000)
    }) + "\n";

    for (const socketPath of sockPaths) {
      try {
        const client = createConnection(socketPath, () => {
          client.write(payload);
          client.end();
        });
        client.on("error", () => {});
      } catch {}
    }
  };

  pi.on("session_start", () => send("SessionStart"));
  pi.on("agent_start", () => send("UserPromptSubmit"));
  pi.on("tool_call", (e: any) => send("PreToolUse", e?.toolName));
  pi.on("agent_settled", () => send("Stop"));
  pi.on("session_shutdown", () => send("SessionEnd"));
}
"#;
                fs::write(&path, code).map_err(|e| e.to_string())?;
            }
            HookFormat::ClaudeNested => {
                let mut v: Value = if path.exists() {
                    let text = fs::read_to_string(&path).unwrap_or_default();
                    serde_json::from_str(&text).unwrap_or_else(|_| json!({}))
                } else {
                    json!({})
                };

                let hooks = v
                    .as_object_mut()
                    .ok_or("Invalid JSON")?
                    .entry("hooks")
                    .or_insert_with(|| json!({}))
                    .as_object_mut()
                    .ok_or("Invalid hooks object")?;

                for ev in spec.events {
                    let arr = hooks.entry(*ev).or_insert_with(|| json!([]));
                    if let Some(list) = arr.as_array_mut() {
                        let already = list.iter().any(|item| {
                            item.get("hooks")
                                .and_then(|h| h.as_array())
                                .map(|cmds| {
                                    cmds.iter().any(|c| {
                                        c.get("command")
                                            .and_then(|s| s.as_str())
                                            .map(|s| {
                                                s.contains("agentpet") || s.contains("rust-sound")
                                            })
                                            .unwrap_or(false)
                                    })
                                })
                                .unwrap_or(false)
                        });
                        if !already {
                            list.push(json!({
                                "hooks": [{
                                    "type": "command",
                                    "command": cmd
                                }]
                            }));
                        }
                    }
                }

                let text = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
                fs::write(&path, text).map_err(|e| e.to_string())?;
            }
            HookFormat::CursorFlat => {
                let mut v: Value = if path.exists() {
                    let text = fs::read_to_string(&path).unwrap_or_default();
                    serde_json::from_str(&text).unwrap_or_else(|_| json!({}))
                } else {
                    json!({"version": 1})
                };

                let obj = v.as_object_mut().ok_or("Invalid JSON")?;
                let hooks = obj
                    .entry("hooks")
                    .or_insert_with(|| json!({}))
                    .as_object_mut()
                    .ok_or("Invalid hooks")?;

                for ev in spec.events {
                    let arr = hooks.entry(*ev).or_insert_with(|| json!([]));
                    if let Some(list) = arr.as_array_mut() {
                        let already = list.iter().any(|c| {
                            c.get("command")
                                .and_then(|s| s.as_str())
                                .map(|s| s.contains("agentpet") || s.contains("rust-sound"))
                                .unwrap_or(false)
                        });
                        if !already {
                            list.push(json!({
                                "command": cmd,
                                "type": "command"
                            }));
                        }
                    }
                }

                let text = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
                fs::write(&path, text).map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    pub fn uninstall(kind: &str) -> Result<(), String> {
        let path = Self::config_path_for(kind).ok_or("Invalid agent kind")?;
        let spec = SPECS
            .iter()
            .find(|s| s.kind == kind)
            .ok_or("Agent not found")?;

        if !path.exists() {
            return Ok(());
        }

        if spec.format == HookFormat::PiExtension {
            let _ = fs::remove_file(&path);
            return Ok(());
        }

        let Ok(text) = fs::read_to_string(&path) else {
            return Ok(());
        };
        let Ok(mut v) = serde_json::from_str::<Value>(&text) else {
            return Ok(());
        };

        match spec.format {
            HookFormat::ClaudeNested => {
                if let Some(hooks) = v.get_mut("hooks").and_then(|h| h.as_object_mut()) {
                    for ev in spec.events {
                        if let Some(arr) = hooks.get_mut(*ev).and_then(|a| a.as_array_mut()) {
                            arr.retain(|item| {
                                !item
                                    .get("hooks")
                                    .and_then(|h| h.as_array())
                                    .map(|cmds| {
                                        cmds.iter().any(|c| {
                                            c.get("command")
                                                .and_then(|s| s.as_str())
                                                .map(|s| {
                                                    s.contains("agentpet")
                                                        || s.contains("rust-sound")
                                                })
                                                .unwrap_or(false)
                                        })
                                    })
                                    .unwrap_or(false)
                            });
                        }
                    }
                }
            }
            HookFormat::CursorFlat => {
                if let Some(hooks) = v.get_mut("hooks").and_then(|h| h.as_object_mut()) {
                    for ev in spec.events {
                        if let Some(arr) = hooks.get_mut(*ev).and_then(|a| a.as_array_mut()) {
                            arr.retain(|c| {
                                !c.get("command")
                                    .and_then(|s| s.as_str())
                                    .map(|s| s.contains("agentpet") || s.contains("rust-sound"))
                                    .unwrap_or(false)
                            });
                        }
                    }
                }
            }
            HookFormat::PiExtension => {}
        }

        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        fs::write(&path, out).map_err(|e| e.to_string())?;
        Ok(())
    }
}
