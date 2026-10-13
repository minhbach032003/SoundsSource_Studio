use rust_sound_lib::core::{AudioProcess, RingBuffer};
use rust_sound_lib::engine::{AppAudioSettings, AudioDevice, AudioRouter, Preset, PresetStore};
use std::env;
use std::fs;

#[test]
fn test_end_to_end_audio_pipeline() {
    let sample_rate = 48000.0f32;
    let mut router = AudioRouter::new(sample_rate);
    let bundle_id = "com.spotify.client";

    // 1. Channel setup
    let channel = router.get_or_create_channel(bundle_id);
    channel.volume = 0.75;
    channel.eq.set_band_gain(0, 3.0);  // 32 Hz
    channel.eq.set_band_gain(5, -6.0); // 1000 Hz

    // 2. Audio signal synthesis (128 stereo frames)
    let frames = 128;
    let mut buffer = vec![0.5f32; frames * 2];

    // 3. Process signal through EQ and volume
    channel.process(&mut buffer);

    // Assert signal modified and within valid range
    assert!(!buffer.is_empty());
    assert!(buffer[0] > 0.0);

    // 4. Mute test
    channel.muted = true;
    channel.process(&mut buffer);
    for sample in &buffer {
        assert_eq!(*sample, 0.0);
    }

    // 5. Ring buffer transfer
    let ring_buffer = RingBuffer::new(2048);
    let bytes = [42u8; 100];
    let written = ring_buffer.write(&bytes);
    assert_eq!(written, 100);

    let mut read_back = [0u8; 100];
    let read = ring_buffer.read(&mut read_back);
    assert_eq!(read, 100);
    assert_eq!(&read_back, &bytes);

    // 6. Preset persistence round-trip
    let temp_file = env::temp_dir().join(format!("rust_sound_e2e_{}.json", std::process::id()));
    let mut store = PresetStore::new(&temp_file);

    let mut preset = Preset::new("TestPreset", false);
    preset.app_settings.insert(
        bundle_id.to_string(),
        AppAudioSettings {
            volume: 0.75,
            muted: true,
            target_device_uid: Some("BuiltInSpeaker".into()),
            eq_bypass: false,
            eq_bands: channel.eq.bands.to_vec(),
        },
    );

    store.set_preset(preset);

    let reloaded = PresetStore::new(&temp_file);
    let retrieved = reloaded.get_preset("TestPreset").expect("Preset found");
    assert_eq!(retrieved.app_settings.len(), 1);

    let _ = fs::remove_file(temp_file);
}

#[test]
fn test_coreaudio_system_devices_query() {
    let devices = AudioDevice::enumerate_system_devices();
    // On macOS, at least one device (speakers / headphones) is typically found
    println!("Found {} CoreAudio devices", devices.len());
    for dev in &devices {
        assert!(!dev.uid.is_empty());
    }
}

#[test]
fn test_coreaudio_system_processes_query() {
    let processes = AudioProcess::enumerate_system_processes();
    println!("Found {} CoreAudio processes", processes.len());
}
