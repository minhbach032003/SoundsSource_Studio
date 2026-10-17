use crate::pet::pricing::ModelPricing;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct UsageDelta {
    pub tokens: u64,
    pub cost_usd: f64,
    pub model: Option<String>,
}

const MAX_USAGE_BYTES: u64 = 8 * 1024 * 1024;

// Open nonblocking before checking the opened inode: metadata-only prechecks
// have a race if a path is swapped for a FIFO. Never hold the offsets mutex here.
fn open_transcript(path: &Path) -> Option<File> {
    if path.extension().and_then(|s| s.to_str()) != Some("jsonl") { return None; }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(path).ok()?;
    file.metadata().ok()?.is_file().then_some(file)
}

pub struct TranscriptReader {
    offsets: Mutex<HashMap<PathBuf, u64>>,
}

impl Default for TranscriptReader {
    fn default() -> Self {
        Self::new()
    }
}

impl TranscriptReader {
    pub fn new() -> Self {
        Self {
            offsets: Mutex::new(HashMap::new()),
        }
    }

    /// Reads newly appended usage tokens and estimated USD cost from a Claude Code JSONL transcript.
    pub fn read_new_usage(&self, path: &Path) -> Option<UsageDelta> {
        let mut file = open_transcript(path)?;
        let mut offsets = self.offsets.lock().unwrap();
        let offset = offsets.entry(path.to_path_buf()).or_insert(0);

        let metadata = file.metadata().ok()?;
        let len = metadata.len();
        if len <= *offset {
            return Some(UsageDelta::default());
        }

        if len - *offset > MAX_USAGE_BYTES { return None; }
        file.seek(SeekFrom::Start(*offset)).ok()?;
        let mut buf = Vec::new();
        file.take(MAX_USAGE_BYTES + 1).read_to_end(&mut buf).ok()?;
        if buf.len() as u64 > MAX_USAGE_BYTES { return None; }
        // Only advance offset by the bytes that formed complete lines
        let last_nl = buf.iter().rposition(|&b| b == b'\n');
        let consumable_bytes = match last_nl {
            Some(idx) => idx + 1,
            None => {
                // Incomplete line, do not advance offset yet
                return Some(UsageDelta::default());
            }
        };

        *offset += consumable_bytes as u64;

        let content = String::from_utf8_lossy(&buf[..consumable_bytes]);
        let mut total_tokens = 0u64;
        let mut total_cost = 0.0f64;
        let mut latest_model = None;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(msg) = val.get("message") {
                    if let Some(model_str) = msg.get("model").and_then(|m| m.as_str()) {
                        latest_model = Some(model_str.to_string());
                    }
                    if let Some(usage) = msg.get("usage") {
                        let in_tokens = usage.get("input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                        let out_tokens = usage.get("output_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                        let cache_create = usage.get("cache_creation_input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                        let cache_read = usage.get("cache_read_input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);

                        let sum = in_tokens.saturating_add(out_tokens);
                        total_tokens = total_tokens.saturating_add(sum);

                        let cost = ModelPricing::cost_usd(
                            latest_model.as_deref(),
                            in_tokens,
                            out_tokens,
                            cache_create,
                            cache_read,
                        );
                        total_cost += cost;
                    }
                }
            }
        }

