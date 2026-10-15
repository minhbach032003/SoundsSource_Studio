use crate::pet::pricing::ModelPricing;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct UsageDelta {
    pub tokens: u64,
    pub cost_usd: f64,
    pub model: Option<String>,
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
        let mut file = File::open(path).ok()?;
        let mut offsets = self.offsets.lock().unwrap();
        let offset = offsets.entry(path.to_path_buf()).or_insert(0);

        let metadata = file.metadata().ok()?;
        let len = metadata.len();
        if len <= *offset {
            return Some(UsageDelta::default());
        }

        file.seek(SeekFrom::Start(*offset)).ok()?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).ok()?;
        *offset = len;

        let content = String::from_utf8_lossy(&buf);
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

                        let sum = in_tokens + out_tokens;
                        total_tokens += sum;

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
        let mut file = File::open(path).ok()?;
        let metadata = file.metadata().ok()?;
        let len = metadata.len();

        // Read last 64KB for efficiency
        let seek_pos = len.saturating_sub(65536);
        file.seek(SeekFrom::Start(seek_pos)).ok()?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).ok()?;

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

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
