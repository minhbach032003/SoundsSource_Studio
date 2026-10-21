use crate::care::PetCareStore;
use crate::event::{AgentEvent, AgentState};
use crate::question::QuestionDetector;
use crate::session::SessionStore;
use crate::transcript::TranscriptReader;
use chrono::Utc;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
#[cfg(unix)]
use std::os::unix::net::UnixListener;

/// Hooks fired while the app is closed land in the spool instead of being dropped;
/// `drain_queue` replays them on the next launch.
pub const QUEUE_MAX_FILES: usize = 500;
/// A hook event older than this describes a session that is long gone.
pub const QUEUE_MAX_AGE_SECS: i64 = 24 * 3600;

/// What the Socket Bridge panel reports. Every field is measured, never assumed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BridgeStatus {
    /// The path actually bound, which is the fallback mirror when the primary was taken.
    pub socket_path: Option<String>,
    pub is_listening: bool,
    /// Why the listener is down, so a silent bind failure stops being invisible.
    pub last_error: Option<String>,
    pub events_received: u64,
    /// Hook events replayed from the offline spool since launch.
    pub events_replayed: u64,
    pub queued_events: u64,
    pub last_event_at: Option<i64>,
}

pub struct AgentPetServer {
    socket_path: PathBuf,
    is_running: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    bound_path: Mutex<Option<PathBuf>>,
    last_error: Mutex<Option<String>>,
    events_received: Arc<AtomicU64>,
    events_replayed: Arc<AtomicU64>,
    last_event_at: Arc<AtomicI64>,
}

