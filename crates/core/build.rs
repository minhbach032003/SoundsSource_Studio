fn main() {
    println!("cargo:rerun-if-changed=src/spotify_tap.m");
    println!("cargo:rerun-if-changed=src/spotify_keychain.m");
    println!("cargo:rerun-if-changed=src/screen_capture.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/spotify_tap.m")
            .file("src/spotify_keychain.m")
            .file("src/screen_capture.m")
            .flag("-fobjc-arc")
            .compile("spotify_tap");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-lib=framework=Security");
        // Capturing and JPEG-encoding the display in-process.
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=ImageIO");
    }
}
