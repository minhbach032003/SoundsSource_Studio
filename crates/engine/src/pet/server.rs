use crate::pet::care::PetCareStore;
use crate::pet::event::AgentEvent;
use crate::pet::session::SessionStore;
use chrono::Utc;
use std::io::{BufRead, BufReader};
use std::os::unix::fs::MetadataExt;
use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

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
        if let Ok(home) = std::env::var("HOME") {
            Path::new(&home).join(".rust-sound").join("pet.sock")
        } else {
            std::env::temp_dir().join("rust-sound-pet.sock")
        }
    }

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
        if let Some(parent) = self.socket_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Never unlink an existing endpoint: it may belong to a live process.
        let listener = UnixListener::bind(&self.socket_path)?;
        let owned = std::fs::symlink_metadata(&self.socket_path)?;
        listener.set_nonblocking(true)?;

        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();
        let socket_file = self.socket_path.clone();

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
            // Only remove our own inode, never a replacement created by another app.
            if std::fs::symlink_metadata(&socket_file)
                .is_ok_and(|current| current.dev() == owned.dev() && current.ino() == owned.ino())
            {
                let _ = std::fs::remove_file(socket_file);
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