        Some(UsageDelta {
            tokens: total_tokens,
            cost_usd: total_cost,
            model: latest_model,
        })
    }

    /// Extracts the latest assistant text message from the transcript tail (capped at 500 chars).
    pub fn read_latest_assistant_text(path: &Path) -> Option<String> {
        let mut file = open_transcript(path)?;
        let metadata = file.metadata().ok()?;
        let len = metadata.len();

        // Read last 64KB for efficiency
        let seek_pos = len.saturating_sub(65536);
        file.seek(SeekFrom::Start(seek_pos)).ok()?;
        let mut buf = Vec::new();
        file.take(65536).read_to_end(&mut buf).ok()?;

        let content = String::from_utf8_lossy(&buf);
        let mut last_text = None;

        for line in content.lines().rev() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if val.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                    if let Some(msg) = val.get("message") {
                        if let Some(content_arr) = msg.get("content").and_then(|c| c.as_array()) {
                            for block in content_arr.iter().rev() {
                                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                        let t = text.trim();
                                        if !t.is_empty() {
                                            last_text = Some(t.chars().take(500).collect::<String>());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if last_text.is_some() {
                break;
            }
        }

        last_text
    }

    /// Path to a subagent's transcript for a SubagentStop event.
    /// <parent-without-.jsonl>/subagents/<agent-id>.jsonl
    pub fn subagent_transcript_path(parent_path: &Path, agent_id: &str) -> PathBuf {
        let parent_dir = parent_path.with_extension("");
        parent_dir.join("subagents").join(format!("{agent_id}.jsonl"))
    }

    /// Reads newly appended Codex token usage from a rollout JSONL.
    /// Codex writes {"payload":{"type":"token_count","info":{"last_token_usage":{...}}}} per turn.
    /// Returns delta tokens: (input - cached) + output.
    pub fn read_new_codex_usage(&self, path: &Path) -> Option<u64> {
        let mut file = open_transcript(path)?;
        let mut offsets = self.offsets.lock().unwrap();
        let offset = offsets.entry(path.to_path_buf()).or_insert(0);

        let metadata = file.metadata().ok()?;
        let len = metadata.len();
        if len <= *offset {
            return Some(0);
        }

        if len - *offset > MAX_USAGE_BYTES {
            return None;
        }
        file.seek(SeekFrom::Start(*offset)).ok()?;
        let mut buf = Vec::new();
        file.take(MAX_USAGE_BYTES + 1).read_to_end(&mut buf).ok()?;
        if buf.len() as u64 > MAX_USAGE_BYTES {
            return None;
        }

        let last_nl = buf.iter().rposition(|&b| b == b'\n');
        let consumable_bytes = match last_nl {
            Some(idx) => idx + 1,
            None => return Some(0),
        };

        *offset += consumable_bytes as u64;

        let content = String::from_utf8_lossy(&buf[..consumable_bytes]);
        let mut total_tokens = 0u64;

        for line in content.lines() {
            if !line.contains("\"last_token_usage\"") {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<Value>(line.trim()) {
                if let Some(payload) = val.get("payload") {
                    if let Some(info) = payload.get("info") {
                        if let Some(last) = info.get("last_token_usage") {
                            let input = last.get("input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                            let cached = last.get("cached_input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                            let output = last.get("output_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                            let turn_tokens = input.saturating_sub(cached).saturating_add(output);
                            total_tokens = total_tokens.saturating_add(turn_tokens);
                        }
                    }
                }
            }
        }

        Some(total_tokens)
    }

    /// Locates a Codex session's rollout file under ~/.codex/sessions.
    pub fn codex_rollout_path(session_id: &str, cwd: Option<&str>) -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;
        let root = Path::new(&home).join(".codex").join("sessions");
        if !root.exists() {
            return None;
        }

        let mut candidates: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                    let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if file_name.contains("rollout-") {
                        if file_name.contains(session_id) {
                            return Some(path);
                        }
                        let mtime = entry.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        candidates.push((path, mtime));
                    }
                }
            }
        }

        if let Some(target_cwd) = cwd {
            candidates.sort_by(|a, b| b.1.cmp(&a.1));
            for (path, _) in candidates.into_iter().take(40) {
                if let Ok(file) = File::open(&path) {
                    use std::io::BufRead;
                    let mut reader = std::io::BufReader::new(file);
                    let mut first_line = String::new();
                    if reader.read_line(&mut first_line).is_ok() {
                        if let Ok(val) = serde_json::from_str::<Value>(&first_line) {
                            if let Some(c) = val.get("payload").and_then(|p| p.get("cwd")).and_then(|c| c.as_str()) {
                                if c == target_cwd {
                                    return Some(path);
                                }
                            }
                        }
                    }
                }
            }
        }

        None
    }

    /// Scans recent Claude Code transcript directories and returns any found path for a given project or session.
    pub fn find_claude_transcript(session_id: &str, project_cwd: Option<&str>) -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;
        let claude_dir = Path::new(&home).join(".claude");

        // 1. Check projects directory: ~/.claude/projects/*/transcripts/<session_id>.jsonl
        let projects_dir = claude_dir.join("projects");
        if projects_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    let path = entry.path().join(format!("{session_id}.jsonl"));
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }

        // 2. Check if project_cwd matches
        if let Some(cwd) = project_cwd {
            let norm_cwd = cwd.replace('/', "-");
            let candidate = projects_dir.join(format!("{norm_cwd}")).join(format!("{session_id}.jsonl"));
            if candidate.exists() {
                return Some(candidate);
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incremental_usage_reading() {
        let temp_dir = std::env::temp_dir().join(format!("transcript_test_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let path = temp_dir.join("test.jsonl");

        let reader = TranscriptReader::new();

        // Write first turn
        let line1 = r#"{"type":"assistant","message":{"model":"claude-3-7-sonnet","usage":{"input_tokens":1000,"output_tokens":500},"content":[{"type":"text","text":"Hello world"}]}}"#;
        std::fs::write(&path, format!("{line1}\n")).unwrap();

        let delta1 = reader.read_new_usage(&path).unwrap();
        assert_eq!(delta1.tokens, 1500);
        assert!(delta1.cost_usd > 0.0);

        // Second call with no new data
        let delta2 = reader.read_new_usage(&path).unwrap();
        assert_eq!(delta2.tokens, 0);

        // Append second turn
        let line2 = r#"{"type":"assistant","message":{"model":"claude-3-7-sonnet","usage":{"input_tokens":500,"output_tokens":200},"content":[{"type":"text","text":"Done"}]}}"#;
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(f, "{line2}").unwrap();

        let delta3 = reader.read_new_usage(&path).unwrap();
        assert_eq!(delta3.tokens, 700);

        // Assistant text check
        let last_text = TranscriptReader::read_latest_assistant_text(&path);
        assert_eq!(last_text.as_deref(), Some("Done"));

        // Codex usage reading check
        let codex_path = temp_dir.join("rollout-123.jsonl");
        let codex_line = r#"{"payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":1200,"cached_input_tokens":200,"output_tokens":300}}}}"#;
        std::fs::write(&codex_path, format!("{codex_line}\n")).unwrap();

        let codex_tokens = reader.read_new_codex_usage(&codex_path).unwrap();
        // (1200 - 200) + 300 = 1300
        assert_eq!(codex_tokens, 1300);

        let codex_tokens_2nd = reader.read_new_codex_usage(&codex_path).unwrap();
        assert_eq!(codex_tokens_2nd, 0);

        // Subagent path resolution check
        let parent = Path::new("/Users/mac/.claude/projects/-Users-mac-foo/session-123.jsonl");
        let subagent = TranscriptReader::subagent_transcript_path(parent, "agent-abc");
        assert_eq!(subagent, PathBuf::from("/Users/mac/.claude/projects/-Users-mac-foo/session-123/subagents/agent-abc.jsonl"));

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}

#[cfg(all(test, unix))]
mod review_tests {
    use super::*;
    #[test]
    fn fifo_metadata_never_blocks_lifecycle_enrichment() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pipe.jsonl");
        assert!(std::process::Command::new("mkfifo").arg(&path).status().unwrap().success());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            tx.send((TranscriptReader::new().read_new_usage(&path), TranscriptReader::read_latest_assistant_text(&path))).ok();
        });
        let result = rx.recv_timeout(std::time::Duration::from_millis(300)).expect("FIFO must be rejected without waiting for writer");
        assert_eq!(result, (None, None));
    }
    #[test]
    fn oversized_transcript_is_rejected_without_reading_remaining_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.jsonl");
        File::create(&path).unwrap().set_len(32 * 1024 * 1024).unwrap();
        assert_eq!(TranscriptReader::new().read_new_usage(&path), None);
    }
}