impl AgentPetServer {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            is_running: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
            bound_path: Mutex::new(None),
            last_error: Mutex::new(None),
            events_received: Arc::new(AtomicU64::new(0)),
            events_replayed: Arc::new(AtomicU64::new(0)),
            last_event_at: Arc::new(AtomicI64::new(0)),
        }
    }

    pub fn queue_dir() -> Option<PathBuf> {
        std::env::var("HOME")
            .ok()
            .map(|home| Path::new(&home).join(".agentpet").join("queue"))
    }

    /// A spool entry is written as a dotfile and renamed into place, so only the final
    /// name counts; reading the dotfile would race the dispatcher's rename.
    fn is_spool_entry(path: &Path) -> bool {
        path.extension().and_then(|x| x.to_str()) == Some("json")
            && !path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with('.'))
    }

    fn queued_count() -> u64 {
        Self::queue_dir()
            .and_then(|dir| std::fs::read_dir(dir).ok())
            .map(|entries| entries.flatten().filter(|e| Self::is_spool_entry(&e.path())).count() as u64)
            .unwrap_or(0)
    }

    pub fn status(&self) -> BridgeStatus {
        let last = self.last_event_at.load(Ordering::Relaxed);
        BridgeStatus {
            socket_path: self
                .bound_path
                .lock()
                .unwrap()
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            is_listening: self.is_running.load(Ordering::Relaxed),
            last_error: self.last_error.lock().unwrap().clone(),
            events_received: self.events_received.load(Ordering::Relaxed),
            events_replayed: self.events_replayed.load(Ordering::Relaxed),
            queued_events: Self::queued_count(),
            last_event_at: (last > 0).then_some(last),
        }
    }

    /// Both the live socket reader and the offline replay feed care the same way,
    /// so a session the app missed is worth exactly what a live one would have been.
    fn apply_care(
        care_store: &Arc<Mutex<PetCareStore>>,
        applied: Option<AgentState>,
        is_meal: bool,
        tokens: u64,
        now_ts: i64,
    ) {
        let mut tokens_to_feed = tokens;
        let care_guard = care_store.lock().unwrap();
        let mut state = care_guard.load();
        if is_meal {
            state.record_meal(now_ts);
        }
        // Default token burst (500) for tool use / live activity if no explicit or transcript tokens
        if tokens_to_feed == 0 && (is_meal || applied == Some(AgentState::Working)) {
            tokens_to_feed = 500;
        }
        if tokens_to_feed > 0 {
            state.feed_tokens(tokens_to_feed, now_ts);
        }
        let _ = care_guard.save(&state);
    }

    pub fn default_socket_path() -> PathBuf {
        #[cfg(unix)]
        {
            if let Ok(home) = std::env::var("HOME") {
                Path::new(&home).join(".agentpet").join("agentpet.sock")
            } else {
                std::env::temp_dir().join("agentpet.sock")
            }
        }
        #[cfg(not(unix))]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                Path::new(&appdata).join("agentpet").join("pet.sock")
            } else {
                std::env::temp_dir().join("agentpet.sock")
            }
        }
    }

    /// Replays hook events the dispatcher spooled while no listener was up, which is
    /// every event fired between quitting the app and launching it again. Returns how
    /// many were applied.
    ///
    /// `read_dir` yields files in filesystem order, but `SessionStore` keeps a per-session
    /// watermark: an event delivered out of order is discarded as stale. The spool is
    /// therefore sorted by the dispatcher's own monotonic sequence before replay.
    pub fn drain_queue(
        sessions: &Arc<Mutex<SessionStore>>,
        care_store: &Arc<Mutex<PetCareStore>>,
    ) -> u64 {
        let Some(queue_dir) = Self::queue_dir() else {
            return 0;
        };
        let Ok(entries) = std::fs::read_dir(&queue_dir) else {
            return 0;
        };

        let now = Utc::now().timestamp();
        let mut pending: Vec<(u64, PathBuf, AgentEvent)> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !Self::is_spool_entry(&path) {
                continue;
            }
            let parsed = std::fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<AgentEvent>(&content).ok());
            let Some(event) = parsed else {
                // Unreadable or truncated spool files would otherwise pile up forever.
                let _ = std::fs::remove_file(&path);
                continue;
            };
            // A session from yesterday has no live counterpart left to drive.
            if event.timestamp.is_some_and(|ts| now.saturating_sub(ts) > QUEUE_MAX_AGE_SECS) {
                let _ = std::fs::remove_file(&path);
                continue;
            }
            let order = event
                .sequence
                .or_else(|| event.timestamp.and_then(|ts| u64::try_from(ts).ok()?.checked_mul(1_000_000)))
                .unwrap_or(0);
            pending.push((order, path, event));
        }

        pending.sort_by(|(a_order, a_path, _), (b_order, b_path, _)| {
            a_order.cmp(b_order).then_with(|| a_path.cmp(b_path))
        });

        // The dispatchers cap their own spool, but a launch must not be held hostage by
        // whatever is on disk: keep the newest window and discard the rest.
        if pending.len() > QUEUE_MAX_FILES {
            for (_, path, _) in pending.drain(..pending.len() - QUEUE_MAX_FILES) {
                let _ = std::fs::remove_file(&path);
            }
        }

        let mut replayed = 0u64;
        for (_, path, event) in pending {
            let ts = event.timestamp.unwrap_or(now);
            let tokens = event.tokens.unwrap_or(0);
            let mut sess_guard = sessions.lock().unwrap();
            let (applied, is_meal) = sess_guard.apply(event, ts);
            drop(sess_guard);
            let _ = std::fs::remove_file(&path);
            if applied.is_none() {
                continue;
            }
            Self::apply_care(care_store, applied, is_meal, tokens, ts);
            replayed += 1;
        }
        replayed
    }

    #[cfg(unix)]
    pub fn start(
        &self,
        sessions: Arc<Mutex<SessionStore>>,
        care_store: Arc<Mutex<PetCareStore>>,
    ) -> Result<(), std::io::Error> {
        let mut worker = self.worker.lock().unwrap();
        if worker.is_some() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AddrInUse,
                "Pet server already started",
            ));
        }

        let replayed = Self::drain_queue(&sessions, &care_store);
        self.events_replayed.fetch_add(replayed, Ordering::Relaxed);

        let mut actual_socket_path = self.socket_path.clone();

        let is_default_agentpet_path = actual_socket_path.ends_with(".agentpet/agentpet.sock")
            || actual_socket_path.file_name().and_then(|n| n.to_str()) == Some("agentpet.sock");

        // Check if path exists or is a broken symlink via symlink_metadata
        let is_symlink_or_exists = actual_socket_path.symlink_metadata().is_ok();
        if is_symlink_or_exists {
            // Check if another live instance is actually connected/listening:
            if std::os::unix::net::UnixStream::connect(&actual_socket_path).is_ok() {
                if is_default_agentpet_path {
                    // If the primary socket (e.g. ~/.agentpet/agentpet.sock) has a live listener:
                    // Fall back gracefully to ~/.rust-sound/pet.sock so rust-sound starts without collision!
                    if let Ok(home) = std::env::var("HOME") {
                        let fallback = Path::new(&home).join(".rust-sound").join("pet.sock");
                        if fallback != actual_socket_path {
                            // A surviving mirror aliases the primary listener, not an
                            // independently owned fallback. Remove only the alias itself.
                            let aliases_primary = std::fs::read_link(&fallback).ok().is_some_and(|target| {
                                let target = if target.is_absolute() { target } else { fallback.parent().unwrap().join(target) };
                                target == actual_socket_path || std::fs::canonicalize(&target).ok()
                                    .zip(std::fs::canonicalize(&actual_socket_path).ok()).is_some_and(|(a, b)| a == b)
                            });
                            if fallback.symlink_metadata().is_ok()
                                && (aliases_primary || std::os::unix::net::UnixStream::connect(&fallback).is_err())
                            {
                                let _ = std::fs::remove_file(&fallback);
                            }
                            actual_socket_path = fallback;
                        }
                    }
                } else {
                    // Explicit custom socket is already active and in use
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::AddrInUse,
                        "Socket already has an active listener",
                    ));
                }
            } else {
                // Stale dead socket or broken symlink left over: clean it up!
                let _ = std::fs::remove_file(&actual_socket_path);
            }
        }

        if let Some(parent) = actual_socket_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let listener = match UnixListener::bind(&actual_socket_path) {
            Ok(listener) => listener,
            Err(error) => {
                // A bind failure used to be invisible: the app ran on with no bridge and
                // the panel still claimed "Connected". Keep the reason for the UI.
                *self.last_error.lock().unwrap() = Some(format!(
                    "Could not bind {}: {error}",
                    actual_socket_path.to_string_lossy()
                ));
                return Err(error);
            }
        };
        let owned = std::fs::symlink_metadata(&actual_socket_path)?;
        listener.set_nonblocking(true)?;
        *self.bound_path.lock().unwrap() = Some(actual_socket_path.clone());
        *self.last_error.lock().unwrap() = None;

        // Mirror symlink to ~/.rust-sound/pet.sock if bound to ~/.agentpet/agentpet.sock
        if let Ok(home) = std::env::var("HOME") {
            let mirror = Path::new(&home).join(".rust-sound").join("pet.sock");
            if mirror != actual_socket_path {
                if let Some(parent) = mirror.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if mirror.symlink_metadata().is_ok()
                    && std::os::unix::net::UnixStream::connect(&mirror).is_err()
                {
                    let _ = std::fs::remove_file(&mirror);
                }
                let _ = std::os::unix::fs::symlink(&actual_socket_path, &mirror);
            }
        }

        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();
        let socket_file = actual_socket_path.clone();
        let transcript_reader = Arc::new(TranscriptReader::new());
        let events_received = self.events_received.clone();
        let last_event_at = self.last_event_at.clone();

        *worker = Some(thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        // macOS accepted sockets can inherit listener nonblocking mode.
                        // A split write must wait for its newline, not drop on WouldBlock.
                        if stream.set_nonblocking(false).is_err() { continue; }
                        // Darwin can reject SO_RCVTIMEO after the peer closes;
                        // buffered complete hook events must still be consumed.
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                        let sessions_clone = sessions.clone();
                        let care_clone = care_store.clone();
                        let reader_clone = transcript_reader.clone();
                        let received_clone = events_received.clone();
                        let last_event_clone = last_event_at.clone();

                        thread::spawn(move || {
                            let reader = BufReader::new(stream);
                            for line in reader.lines().map_while(Result::ok) {
                                if line.trim().is_empty() {
                                    continue;
                                }
                                if let Ok(mut event) = serde_json::from_str::<AgentEvent>(&line) {
                                    let now_ts = Utc::now().timestamp();

                                    // Incremental transcript token reading & Question detection
                                    let transcript_path = event.transcript_path.as_ref().map(PathBuf::from).or_else(|| {
                                        TranscriptReader::find_claude_transcript(&event.session_id, event.project.as_deref())
                                    });

                                    let mut tokens_to_feed = event.tokens.unwrap_or(0);
                                    if let Some(ref t_path) = transcript_path {
                                        if let Some(delta) = reader_clone.read_new_usage(t_path) {
                                            if delta.tokens > 0 {
                                                tokens_to_feed = tokens_to_feed.saturating_add(delta.tokens);
                                            }
                                        }

                                        // Turn-ending question refinement on Claude Stop events
                                        if event.event_name == "Stop" && event.agent_kind.to_ascii_lowercase().starts_with("claude") {
                                            if let Some(assistant_text) = TranscriptReader::read_latest_assistant_text(t_path) {
                                                if QuestionDetector::looks_like_question(&assistant_text) {
                                                    event.message = Some(assistant_text);
                                                }
                                            }
                                        }
                                    }

                                    let mut sess_guard = sessions_clone.lock().unwrap();
                                    let (applied, is_meal) = sess_guard.apply(event, now_ts);
                                    drop(sess_guard);
                                    if applied.is_none() { continue; }

                                    received_clone.fetch_add(1, Ordering::Relaxed);
                                    last_event_clone.store(now_ts, Ordering::Relaxed);
                                    Self::apply_care(&care_clone, applied, is_meal, tokens_to_feed, now_ts);
                                }
                            }
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(100));
                    }
                    Err(_) => {
                        thread::sleep(Duration::from_millis(100));
                    }
                }
            }
            // Only remove our own inode, never a replacement created by another app.
            if std::fs::symlink_metadata(&socket_file)
                .is_ok_and(|current| current.dev() == owned.dev() && current.ino() == owned.ino())
            {
                // The mirror is an alias of this very socket, so leaving it behind leaves a
                // dangling symlink that every hook dispatcher tries first until the next launch.
                if let Ok(home) = std::env::var("HOME") {
                    let mirror = Path::new(&home).join(".rust-sound").join("pet.sock");
                    if mirror != socket_file
                        && std::fs::read_link(&mirror).is_ok_and(|target| {
                            let target = if target.is_absolute() {
                                target
                            } else {
                                mirror.parent().unwrap_or(Path::new("/")).join(target)
                            };
                            target == socket_file
                        })
                    {
                        let _ = std::fs::remove_file(&mirror);
                    }
                }
                let _ = std::fs::remove_file(socket_file);
            }
        }));

        Ok(())
    }

    #[cfg(not(unix))]
    pub fn start(
        &self,
        sessions: Arc<Mutex<SessionStore>>,
        care_store: Arc<Mutex<PetCareStore>>,
    ) -> Result<(), std::io::Error> {
        let mut worker = self.worker.lock().unwrap();
        if worker.is_some() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AddrInUse,
                "Pet server already started",
            ));
        }

        let replayed = Self::drain_queue(&sessions, &care_store);
        self.events_replayed.fetch_add(replayed, Ordering::Relaxed);

        let listener = match std::net::TcpListener::bind("127.0.0.1:48201") {
            Ok(listener) => listener,
            Err(error) => {
                *self.last_error.lock().unwrap() =
                    Some(format!("Could not bind 127.0.0.1:48201: {error}"));
                return Err(error);
            }
        };
        listener.set_nonblocking(true)?;
        *self.bound_path.lock().unwrap() = Some("127.0.0.1:48201".to_string().into());
        *self.last_error.lock().unwrap() = None;

        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();
        let events_received = self.events_received.clone();
        let last_event_at = self.last_event_at.clone();

        *worker = Some(thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        // macOS accepted sockets can inherit listener nonblocking mode.
                        // A split write must wait for its newline, not drop on WouldBlock.
                        if stream.set_nonblocking(false).is_err() { continue; }
                        // Darwin can reject SO_RCVTIMEO after the peer closes;
                        // buffered complete hook events must still be consumed.
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                        let sessions_clone = sessions.clone();
                        let care_clone = care_store.clone();
                        let received_clone = events_received.clone();
                        let last_event_clone = last_event_at.clone();
                        thread::spawn(move || {
                            let reader = BufReader::new(stream);
                            for line in reader.lines().map_while(Result::ok) {
                                if line.trim().is_empty() {
                                    continue;
                                }
                                if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
                                    let now_ts = Utc::now().timestamp();
                                    let tokens = event.tokens.unwrap_or(0);
                                    let mut sess_guard = sessions_clone.lock().unwrap();
                                    let (applied, is_meal) = sess_guard.apply(event, now_ts);
                                    drop(sess_guard);
                                    if applied.is_none() { continue; }

                                    received_clone.fetch_add(1, Ordering::Relaxed);
                                    last_event_clone.store(now_ts, Ordering::Relaxed);
                                    Self::apply_care(&care_clone, applied, is_meal, tokens, now_ts);
                                }
                            }
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(100));
                    }
                    Err(_) => {
                        thread::sleep(Duration::from_millis(100));
                    }
                }
            }
        }));

        Ok(())
    }

    pub fn stop(&self) {
        let mut worker = self.worker.lock().unwrap();
        self.is_running.store(false, Ordering::SeqCst);
        if let Some(handle) = worker.take() {
            let _ = handle.join();
        }
        *self.bound_path.lock().unwrap() = None;
    }
}

