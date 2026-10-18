fn main() {
    // Spotify's Client ID and Client Secret are embedded. OAuth tokens stay in macOS
    // Keychain. The secret ships inside the bundle and anyone with the app can read it
    // out, which is why Spotify recommends PKCE for desktop clients; this build uses the
    // confidential flow at the owner's explicit request.
    println!("cargo:rerun-if-changed=../../.env");
    println!("cargo:rerun-if-env-changed=SPOTIFY_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=SPOTIFY_CLIENT_SECRET");
    let dotenv = std::fs::read_to_string("../../.env").unwrap_or_default();
    let from_env = |key: &str| {
        std::env::var(key).ok().or_else(|| {
            dotenv.lines().find_map(|line| {
                let (name, value) = line.split_once('=')?;
                (name.trim() == key).then(|| value.trim().trim_matches(['\"', '\'']).to_owned())
            })
        })
    };
    let hex32 = |value: &str| value.len() == 32 && value.bytes().all(|c| c.is_ascii_hexdigit());
    let client_id = from_env("SPOTIFY_CLIENT_ID").unwrap_or_default();
    assert!(
        client_id.is_empty() || hex32(&client_id),
        "Invalid SPOTIFY_CLIENT_ID"
    );
    println!("cargo:rustc-env=SPOTIFY_CLIENT_ID={client_id}");
    let client_secret = from_env("SPOTIFY_CLIENT_SECRET").unwrap_or_default();
    assert!(
        client_secret.is_empty() || hex32(&client_secret),
        "Invalid SPOTIFY_CLIENT_SECRET"
    );
    println!("cargo:rustc-env=SPOTIFY_CLIENT_SECRET={client_secret}");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");
    let google_client_id = from_env("GOOGLE_CLIENT_ID").unwrap_or_default();
    println!("cargo:rustc-env=GOOGLE_CLIENT_ID={google_client_id}");
    let google_client_secret = from_env("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={google_client_secret}");
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
