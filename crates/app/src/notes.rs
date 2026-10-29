//! Obsidian notes search for Gemini Live: BM25 fused with Gemini embeddings cached on disk.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Manager, State};

use crate::AppState;

const MODEL: &str = "gemini-embedding-2";
const DIMS: usize = 768;
/// Free tier allows 1000 embedded chunks per day; 4000-char chunks put this vault (~1 MB)
/// at ~340, well inside the model's 8192-token input limit.
const CHUNK_CHARS: usize = 4000;
const BATCH: usize = 100;
/// Below this cosine a note is not "about" the query; keeps "no note matches" reachable.
// ponytail: one global cut-off, calibrated on the user's vault; per-query normalisation if it drifts.
const MIN_SIMILARITY: f32 = 0.55;
const QUERY_TIMEOUT: Duration = Duration::from_secs(4);
const BATCH_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct NoteHit {
    pub path: String,
    pub excerpt: String,
}

#[derive(Clone, Debug)]
pub struct Note {
    pub path: String,
    pub text: String,
    /// (mtime seconds, byte length): cheap change detection without hashing.
    pub stamp: (u64, u64),
}

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct Index {
    pub model: String,
    pub notes: HashMap<String, IndexedNote>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IndexedNote {
    pub stamp: (u64, u64),
    pub chunks: Vec<Chunk>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Chunk {
    pub text: String,
    pub vec: Vec<f32>,
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
    files.iter().filter_map(|f| {
        let meta = f.metadata().ok()?;
        let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
        Some(Note {
            path: f.strip_prefix(vault).ok()?.to_string_lossy().into_owned(),
            text: std::fs::read_to_string(f).ok()?,
            stamp: (mtime, meta.len()),
        })
    }).collect()
}

fn tokens(s: &str) -> impl Iterator<Item = String> + '_ {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_')).filter(|w| !w.is_empty()).map(str::to_lowercase)
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// BM25 with the file name counting three times, so a rare term outweighs a common one.
/// Returns note indices, best first, score > 0 only.
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
    let mut scored: Vec<(f64, usize)> = docs.iter().enumerate().filter_map(|(i, (tf, len))| {
        let s: f64 = tf.iter().map(|(t, f)| idf[t] * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len / avg))).sum();
        (s > 0.0).then_some((s, i))
    }).collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().map(|(_, i)| i).collect()
}

/// Paragraphs packed up to `CHUNK_CHARS`; an oversized paragraph is cut on char boundaries.
pub fn chunk(text: &str) -> Vec<String> {
    let mut out = vec![String::new()];
    for para in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        let chars: Vec<char> = para.chars().collect();
        for piece in chars.chunks(CHUNK_CHARS) {
            let last = out.last_mut().unwrap();
            if !last.is_empty() && last.chars().count() + 2 + piece.len() > CHUNK_CHARS { out.push(String::new()); }
            let last = out.last_mut().unwrap();
            if !last.is_empty() { last.push_str("\n\n"); }
            last.extend(piece);
        }
    }
    out.retain(|c| !c.is_empty());
    out
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm = |v: &[f32]| v.iter().map(|x| x * x).sum::<f32>().sqrt();
    dot / (norm(a) * norm(b)).max(f32::EPSILON)
}

/// Notes whose best chunk clears `MIN_SIMILARITY`, best first, with that chunk's text.
pub fn semantic<'a>(query: &[f32], notes: &[Note], index: &'a Index) -> Vec<(usize, &'a str)> {
    let mut scored: Vec<(f32, usize, &str)> = notes.iter().enumerate().filter_map(|(i, note)| {
        index.notes.get(&note.path)?.chunks.iter()
            .map(|c| (cosine(query, &c.vec), i, c.text.as_str()))
            .max_by(|a, b| a.0.total_cmp(&b.0))
            .filter(|best| best.0 >= MIN_SIMILARITY)
    }).collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().map(|(_, i, text)| (i, text)).collect()
}