impl Drop for AgentPetServer {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(all(test, unix))]
mod review_tests {
    use super::*;
    use std::os::unix::fs::FileTypeExt;
    #[test]
    fn invalid_transcript_events_still_apply_and_stale_work_stays_terminal() {
        if std::env::var_os("PET_TRANSCRIPT_CHILD").is_none() {
            let home = tempfile::tempdir().unwrap();
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "pet::server::review_tests::invalid_transcript_events_still_apply_and_stale_work_stays_terminal", "--nocapture"])
                .env("HOME", home.path()).env("PET_TRANSCRIPT_CHILD", "1").output().unwrap();
            assert!(output.status.success(), "{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
            return;
        }
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("test.sock");
        let fifo = dir.path().join("pipe.jsonl");
        assert!(std::process::Command::new("mkfifo").arg(&fifo).status().unwrap().success());
        let huge = dir.path().join("huge.jsonl");
        std::fs::File::create(&huge).unwrap().set_len(32 * 1024 * 1024).unwrap();
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let care = Arc::new(Mutex::new(PetCareStore::new(dir.path().join("care.json"))));
        let server = AgentPetServer::new(&socket);
        server.start(sessions.clone(), care).unwrap();
        // Deliver all events without timing gaps on the actual socket. The old
        // work carries FIFO metadata and may finish after terminal enrichment.
        for (name, sequence, transcript) in [
            ("Stop", 4, &huge), ("PreToolUse", 3, &fifo),
            ("SessionEnd", 6, &fifo), ("PreToolUse", 5, &huge),
        ] {
            let mut stream = std::os::unix::net::UnixStream::connect(&socket).unwrap();
            writeln!(stream, "{}", serde_json::json!({"session_id":"race", "agent_kind":"claude", "event_name":name, "sequence":sequence, "transcript_path":transcript})).unwrap();
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        // A later explicit session can register even after a terminal marker.
        let mut stream = std::os::unix::net::UnixStream::connect(&socket).unwrap();
        writeln!(stream, "{}", serde_json::json!({"session_id":"race", "agent_kind":"claude", "event_name":"SessionStart", "sequence":7, "transcript_path":fifo})).unwrap();
        drop(stream);
        while sessions.lock().unwrap().get("race").map(|s| s.state) != Some(crate::event::AgentState::Registered)
            && std::time::Instant::now() < deadline { thread::sleep(Duration::from_millis(10)); }
        assert_eq!(sessions.lock().unwrap().get("race").map(|s| s.state), Some(crate::event::AgentState::Registered));
        server.stop();
    }

