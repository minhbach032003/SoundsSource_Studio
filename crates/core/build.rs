fn main() {
    println!("cargo:rerun-if-changed=src/spotify_tap.m");
    println!("cargo:rerun-if-changed=src/spotify_keychain.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new().file("src/spotify_tap.m").file("src/spotify_keychain.m").flag("-fobjc-arc").compile("spotify_tap");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-lib=framework=Security");
    }
}
