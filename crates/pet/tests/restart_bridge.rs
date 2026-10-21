//! Quitting the app and launching it again must leave the AgentPet bridge exactly as it
//! was: listening, and holding whatever the agents did in between.
#![cfg(unix)]

use sound_pet::{AgentPetServer, HookManager, PetCareStore, SessionStore};
use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Each case needs its own HOME, and HOME is process wide, so every test re-runs itself
/// as a child bound to a temp home.
fn in_temp_home(test_name: &str, guard: &str) -> bool {
    if std::env::var_os(guard).is_some() {
        return true;
    }
    let home = tempfile::tempdir().unwrap();
    let out = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", test_name, "--nocapture"])
        .env("HOME", home.path())
        .env(guard, "1")
        .output()
        .unwrap();
    print!("{}", String::from_utf8_lossy(&out.stdout));
    eprint!("{}", String::from_utf8_lossy(&out.stderr));
    assert!(out.status.success(), "{test_name} failed in the child process");
    false
}

fn home_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap())
}

fn launch(sessions: &Arc<Mutex<SessionStore>>) -> AgentPetServer {
    let server = AgentPetServer::new(AgentPetServer::default_socket_path());
    let care = Arc::new(Mutex::new(PetCareStore::new(home_dir().join("care.json"))));
    server.start(sessions.clone(), care).expect("listener must bind on launch");
    server
}

fn deliver(path: &Path, id: &str) {
    let mut stream = UnixStream::connect(path).unwrap_or_else(|e| panic!("connect {path:?}: {e}"));
    writeln!(
        stream,
        "{}",
        serde_json::json!({
            "session_id": id, "agent_kind": "claude", "event_name": "PreToolUse",
            "tool_name": "Read", "sequence": 1u64
        })
    )
    .unwrap();
}

fn wait_for(sessions: &Arc<Mutex<SessionStore>>, id: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if sessions.lock().unwrap().get(id).is_some() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    false
}

/// Fires the dispatcher the agents actually run, not a hand-rolled payload.
fn fire_hook(session_id: &str) {
    let cli = HookManager::ensure_agentpet_cli().unwrap();
    let mut child = std::process::Command::new("/bin/sh")
        .args(["-c", &format!("{cli} hook --agent claude")])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(
            format!(
                r#"{{"session_id":"{session_id}","hook_event_name":"PreToolUse","tool_name":"Read","cwd":"/fixture"}}"#
            )
            .as_bytes(),
        )
        .unwrap();
    assert!(child.wait().unwrap().success());
}

#[test]
fn repeated_quit_and_relaunch_keeps_both_socket_paths_live() {
    if !in_temp_home("repeated_quit_and_relaunch_keeps_both_socket_paths_live", "PET_RESTART_CHILD_A") {
        return;
    }
    let home = home_dir();
    let primary = home.join(".agentpet/agentpet.sock");
    let mirror = home.join(".rust-sound/pet.sock");

    for run in 1..=3 {
        let sessions = Arc::new(Mutex::new(SessionStore::new()));
        let server = launch(&sessions);

        for (label, path) in [("primary", &primary), ("mirror", &mirror)] {
            let id = format!("run{run}-{label}");
            deliver(path, &id);
            assert!(wait_for(&sessions, &id), "run {run}: {label} socket dropped the event");
        }

        server.stop();
        // A quit used to leave the mirror behind as a dangling symlink, so every hook
        // fired before the next launch wasted its first connect on a dead path.
        assert!(
            std::fs::symlink_metadata(&mirror).is_err(),
            "run {run}: quitting left {mirror:?} behind"
        );
    }
}