    #[test]
    fn surviving_mirror_is_reclaimed_but_independent_listener_is_preserved() {
        if std::env::var_os("PET_RESTART_CHILD").is_none() {
            let home = tempfile::tempdir().unwrap();
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "pet::server::review_tests::surviving_mirror_is_reclaimed_but_independent_listener_is_preserved", "--nocapture"])
                .env("HOME", home.path()).env("PET_RESTART_CHILD", "1").output().unwrap();
            assert!(output.status.success(), "{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
            return;
        }
        let primary = AgentPetServer::default_socket_path();
        let mirror = Path::new(&std::env::var("HOME").unwrap()).join(".rust-sound/pet.sock");
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let care = Arc::new(Mutex::new(PetCareStore::new(mirror.with_extension("json"))));
        let first = AgentPetServer::new(&primary);
        first.start(sessions.clone(), care.clone()).unwrap();
        first.stop();
        // Legacy takes primary after our previous shutdown; alias may survive a crash.
        let _ = std::fs::remove_file(&mirror);
        std::os::unix::fs::symlink(&primary, &mirror).unwrap();
        let legacy = UnixListener::bind(&primary).unwrap();
        let second = AgentPetServer::new(&primary);
        second.start(sessions.clone(), care.clone()).expect("must reclaim own fallback alias, not mistake it for independent listener");
        assert!(mirror.symlink_metadata().unwrap().file_type().is_socket());
        second.stop();
        let independent = UnixListener::bind(&mirror).unwrap();
        let third = AgentPetServer::new(&primary);
        assert!(third.start(sessions, care).is_err());
        third.stop();
        assert!(std::os::unix::net::UnixStream::connect(&mirror).is_ok());
        drop((legacy, independent));
    }
}
