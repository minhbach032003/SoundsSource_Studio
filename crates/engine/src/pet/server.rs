use crate::pet::care::PetCareStore;
use crate::pet::event::AgentEvent;
use crate::pet::session::SessionStore;
use chrono::Utc;
use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub struct AgentPetServer {
    socket_path: PathBuf,
    is_running: Arc<AtomicBool>,
}

impl AgentPetServer {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn default_socket_path() -> PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            Path::new(&home).join(".agentpet").join("agentpet.sock")
        } else {
            PathBuf::from("/tmp/agentpet.sock")
        }
    }

    pub fn start(
        &self,
        sessions: Arc<Mutex<SessionStore>>,
        care_store: Arc<Mutex<PetCareStore>>,
    ) -> Result<(), std::io::Error> {
        if let Some(parent) = self.socket_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        // Clean up stale socket file if it exists
        if self.socket_path.exists() {
            let _ = std::fs::remove_file(&self.socket_path);
        }

        let listener = UnixListener::bind(&self.socket_path)?;
        listener.set_nonblocking(true)?;

        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();
        let socket_file = self.socket_path.clone();

        thread::spawn(move || {
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
            let _ = std::fs::remove_file(socket_file);
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        if self.socket_path.exists() {
            let _ = std::fs::remove_file(&self.socket_path);
        }
    }
}