/// Reciprocal rank fusion (k = 60): rank-based, so BM25 and cosine scales never need calibrating.
pub fn fuse(lists: &[Vec<usize>]) -> Vec<usize> {
    let mut score: HashMap<usize, f64> = HashMap::new();
    for list in lists {
        for (rank, &i) in list.iter().enumerate() { *score.entry(i).or_default() += 1.0 / (61.0 + rank as f64); }
    }
    let mut out: Vec<(usize, f64)> = score.into_iter().collect();
    out.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    out.into_iter().map(|(i, _)| i).collect()
}

/// Notes to (re-)embed, and cached paths no longer in the vault.
pub fn stale(index: &Index, notes: &[Note]) -> (Vec<usize>, Vec<String>) {
    let todo = notes.iter().enumerate()
        .filter(|(_, n)| index.notes.get(&n.path).is_none_or(|e| e.stamp != n.stamp))
        .map(|(i, _)| i).collect();
    let live: HashSet<&str> = notes.iter().map(|n| n.path.as_str()).collect();
    let gone = index.notes.keys().filter(|p| !live.contains(p.as_str())).cloned().collect();
    (todo, gone)
}

/// A missing, corrupt or other-model cache is simply rebuilt.
// ponytail: whole JSON file parsed per search (~8 MB, tens of ms); keep it in memory if that shows up next to the network round trip.
pub fn load(file: &Path) -> Index {
    std::fs::read(file).ok()
        .and_then(|raw| serde_json::from_slice::<Index>(&raw).ok())
        .filter(|index| index.model == MODEL)
        .unwrap_or_else(|| Index { model: MODEL.into(), notes: HashMap::new() })
}

fn save(file: &Path, index: &Index) -> Result<(), String> {
    if let Some(dir) = file.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(index).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, file).map_err(|e| e.to_string())
}

/// Unix seconds before which the embedding quota is known to be exhausted.
static BLOCKED_UNTIL: AtomicU64 = AtomicU64::new(0);

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Google's `RetryInfo.retryDelay` ("76581s"): per-minute limits say ~60 s, the daily one hours.
fn retry_delay(error: &Value) -> Option<u64> {
    error["error"]["details"].as_array()?.iter()
        .find_map(|d| d["retryDelay"].as_str())?
        .trim_end_matches('s').parse::<f64>().ok().map(|s| s.ceil() as u64)
}

fn embed(key: &str, texts: &[String], timeout: Duration) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::blocking::Client::builder().timeout(timeout).build().map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(texts.len());
    for batch in texts.chunks(BATCH) {
        let requests: Vec<Value> = batch.iter().map(|t| json!({
            "model": format!("models/{MODEL}"),
            "content": { "parts": [{ "text": t }] },
            "output_dimensionality": DIMS,
        })).collect();
        let resp = client
            .post(format!("https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents"))
            .header("x-goog-api-key", key)
            .json(&json!({ "requests": requests }))
            .send().map_err(|e| e.without_url().to_string())?;
        let status = resp.status();
        let resp: Value = resp.json().map_err(|e| e.to_string())?;
        if status.as_u16() == 429 {
            BLOCKED_UNTIL.store(now() + retry_delay(&resp).unwrap_or(60), Ordering::SeqCst);
        }
        if !status.is_success() {
            return Err(format!("{status}: {}", resp["error"]["message"].as_str().unwrap_or("")));
        }
        let vecs: Vec<Vec<f32>> = resp["embeddings"].as_array().ok_or("embedding response without embeddings")?
            .iter().map(|e| e["values"].as_array().map(|v| v.iter().filter_map(Value::as_f64).map(|x| x as f32).collect()).unwrap_or_default())
            .collect();
        if vecs.len() != batch.len() || vecs.iter().any(|v| v.len() != DIMS) { return Err("embedding response shape mismatch".into()); }
        out.extend(vecs);
    }
    Ok(out)
}

fn document_text(note: &Note, chunk: &str) -> String {
    format!("title: {} | text: {chunk}", file_name(&note.path).trim_end_matches(".md"))
}

