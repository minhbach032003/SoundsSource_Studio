//! Obsidian notes for Gemini Live: a title catalog for its prompt, plus BM25 search.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

/// Share of the query's IDF mass a note must contain. Words absent from the vault weigh the
/// most, so an off-topic question ("công thức nấu phở bò") no longer returns notes that only
/// share filler words. 0.5 kept 17/18 + 5/8 eval hits and cut off-topic hits from 3/3 to 1/3.
const MIN_COVERAGE: f64 = 0.5;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct NoteHit {
    pub path: String,
    pub excerpt: String,
}

#[derive(Clone, Debug)]
pub struct Note {
    pub path: String,
    pub text: String,
}

/// The Obsidian vault Obsidian itself has open, else the only one it knows about.
fn obsidian_vault() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME unset")?;
    let raw = std::fs::read_to_string(format!("{home}/Library/Application Support/obsidian/obsidian.json"))
        .map_err(|_| "Chưa tìm thấy Obsidian vault trên máy")?;
    let json: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let vaults: Vec<&Value> = json["vaults"].as_object().map(|v| v.values().collect()).unwrap_or_default();
    let open: Vec<_> = vaults.iter().filter(|v| v["open"].as_bool() == Some(true)).collect();
    let pick = if open.len() == 1 { open[0] } else if vaults.len() == 1 { &vaults[0] } else { return Err("Có nhiều vault, mở một vault trong Obsidian".into()) };
    pick["path"].as_str().map(Into::into).ok_or_else(|| "Vault thiếu path".into())
}

fn collect_markdown(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') { continue; }
        if path.is_dir() { collect_markdown(&path, out); }
        else if path.extension().is_some_and(|e| e == "md") { out.push(path); }
    }
}

pub fn scan(vault: &Path) -> Vec<Note> {
    let mut files = Vec::new();
    collect_markdown(vault, &mut files);
    files.iter().filter_map(|f| Some(Note {
        path: f.strip_prefix(vault).ok()?.to_string_lossy().into_owned(),
        text: std::fs::read_to_string(f).ok()?,
    })).collect()
}

/// Vault-relative note paths without `.md`, sorted: what Gemini Live reads in its prompt.
pub fn catalog(vault: &Path) -> Vec<String> {
    let mut files = Vec::new();
    collect_markdown(vault, &mut files);
    let mut paths: Vec<String> = files.iter()
        .filter_map(|f| Some(f.strip_prefix(vault).ok()?.to_string_lossy().trim_end_matches(".md").to_string()))
        .collect();
    paths.sort();
    paths
}

fn tokens(s: &str) -> impl Iterator<Item = String> + '_ {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_')).filter(|w| !w.is_empty()).map(str::to_lowercase)
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// BM25 with the file name counting three times, so a rare term outweighs a common one.
/// Returns note indices, best first, for notes covering `MIN_COVERAGE` of the query.
pub fn bm25(query: &str, notes: &[Note]) -> Vec<usize> {
    let terms: HashSet<String> = tokens(query).collect();
    if terms.is_empty() || notes.is_empty() { return Vec::new(); }
    let docs: Vec<(HashMap<&String, f64>, f64)> = notes.iter().map(|note| {
        let (mut tf, mut len) = (HashMap::new(), 0.0);
        for (w, weight) in tokens(file_name(&note.path)).map(|w| (w, 3.0)).chain(tokens(&note.text).map(|w| (w, 1.0))) {
            len += weight;
            if let Some(t) = terms.get(&w) { *tf.entry(t).or_insert(0.0) += weight; }
        }
        (tf, len)
    }).collect();
    let n = docs.len() as f64;
    let avg = docs.iter().map(|d| d.1).sum::<f64>() / n;
    let idf: HashMap<&String, f64> = terms.iter().map(|t| {
        let df = docs.iter().filter(|d| d.0.contains_key(t)).count() as f64;
        (t, (1.0 + (n - df + 0.5) / (df + 0.5)).ln())
    }).collect();
    let total: f64 = idf.values().sum();
    let mut scored: Vec<(f64, usize)> = docs.iter().enumerate().filter_map(|(i, (tf, len))| {
        let covered: f64 = tf.keys().map(|t| idf[t]).sum();
        if covered == 0.0 || covered < MIN_COVERAGE * total { return None; }
        let s: f64 = tf.iter().map(|(t, f)| idf[t] * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len / avg))).sum();
        Some((s, i))
    }).collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().map(|(_, i)| i).collect()
}

