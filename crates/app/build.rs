fn main() {
    // Only the public Client ID is embedded. OAuth tokens stay in macOS Keychain.
    println!("cargo:rerun-if-changed=../../.env");
    println!("cargo:rerun-if-env-changed=SPOTIFY_CLIENT_ID");
    let dotenv = std::fs::read_to_string("../../.env").unwrap_or_default();
    let client_id = std::env::var("SPOTIFY_CLIENT_ID")
        .ok()
        .or_else(|| {
            dotenv.lines().find_map(|line| {
                let (key, value) = line.split_once('=')?;
                (key.trim() == "SPOTIFY_CLIENT_ID")
                    .then(|| value.trim().trim_matches(['\"', '\'']).to_owned())
            })
        })
        .unwrap_or_default();
    assert!(
        client_id.is_empty()
            || (client_id.len() == 32 && client_id.bytes().all(|c| c.is_ascii_hexdigit())),
        "Invalid SPOTIFY_CLIENT_ID"
    );
    println!("cargo:rustc-env=SPOTIFY_CLIENT_ID={client_id}");
    // Public backend origin only. Never read or embed server credentials here.
    println!("cargo:rerun-if-env-changed=RUST_SOUND_AUTH_URL");
    let auth_url = std::env::var("RUST_SOUND_AUTH_URL").unwrap_or_default();
    let auth_host = auth_url.strip_prefix("https://").or_else(|| {
        auth_url.strip_prefix("http://").filter(|host| host.trim_end_matches('/').split(':').next() == Some("127.0.0.1"))
    });
    assert!(auth_url.is_empty() || (auth_url.len() <= 2048 && auth_host.is_some_and(|host| {
        let host = host.trim_end_matches('/');
        !host.is_empty() && host.bytes().all(|c| c.is_ascii_alphanumeric() || b".-:".contains(&c))
    })), "Invalid public auth URL");
    println!("cargo:rustc-env=RUST_SOUND_AUTH_URL={auth_url}");
    tauri_build::build()
}