/// Embeds stale notes in whole-note batches of about `BATCH` chunks, saving after each batch
/// so an interrupted or rate-limited run keeps its progress.
fn refresh(file: &Path, key: &str, notes: &[Note]) -> Result<(), String> {
    let mut index = load(file);
    let (todo, gone) = stale(&index, notes);
    for path in gone { index.notes.remove(&path); }
    let mut pending: Vec<(usize, Vec<String>)> = Vec::new();
    let flush = |pending: &mut Vec<(usize, Vec<String>)>, index: &mut Index| -> Result<(), String> {
        let texts: Vec<String> = pending.iter().flat_map(|(i, cs)| cs.iter().map(|c| document_text(&notes[*i], c))).collect();
        let mut vecs = embed(key, &texts, BATCH_TIMEOUT)?.into_iter();
        for (i, cs) in pending.drain(..) {
            let chunks = cs.into_iter().map(|text| Chunk { vec: vecs.next().unwrap_or_default(), text }).collect();
            index.notes.insert(notes[i].path.clone(), IndexedNote { stamp: notes[i].stamp, chunks });
        }
        save(file, index)
    };
    for i in todo {
        pending.push((i, chunk(&notes[i].text)));
        if pending.iter().map(|(_, cs)| cs.len()).sum::<usize>() >= BATCH { flush(&mut pending, &mut index)?; }
    }
    flush(&mut pending, &mut index)
}

static REFRESHING: AtomicBool = AtomicBool::new(false);

fn refresh_in_background(file: PathBuf, key: String, notes: Vec<Note>) {
    if REFRESHING.swap(true, Ordering::SeqCst) { return; }
    std::thread::spawn(move || {
        if let Err(e) = refresh(&file, &key, &notes) { eprintln!("notes embedding refresh: {e}"); }
        REFRESHING.store(false, Ordering::SeqCst);
    });
}

fn excerpt(note: &Note, query: &str, best_chunk: Option<&str>) -> String {
    let terms: Vec<String> = tokens(query).collect();
    let mut out = String::new();
    for para in note.text.split("\n\n").filter(|p| terms.iter().any(|t| p.to_lowercase().contains(t.as_str()))) {
        if out.chars().count() > 1500 { break; }
        out.push_str(para.trim());
        out.push_str("\n\n");
    }
    let source = if !out.is_empty() { out.as_str() } else { best_chunk.unwrap_or(&note.text) };
    source.chars().take(1800).collect()
}

/// BM25 always; embeddings only when a key is present, the quota is not exhausted and the
/// query embeds in time.
/// Stale notes are embedded in the background, never inside this call.
pub fn search(vault: &Path, cache: &Path, query: &str, key: Option<&str>) -> Vec<NoteHit> {
    let notes = scan(vault);
    let mut lists = vec![bm25(query, &notes)];
    let index = load(cache);
    let mut best: HashMap<usize, &str> = HashMap::new();
    if let Some(key) = key.filter(|_| now() >= BLOCKED_UNTIL.load(Ordering::SeqCst)) {
        if let Ok(q) = embed(key, &[format!("task: search result | query: {query}")], QUERY_TIMEOUT) {
            let hits = semantic(&q[0], &notes, &index);
            best.extend(hits.iter().copied());
            lists.push(hits.into_iter().map(|(i, _)| i).collect());
        }
        let (todo, gone) = stale(&index, &notes);
        if !todo.is_empty() || !gone.is_empty() { refresh_in_background(cache.to_path_buf(), key.to_string(), notes.clone()); }
    }
    fuse(&lists).into_iter().take(3)
        .map(|i| NoteHit { path: notes[i].path.clone(), excerpt: excerpt(&notes[i], query, best.get(&i).copied()) })
        .collect()
}