#[test]
fn relaunch_after_a_crash_reclaims_the_stale_sockets() {
    if !in_temp_home("relaunch_after_a_crash_reclaims_the_stale_sockets", "PET_RESTART_CHILD_B") {
        return;
    }
    let home = home_dir();
    let primary = home.join(".agentpet/agentpet.sock");
    let mirror = home.join(".rust-sound/pet.sock");

    // A crashed process unlinks nothing, so both paths survive with no listener behind
    // them. Dropping a UnixListener leaves the path in place, which models that exactly.
    std::fs::create_dir_all(primary.parent().unwrap()).unwrap();
    std::fs::create_dir_all(mirror.parent().unwrap()).unwrap();
    let dead = std::os::unix::net::UnixListener::bind(&primary).unwrap();
    std::os::unix::fs::symlink(&primary, &mirror).unwrap();
    drop(dead);

    let sessions = Arc::new(Mutex::new(SessionStore::new()));
    let server = launch(&sessions);
    for (label, path) in [("primary", &primary), ("mirror", &mirror)] {
        let id = format!("crash-{label}");
        deliver(path, &id);
        assert!(wait_for(&sessions, &id), "{label} socket dropped the event after a crash");
    }
    server.stop();
}

#[test]
fn hooks_fired_while_the_app_is_closed_are_replayed_on_relaunch() {
    if !in_temp_home(
        "hooks_fired_while_the_app_is_closed_are_replayed_on_relaunch",
        "PET_RESTART_CHILD_C",
    ) {
        return;
    }
    let home = home_dir();
    let queue = home.join(".agentpet/queue");

    let first_sessions = Arc::new(Mutex::new(SessionStore::new()));
    let first = launch(&first_sessions);
    fire_hook("before-quit");
    assert!(wait_for(&first_sessions, "before-quit"), "live hook never arrived");
    first.stop();

    // The agent keeps working after the app is gone. Those events used to vanish.
    fire_hook("while-closed-a");
    fire_hook("while-closed-b");
    let spooled = std::fs::read_dir(&queue).map(|d| d.count()).unwrap_or(0);
    assert!(spooled >= 2, "dispatcher spooled {spooled} events while the app was closed");

    let second_sessions = Arc::new(Mutex::new(SessionStore::new()));
    let second = launch(&second_sessions);
    for id in ["while-closed-a", "while-closed-b"] {
        assert!(
            second_sessions.lock().unwrap().get(id).is_some(),
            "relaunch did not replay {id}"
        );
    }
    let status = second.status();
    assert!(status.is_listening);
    assert_eq!(status.events_replayed, 2);
    assert_eq!(status.queued_events, 0, "the spool must be drained, not re-read forever");

    // Replayed work feeds the pet the same way live work does.
    let care = PetCareStore::new(home.join("care.json"));
    assert!(care.load().total_tokens > 0, "replayed events fed no tokens");

    fire_hook("after-relaunch");
    assert!(wait_for(&second_sessions, "after-relaunch"), "live hook broke after relaunch");
    second.stop();
}

#[test]
fn a_failed_bind_is_reported_instead_of_silently_disabling_the_bridge() {
    if !in_temp_home(
        "a_failed_bind_is_reported_instead_of_silently_disabling_the_bridge",
        "PET_RESTART_CHILD_D",
    ) {
        return;
    }
    let home = home_dir();
    let primary = home.join(".agentpet/agentpet.sock");
    let mirror = home.join(".rust-sound/pet.sock");
    std::fs::create_dir_all(primary.parent().unwrap()).unwrap();
    std::fs::create_dir_all(mirror.parent().unwrap()).unwrap();

    // Both paths held by live listeners this app does not own.
    let _held_primary = std::os::unix::net::UnixListener::bind(&primary).unwrap();
    let _held_mirror = std::os::unix::net::UnixListener::bind(&mirror).unwrap();

    let server = AgentPetServer::new(AgentPetServer::default_socket_path());
    let care = Arc::new(Mutex::new(PetCareStore::new(home.join("care.json"))));
    let started = server.start(Arc::new(Mutex::new(SessionStore::new())), care);
    assert!(started.is_err(), "bind should fail when both paths are taken");

    let status = server.status();
    assert!(!status.is_listening);
    assert!(
        status.last_error.is_some(),
        "a bridge that never bound must say so instead of reporting Connected"
    );
}
