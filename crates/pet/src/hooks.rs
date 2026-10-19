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
    AgentSpec {
        kind: "windsurf",
        display_name: "Windsurf",
        format: HookFormat::CursorFlat,
        rel_path: &[".codeium", "windsurf", "hooks.json"],
        events: &["pre_user_prompt", "post_cascade_response"],
        note: Some("Windsurf IDE hooks"),
    },
    AgentSpec {
        kind: "opencode",
        display_name: "opencode",
        format: HookFormat::PiExtension,
        rel_path: &[".config", "opencode", "plugin", "agentpet.js"],
        events: &[],
        note: Some("opencode plugin"),
    },
    AgentSpec {
        kind: "antigravity",
        display_name: "Antigravity",
        format: HookFormat::ClaudeNested,
        rel_path: &[".gemini", "config", "hooks.json"],
        events: &["PreInvocation", "PreToolUse", "PostToolUse", "Stop"],
        note: Some("Antigravity hooks"),
    },
    AgentSpec {
        kind: "copilot",
        display_name: "GitHub Copilot",
        format: HookFormat::CursorFlat,
        rel_path: &[".copilot", "hooks", "agentpet.json"],
        events: &["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop"],
        note: Some("GitHub Copilot CLI hooks"),
    },
    AgentSpec {
        kind: "kiro",
        display_name: "Kiro CLI",
        format: HookFormat::CursorFlat,
        rel_path: &[".kiro", "agents", "default.json"],
        events: &["agentSpawn", "userPromptSubmit", "postToolUse", "stop"],
        note: Some("Kiro CLI hooks"),
    },
    AgentSpec {
        kind: "grok",
        display_name: "Grok Build",
        format: HookFormat::ClaudeNested,
        rel_path: &[".grok", "hooks", "agentpet.json"],
        events: &["SessionStart", "UserPromptSubmit", "PostToolUse", "Notification", "Stop"],
        note: Some("xAI Grok Build CLI hooks"),
    },
    AgentSpec {
        kind: "jcode",
        display_name: "jcode",
        format: HookFormat::PiExtension,
        rel_path: &[".jcode", "config.toml"],
        events: &[],
        note: Some("jcode lifecycle hooks"),
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

    pub fn ensure_agentpet_cli() -> Result<String, String> {
        if let Ok(home) = std::env::var("HOME") {
            let cli_path = std::path::Path::new(&home).join(".rust-sound").join("pet-hook");
            if let Some(parent) = cli_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let script = r#"#!/bin/sh
# Universal AgentPet Hook Dispatcher for rust-sound
AGENT="claude"
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) [ $# -ge 2 ] || exit 1; AGENT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

AGENT="$AGENT" python3 -c '
import sys, json, os, socket, time
agent = os.environ["AGENT"]
payload_str = sys.stdin.read().strip()
data = {}
try:
    if payload_str:
        data = json.loads(payload_str)
except:
    pass

session_id = data.get("session_id") or data.get("sessionId") or f"{agent}-{os.getpid()}"
event = data.get("hook_event_name") or data.get("event") or data.get("eventName") or "UserPromptSubmit"
project = data.get("project") or data.get("cwd") or os.environ.get("PWD") or ""
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
    "transcript_path": data.get("transcript_path") or data.get("transcriptPath"),
    "timestamp": int(time.time()),
    "sequence": time.time_ns() // 1000
}
msg = json.dumps(out) + "\n"

home = os.environ.get("HOME", "")
seen = set()
for sock_path in [f"{home}/.agentpet/agentpet.sock", f"{home}/.rust-sound/pet.sock"]:
    target = os.path.realpath(sock_path)
    if target in seen:
        continue
    seen.add(target)
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
            if cli_path.symlink_metadata().is_ok_and(|metadata| metadata.file_type().is_symlink())
                || (cli_path.exists() && !fs::read_to_string(&cli_path).map_err(|e| e.to_string())?
                    .starts_with("#!/bin/sh\n# Universal AgentPet Hook Dispatcher for rust-sound")) {
                return Err("Custom hook dispatcher exists; it was not replaced".into());
            }
            fs::write(&cli_path, script).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&cli_path, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
            }
            return Ok(format!("'{}'", cli_path.to_string_lossy().replace('\'', "'\\''")));
        }

        Err("Home directory unavailable".into())
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

        match spec.format {
            HookFormat::PiExtension => {
                let code = r#"// Rust Sound Pi Coding Agent Extension
import { createConnection } from "node:net";
import { realpathSync } from "node:fs";
export default function (pi: any) {
  const home = process.env.HOME || "";
  const sockPaths = [`${home}/.agentpet/agentpet.sock`, `${home}/.rust-sound/pet.sock`];
  let sequence = 0;
  const send = (eventName: string, message?: string, toolName?: string) => {
    const payload = JSON.stringify({
      sessionId: `pi-${process.pid}`,
      agentKind: "pi",
      eventName,
      project: process.cwd(),
      message,
      toolName,
      timestamp: Math.floor(Date.now() / 1000),
      sequence: sequence = Math.max(sequence + 1, Date.now() * 1000)
    }) + "\n";

    const seen = new Set<string>();
    for (const socketPath of sockPaths) {
      try {
        const target = realpathSync(socketPath);
        if (seen.has(target)) continue;
        seen.add(target);
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
  pi.on("tool_call", (e: any) => send("PreToolUse", e?.toolName, e?.toolName));
  pi.on("agent_settled", () => send("Stop"));
  pi.on("session_shutdown", () => send("SessionEnd"));
}
"#;
                if path.symlink_metadata().is_ok_and(|m| m.file_type().is_symlink()) {
                    return Err("Pi extension symlink was not replaced".into());
                }
                if path.exists() && !fs::read_to_string(&path).map_err(|e| e.to_string())?
                    .starts_with("// Rust Sound Pi Coding Agent Extension") {
                    return Err("Custom Pi extension exists; it was not replaced".into());
                }
                fs::write(&path, code).map_err(|e| e.to_string())?;
            }
            HookFormat::ClaudeNested => {
                let mut v: Value = if path.exists() {
                    let text = fs::read_to_string(&path).unwrap_or_default();
                    serde_json::from_str(&text).map_err(|_| "Invalid hook JSON; file was not replaced")?
                } else {
                    json!({})
                };

                let cmd = format!("{} hook --agent {}", Self::ensure_agentpet_cli()?, spec.kind);
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
                    serde_json::from_str(&text).map_err(|_| "Invalid hook JSON; file was not replaced")?
                } else {
                    json!({"version": 1})
                };

                let cmd = format!("{} hook --agent {}", Self::ensure_agentpet_cli()?, spec.kind);
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

        if spec.format == HookFormat::PiExtension
            && path.symlink_metadata().is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Pi extension symlink was not removed".into());
        }
        if !path.exists() {
            return Ok(());
        }

        if spec.format == HookFormat::PiExtension {
            if !fs::read_to_string(&path).map_err(|e| e.to_string())?
                .starts_with("// Rust Sound Pi Coding Agent Extension") {
                return Err("Custom Pi extension was not removed".into());
            }
            fs::remove_file(&path).map_err(|e| e.to_string())?;
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
                            for item in arr.iter_mut() {
                                if let Some(commands) = item.get_mut("hooks").and_then(|h| h.as_array_mut()) {
                                    commands.retain(|command| !command.get("command").and_then(|c| c.as_str())
                                        .is_some_and(|c| c.contains(".rust-sound/pet-hook")));
                                }
                            }
                            arr.retain(|item| !item.get("hooks").and_then(|h| h.as_array()).is_some_and(|h| h.is_empty()));
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
                                    .map(|s| s.contains(".rust-sound/pet-hook"))
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

#[cfg(test)]
mod parity_tests {
    use crate::{AgentEvent, AgentState, SessionStore};

    #[test]
    fn generated_pi_payloads_reach_real_session_store() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let output = std::process::Command::new("node")
            .arg("tests/fixtures/pi-hook-payloads.mjs").current_dir(root)
            .output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let events: Vec<AgentEvent> = String::from_utf8(output.stdout).unwrap().lines()
            .map(|line| serde_json::from_str(line).unwrap()).collect();
        assert_eq!(events.len(), 5);
        let mut store = SessionStore::new();
        for (event, expected) in events.into_iter().zip([
            Some(AgentState::Registered), Some(AgentState::Working),
            Some(AgentState::Working), Some(AgentState::Done), None]) {
            let tool = event.tool_name.clone();
            assert_eq!(store.apply(event, 1000).0, expected);
            if tool.is_some() { assert_eq!(store.get("pi-123").unwrap().tool_name.as_deref(), Some("Read")); }
        }
        assert!(store.get("pi-123").is_none());
    }
}

#[cfg(test)]
mod configuration_tests {
    use super::HookManager;
    use std::fs;

    #[test]
    fn custom_configuration_is_preserved() {
        // Re-exec only this test with HOME isolated; never mutate the runner's
        // environment or the user's actual hook files.
        if std::env::var_os("RUST_SOUND_HOOK_TEST_CHILD").is_none() {
            let home = tempfile::tempdir().unwrap();
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "pet::hooks::configuration_tests::custom_configuration_is_preserved", "--nocapture"])
                .env("HOME", home.path()).env("RUST_SOUND_HOOK_TEST_CHILD", "1")
                .output().unwrap();
            assert!(output.status.success(), "{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
            return;
        }
        let pi = HookManager::config_path_for("pi").unwrap();
        fs::create_dir_all(pi.parent().unwrap()).unwrap();
        fs::write(&pi, "// user custom extension").unwrap();
        assert!(HookManager::install("pi").is_err());
        assert!(HookManager::uninstall("pi").is_err());
        assert_eq!(fs::read_to_string(&pi).unwrap(), "// user custom extension");

        fs::remove_file(&pi).unwrap();
        let target = pi.with_file_name("custom-target.ts");
        for existing in [false, true] {
            if existing { fs::write(&target, "// Rust Sound Pi Coding Agent Extension\n// custom target").unwrap(); }
            std::os::unix::fs::symlink(&target, &pi).unwrap();
            assert!(HookManager::install("pi").is_err(), "must reject even dangling/generated-header symlink");
            assert!(HookManager::uninstall("pi").is_err(), "must preserve custom symlink");
            if existing { assert!(fs::read_to_string(&target).unwrap().ends_with("// custom target")); }
            else { assert!(!target.exists()); }
            fs::remove_file(&pi).unwrap();
        }

        let claude = HookManager::config_path_for("claude").unwrap();
        fs::create_dir_all(claude.parent().unwrap()).unwrap();
        fs::write(&claude, "{broken").unwrap();
        assert!(HookManager::install("claude").is_err());
        assert_eq!(fs::read_to_string(&claude).unwrap(), "{broken");

        let dispatcher = std::path::Path::new(&std::env::var("HOME").unwrap()).join(".rust-sound/pet-hook");
        fs::create_dir_all(dispatcher.parent().unwrap()).unwrap();
        fs::write(&dispatcher, "#!/bin/sh\n# custom dispatcher").unwrap();
        fs::write(&claude, "{}").unwrap();
        assert!(HookManager::install("claude").is_err());
        assert_eq!(fs::read_to_string(&dispatcher).unwrap(), "#!/bin/sh\n# custom dispatcher");

        fs::write(&claude, r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"/tmp/.rust-sound/pet-hook hook --agent claude"},{"type":"command","command":"custom-audit"}]}]}}"#).unwrap();
        HookManager::uninstall("claude").unwrap();
        assert!(fs::read_to_string(&claude).unwrap().contains("custom-audit"));
    }
}
