//! The native IOProc test was never executed by any runner; this runs it.
#![cfg(target_os = "macos")]

#[test]
fn native_ioproc_downmixes_and_guards_buffers_without_devices() {
    let out = std::env::temp_dir().join("rust_sound_spotify_io_test");
    let build = std::process::Command::new("clang")
        .args(["-fobjc-arc", "-framework", "Foundation", "-framework", "CoreAudio", "-o"])
        .arg(&out)
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/spotify_io.m"))
        .output()
        .expect("clang must be available on macOS");
    assert!(build.status.success(), "compile failed:\n{}", String::from_utf8_lossy(&build.stderr));
    let run = std::process::Command::new(&out).output().expect("test binary must run");
    assert!(run.status.success(), "native IOProc assertions failed:\n{}{}",
        String::from_utf8_lossy(&run.stdout), String::from_utf8_lossy(&run.stderr));
}