/// Paragraphs that mention a query term, else the start of the note, capped for a voice turn.
fn excerpt(note: &Note, query: &str) -> String {
    let terms: Vec<String> = tokens(query).collect();
    let mut out = String::new();
    for para in note.text.split("\n\n").filter(|p| terms.iter().any(|t| p.to_lowercase().contains(t.as_str()))) {
        if out.chars().count() > 1500 { break; }
        out.push_str(para.trim());
        out.push_str("\n\n");
    }
    let source = if out.is_empty() { note.text.as_str() } else { out.as_str() };
    source.chars().take(1800).collect()
}

/// The note Gemini picked from the catalog first (matched only against scanned notes, never
/// joined onto the filesystem), then BM25 hits, at most three.
pub fn search(vault: &Path, query: &str, path: Option<&str>) -> Vec<NoteHit> {
    let notes = scan(vault);
    let wanted = path.map(|p| p.trim_end_matches(".md"));
    let picked = notes.iter().position(|n| Some(n.path.trim_end_matches(".md")) == wanted);
    picked.into_iter().chain(bm25(query, &notes).into_iter().filter(|&i| Some(i) != picked))
        .take(3)
        .map(|i| NoteHit { path: notes[i].path.clone(), excerpt: excerpt(&notes[i], query) })
        .collect()
}

#[tauri::command]
pub fn list_notes() -> Result<Vec<String>, String> {
    Ok(catalog(&obsidian_vault()?))
}

/// Lets Gemini Live answer from the user's own Obsidian notes before its own knowledge.
#[tauri::command]
pub async fn search_notes(query: String, path: Option<String>) -> Result<Vec<NoteHit>, String> {
    let vault = obsidian_vault()?;
    tauri::async_runtime::spawn_blocking(move || search(&vault, &query, path.as_deref()))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str, text: &str) -> Note {
        Note { path: path.into(), text: text.into() }
    }

    #[test]
    fn bm25_ranks_rare_terms_first_and_skips_unrelated_notes() {
        let notes = vec![note("a.md", "query query query"), note("b.md", "useMutation query"), note("c.md", "phở bò")];
        // a.md holds only the common term (~32% of the query's IDF), below MIN_COVERAGE.
        assert_eq!(bm25("useMutation query", &notes), vec![1]);
        assert_eq!(bm25("query", &notes), vec![0, 1]);
        assert!(bm25("kubernetes", &notes).is_empty());
        let rust = note("Rust/ownership.md", "# Ownership\n\nBorrow checker rules.\n\nUnrelated recipe.");
        let text = excerpt(&rust, "rust borrow");
        assert!(text.contains("Borrow checker") && !text.contains("recipe"));
    }

    #[test]
    fn off_topic_query_sharing_only_filler_words_matches_nothing() {
        let notes = vec![note("a.md", "thức ăn nhanh"), note("b.md", "thức dậy sớm"), note("c.md", "rust ownership")];
        assert!(bm25("công thức nấu phở", &notes).is_empty());
        assert_eq!(bm25("rust", &notes), vec![2]);
    }

    #[test]
    fn search_puts_the_picked_note_first_and_stays_inside_the_vault() {
        let dir = std::env::temp_dir().join(format!("notes-test-{}", std::process::id()));
        let vault = dir.join("vault");
        std::fs::create_dir_all(vault.join("Django")).unwrap();
        std::fs::create_dir_all(vault.join(".obsidian")).unwrap();
        std::fs::write(vault.join("Django/soft delete.md"), "Xóa mềm giữ lại bản ghi").unwrap();
        std::fs::write(vault.join("orm.md"), "Django ORM").unwrap();
        std::fs::write(vault.join(".obsidian/hidden.md"), "Django ORM").unwrap();
        std::fs::write(dir.join("secret.md"), "outside").unwrap();

        assert_eq!(catalog(&vault), vec!["Django/soft delete".to_string(), "orm".to_string()]);
        let paths = |hits: Vec<NoteHit>| hits.into_iter().map(|h| h.path).collect::<Vec<_>>();
        assert_eq!(paths(search(&vault, "django", Some("Django/soft delete"))), vec!["Django/soft delete.md", "orm.md"]);
        assert_eq!(paths(search(&vault, "django", Some("../secret"))), vec!["orm.md"]);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
