use rust_sound::core::{AudioProcess, RingBuffer};
use rust_sound::engine::{AudioRouter, PresetStore, DEFAULT_EQ_FREQUENCIES};
use std::path::PathBuf;

fn main() {
    println!("==================================================");
    println!("  rust-sound (Per-App Audio Control for macOS)     ");
    println!("  Rewritten in Rust from voice-macos (Sonoma 14.2+)");
    println!("==================================================\n");

    // 1. Initialize Preset Store
    let config_dir = dirs_fallback().join("rust-sound");
    let preset_file = config_dir.join("presets.json");
    println!("[1] Initializing PresetStore at: {:?}", preset_file);
    let store = PresetStore::new(&preset_file);
    println!("    Active presets count: {}", store.presets().len());
    for p in store.presets() {
        println!("    - Preset: '{}' (default: {})", p.name, p.is_default);
    }

    // 2. Process Normalization Demo
    println!("\n[2] Process Normalization Demo:");
    let sample_processes = vec![
        ("com.google.Chrome.helper", "Google Chrome Helper", 1024),
        ("com.spotify.client", "Spotify", 2048),
        ("com.discordapp.Discord.renderer", "Discord Helper", 3072),
    ];
    for (bundle, name, pid) in sample_processes {
        let proc = AudioProcess::new(pid as u32, pid, bundle, name, true, true);
        println!(
            "    PID {}: raw '{}' -> normalized '{}'",
            proc.pid, bundle, proc.bundle_id
        );
    }

    // 3. Audio Pipeline & EQ Check
    println!("\n[3] Audio Pipeline & 10-Band EQ Engine:");
    let mut router = AudioRouter::new(48000.0);
    let ch = router.get_or_create_channel("com.spotify.client");
    ch.volume = 0.8;
    ch.eq.set_band_gain(0, 3.0); // Boost 32 Hz bass +3dB
    println!("    Configured Spotify channel: vol=0.8, 32Hz=+3dB");
    println!("    Default EQ bands: {:?}", DEFAULT_EQ_FREQUENCIES);

    let mut audio_buffer = [0.5f32; 8];
    ch.process(&mut audio_buffer);
    println!("    Processed sample buffer: {:?}", &audio_buffer[..4]);

    // 4. Lock-free Ring Buffer Self-Check
    println!("\n[4] Lock-Free RingBuffer Real-Time Check:");
    let ring_buffer = RingBuffer::new(4096);
    let test_data = b"AUDIO_PCM_DATA_CH0_CH1";
    let written = ring_buffer.write(test_data);
    let mut read_buf = [0u8; 32];
    let read = ring_buffer.read(&mut read_buf);
    println!(
        "    RingBuffer write {} bytes, read {} bytes (available: {})",
        written,
        read,
        ring_buffer.bytes_available_for_read()
    );

    println!("\n[✓] rust-sound initialized successfully.");
}

fn dirs_fallback() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config")
    } else {
        PathBuf::from(".")
    }
}
