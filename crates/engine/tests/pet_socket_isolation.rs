use sound_engine::{AgentPetServer, HookManager, PetCareStore, SessionStore};
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::{Arc, Mutex};

#[test]
fn preserves_existing_socket_and_isolates_default_path() {
    let dir = std::path::Path::new("/tmp").join(format!("pet-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&dir).unwrap();
    let path = dir.join("pet.sock");
    let original = UnixListener::bind(&path).unwrap();
    let server = AgentPetServer::new(&path);
    let result = server.start(
        Arc::new(Mutex::new(SessionStore::new())),
        Arc::new(Mutex::new(PetCareStore::new(dir.join("care.json")))),
    );
    let rejected = result.is_err();
    server.stop();
    let preserved = UnixStream::connect(&path).is_ok();
    drop(original);
    std::fs::remove_dir_all(dir).unwrap();
    assert!(rejected, "must not replace an existing socket");
    assert!(
        preserved,
        "failed start/stop must not remove another listener"
    );
    assert!(HookManager::config_path_for("pi").unwrap().ends_with("rust-sound-pet.ts"));
    assert!(
        !AgentPetServer::default_socket_path()
            .to_string_lossy()
            .contains(".agentpet/")
    );
}
