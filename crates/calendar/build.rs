fn main() {
    println!("cargo:rerun-if-changed=../../.env");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");
    let dotenv = std::fs::read_to_string("../../.env").unwrap_or_default();
    let from_env = |key: &str| {
        std::env::var(key).ok().or_else(|| {
            dotenv.lines().find_map(|line| {
                let (name, value) = line.split_once('=')?;
                (name.trim() == key).then(|| value.trim().trim_matches(['\"', '\'']).to_owned())
            })
        })
    };
    let google_client_id = from_env("GOOGLE_CLIENT_ID").unwrap_or_default();
    println!("cargo:rustc-env=GOOGLE_CLIENT_ID={google_client_id}");
    let google_client_secret = from_env("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={google_client_secret}");
}
