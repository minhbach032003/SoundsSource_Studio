use crate::pet::care::PetCareStore;
use crate::pet::event::AgentEvent;
use crate::pet::question::QuestionDetector;
use crate::pet::session::SessionStore;
use crate::pet::transcript::TranscriptReader;
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

        if actual_socket_path.exists() {
            // Check if another live instance is actually connected/listening:
            if std::os::unix::net::UnixStream::connect(&actual_socket_path).is_ok() {
                // If the primary socket (e.g. ~/.agentpet/agentpet.sock) has a live listener:
                // Fall back gracefully to ~/.rust-sound/pet.sock so rust-sound starts without collision!
                if let Ok(home) = std::env::var("HOME") {
                    let fallback = Path::new(&home).join(".rust-sound").join("pet.sock");
                    if fallback != actual_socket_path {
                        if fallback.exists() && std::os::unix::net::UnixStream::connect(&fallback).is_err() {
                            let _ = std::fs::remove_file(&fallback);
                        }
                        actual_socket_path = fallback;
                    }
                }
            } else {
                // Stale dead socket file left over from crashed/killed process: clean it up!
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
                if mirror.exists() && std::os::unix::net::UnixStream::connect(&mirror).is_err() {
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
                                                tokens_to_feed += delta.tokens;
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
                                    let (_, is_meal) = sess_guard.apply(event, now_ts);
                                    drop(sess_guard);

                                    let care_guard = care_clone.lock().unwrap();
                                    let mut state = care_guard.load();
                                    if is_meal {
                                        state.record_meal(now_ts);
                                    }
                                    let feed_amount = if tokens_to_feed > 0 { tokens_to_feed } else { 500 };
                                    state.feed_tokens(feed_amount, now_ts);
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
                                    let (_, is_meal) = sess_guard.apply(event, now_ts);
                                    drop(sess_guard);

                                    let care_guard = care_clone.lock().unwrap();
                                    let mut state = care_guard.load();
                                    if is_meal {
                                        state.record_meal(now_ts);
                                    } else {
                                        state.feed_tokens(500, now_ts);
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
