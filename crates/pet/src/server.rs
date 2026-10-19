use crate::care::PetCareStore;
use crate::event::{AgentEvent, AgentState};
use crate::question::QuestionDetector;
use crate::session::SessionStore;
use crate::transcript::TranscriptReader;
use chrono::Utc;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
#[cfg(unix)]
use std::os::unix::net::UnixListener;

pub struct AgentPetServer {
    socket_path: PathBuf,
    is_running: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}

impl AgentPetServer {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            is_running: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
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

    pub fn drain_queue(sessions: &Arc<Mutex<SessionStore>>, care_store: &Arc<Mutex<PetCareStore>>) {
        if let Ok(home) = std::env::var("HOME") {
            let queue_dir = Path::new(&home).join(".agentpet").join("queue");
            if queue_dir.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&queue_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("json") {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                if let Ok(event) = serde_json::from_str::<AgentEvent>(&content) {
                                    let ts = event.timestamp.unwrap_or_else(|| Utc::now().timestamp());
                                    let mut sess_guard = sessions.lock().unwrap();
                                    let (_, is_meal) = sess_guard.apply(event, ts);
                                    drop(sess_guard);

                                    if is_meal {
                                        let care_guard = care_store.lock().unwrap();
                                        let mut state = care_guard.load();
                                        state.record_meal(ts);
                                        let _ = care_guard.save(&state);
                                    }
                                }
                            }
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
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

        Self::drain_queue(&sessions, &care_store);

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

        let listener = UnixListener::bind(&actual_socket_path)?;
        let owned = std::fs::symlink_metadata(&actual_socket_path)?;
        listener.set_nonblocking(true)?;

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

                                    let care_guard = care_clone.lock().unwrap();
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

        let listener = std::net::TcpListener::bind("127.0.0.1:48201")?;
        listener.set_nonblocking(true)?;

        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();

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
                        thread::spawn(move || {
                            let reader = BufReader::new(stream);
                            for line in reader.lines().map_while(Result::ok) {
                                if line.trim().is_empty() {
                                    continue;
                                }
                                if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
                                    let now_ts = Utc::now().timestamp();
                                    let mut sess_guard = sessions_clone.lock().unwrap();
                                    let (applied, is_meal) = sess_guard.apply(event, now_ts);
                                    drop(sess_guard);
                                    if applied.is_none() { continue; }

                                    let care_guard = care_clone.lock().unwrap();
                                    let mut state = care_guard.load();
                                    if is_meal {
                                        state.record_meal(now_ts);
                                    }
                                    let tokens = event.tokens.unwrap_or(0);
                                    if tokens > 0 {
                                        state.feed_tokens(tokens, now_ts);
                                    }
                                    let _ = care_guard.save(&state);
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