/// Lets Gemini Live answer from the user's own Obsidian notes before its own knowledge.
#[tauri::command]
pub async fn search_notes(
    query: String,
    api_key: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<NoteHit>, String> {
    let memory_key = api_key.filter(|k| !k.trim().is_empty()).or_else(|| state.gemini_api_key.lock().ok().and_then(|g| g.clone()));
    let key = crate::cmd_auth::resolve_gemini_api_key(memory_key);
    let cache = app.path().app_data_dir().map_err(|e| e.to_string())?.join("notes-embeddings.json");
    let vault = obsidian_vault()?;
    tauri::async_runtime::spawn_blocking(move || search(&vault, &cache, &query, key.as_deref()))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str, text: &str) -> Note {
        Note { path: path.into(), text: text.into(), stamp: (1, text.len() as u64) }
    }

    fn indexed(vec: Vec<f32>) -> IndexedNote {
        IndexedNote { stamp: (1, 0), chunks: vec![Chunk { text: "chunk".into(), vec }] }
    }

    #[test]
    fn bm25_ranks_rare_terms_first_and_skips_unrelated_notes() {
        let notes = vec![note("a.md", "query query query"), note("b.md", "useMutation query"), note("c.md", "phở bò")];
        assert_eq!(bm25("useMutation query", &notes), vec![1, 0]);
        assert!(bm25("kubernetes", &notes).is_empty());
        let rust = note("Rust/ownership.md", "# Ownership\n\nBorrow checker rules.\n\nUnrelated recipe.");
        let text = excerpt(&rust, "rust borrow", None);
        assert!(text.contains("Borrow checker") && !text.contains("recipe"));
    }

    #[test]
    fn synonym_note_surfaces_through_vectors_only() {
        let notes = vec![note("soft.md", "soft delete keeps rows"), note("other.md", "pagination")];
        let mut index = Index::default();
        index.notes.insert("soft.md".into(), indexed(vec![1.0, 0.0]));
        index.notes.insert("other.md".into(), indexed(vec![0.0, 1.0]));
        assert!(bm25("xoá mềm", &notes).is_empty());
        let hits = semantic(&[0.9, 0.1], &notes, &index);
        assert_eq!(hits.iter().map(|h| h.0).collect::<Vec<_>>(), vec![0], "below MIN_SIMILARITY is dropped");
        assert_eq!(fuse(&[bm25("xoá mềm", &notes), vec![0]]), vec![0]);
    }

    #[test]
    fn retry_delay_reads_google_retry_info() {
        let body = json!({ "error": { "details": [{ "@type": "Help" }, { "retryDelay": "76581s" }] } });
        assert_eq!(retry_delay(&body), Some(76581));
        assert_eq!(retry_delay(&json!({ "error": {} })), None);
    }

    #[test]
    fn fusion_without_vectors_is_bm25_order() {
        assert_eq!(fuse(&[vec![2, 0, 1]]), vec![2, 0, 1]);
        assert_eq!(fuse(&[vec![2, 0, 1], vec![1]])[0], 1, "agreeing lists lift a note");
    }

    #[test]
    fn stale_lists_new_and_changed_notes_and_drops_deleted() {
        let notes = vec![note("same.md", ""), note("changed.md", "edited"), note("new.md", "x")];
        let mut index = Index::default();
        for p in ["same.md", "changed.md", "deleted.md"] { index.notes.insert(p.into(), indexed(vec![1.0])); }
        let (todo, gone) = stale(&index, &notes);
        assert_eq!(todo, vec![1, 2]);
        assert_eq!(gone, vec!["deleted.md".to_string()]);
    }

    #[test]
    fn chunk_packs_paragraphs_and_splits_oversized_ones() {
        let long = "a".repeat(CHUNK_CHARS + 10);
        let chunks = chunk(&format!("one\n\ntwo\n\n{long}"));
        assert_eq!(chunks, vec!["one\n\ntwo".to_string(), "a".repeat(CHUNK_CHARS), "a".repeat(10)]);
    }

    #[test]
    fn search_without_key_uses_bm25_and_cache_round_trips() {
        let dir = std::env::temp_dir().join(format!("notes-test-{}", std::process::id()));
        let vault = dir.join("vault");
        std::fs::create_dir_all(vault.join(".obsidian")).unwrap();
        std::fs::write(vault.join("django.md"), "Django soft delete").unwrap();
        std::fs::write(vault.join(".obsidian/hidden.md"), "Django soft delete").unwrap();
        let cache = dir.join("cache.json");
        let hits = search(&vault, &cache, "soft delete", None);
        assert_eq!(hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(), vec!["django.md"]);

        let mut index = load(&cache);
        index.notes.insert("django.md".into(), indexed(vec![0.5]));
        save(&cache, &index).unwrap();
        assert_eq!(load(&cache).notes.len(), 1);
        std::fs::write(&cache, "not json").unwrap();
        assert!(load(&cache).notes.is_empty(), "corrupt cache is rebuilt");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
