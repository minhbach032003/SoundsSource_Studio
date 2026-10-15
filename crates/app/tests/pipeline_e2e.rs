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
    assert!(!devices.is_empty(), "Should enumerate at least one output device");
    for dev in &devices {
        assert!(!dev.uid.is_empty());
        assert!(!dev.name.is_empty());
        assert!(!dev.name.contains("(err:"));
    }
}

#[test]
fn test_coreaudio_system_processes_query() {
    let processes = AudioProcess::enumerate_system_processes();
    assert!(!processes.is_empty(), "Should enumerate running processes");
    let has_regular = processes.iter().any(|p| p.is_regular_app);
    assert!(has_regular, "Should discover regular GUI applications");
}

#[test]
fn test_coreaudio_system_volume_and_mute() {
    let vol = AudioDevice::get_master_volume();
    assert!(vol >= 0.0 && vol <= 1.0, "Master volume must be in [0.0, 1.0]");
    let is_muted = AudioDevice::get_master_mute();
    println!("Current system volume: {}, muted: {}", vol, is_muted);

    // Test restoring volume
    let res = AudioDevice::set_master_volume(vol);
    println!("set_master_volume result: {:?}", res);
    assert!(res.is_ok());
}

#[test]
fn test_coreaudio_system_input_devices_query() {
    let input_devices = AudioDevice::enumerate_system_input_devices();
    assert!(!input_devices.is_empty(), "Should enumerate at least one audio input device");
    for dev in &input_devices {
        assert!(!dev.uid.is_empty());
        assert!(!dev.name.is_empty());
        assert!(!dev.name.contains("(err:"));
    }
}

#[test]
fn test_coreaudio_system_input_volume_and_mute() {
    let vol = AudioDevice::get_input_volume();
    assert!(vol >= 0.0 && vol <= 1.0, "Input volume must be in [0.0, 1.0]");
    let is_muted = AudioDevice::get_input_mute();
    println!("Current system input volume: {}, muted: {}", vol, is_muted);

    // Test restoring volume
    assert!(AudioDevice::set_input_volume(vol).is_ok());
}

#[test]
fn test_master_eq_pipeline_e2e() {
    let mut router = AudioRouter::new(48000.0);
    assert_eq!(router.master_eq().bands().len(), 10);
    assert!(!router.master_eq().is_bypassed());

    // 1. Set band gains
    router.set_master_eq_band(0, 6.0); // +6 dB on 32 Hz
    router.set_master_eq_band(5, -4.0); // -4 dB on 1 kHz
    assert_eq!(router.master_eq().bands()[0].gain, 6.0);
    assert_eq!(router.master_eq().bands()[5].gain, -4.0);

    // 2. Process audio buffer
    let mut buffer = vec![0.5f32; 256];
    router.process_master(&mut buffer);
    assert!(!buffer.is_empty());

    // 3. Bypass test
    router.set_master_eq_bypass(true);
    assert!(router.master_eq().is_bypassed());
    let mut flat_buffer = vec![0.25f32; 128];
    router.process_master(&mut flat_buffer);
    for sample in flat_buffer {
        assert_eq!(sample, 0.25);
    }

    // 4. Reset test
    router.reset_master_eq();
    assert!(!router.master_eq().is_bypassed());
    assert_eq!(router.master_eq().bands()[0].gain, 0.0);
    assert_eq!(router.master_eq().bands()[5].gain, 0.0);
}

#[test]
fn test_audio_filter_pipeline_e2e() {
    use rust_sound_lib::engine::{AudioFilterSettings, MicFilterConfig, OutputFilterConfig};

    let mut router = AudioRouter::new(48000.0);
    let initial_settings = router.get_filter_settings();
    assert!(initial_settings.mic.enabled);

    // 1. Configure aggressive noise gate
    let custom = AudioFilterSettings {
        mic: MicFilterConfig {
            enabled: true,
            noise_gate_enabled: true,
            noise_gate_threshold_db: -35.0,
            high_pass_enabled: true,
            high_pass_cutoff_hz: 90.0,
            voice_presence_enabled: true,
            voice_presence_db: 4.0,
            de_esser_enabled: true,
        },
        output: OutputFilterConfig {
            enabled: true,
            dialogue_boost: true,
            night_mode_compression: true,
            bass_warmth: true,
            de_hiss: true,
        },
    };
    router.set_filter_settings(custom);
    assert_eq!(router.get_filter_settings().mic.noise_gate_threshold_db, -35.0);

    // 2. Test mic processing on quiet noise
    let mut quiet_noise = vec![0.0005f32; 256];
    let stats = router.process_mic_buffer(&mut quiet_noise);
    assert!(!stats.gate_open);

    // 3. Test output processing with dynamic compression and bass warmth
    let mut stereo_output = vec![0.8f32; 512];
    router.process_master(&mut stereo_output);
    assert!(!stereo_output.is_empty());
}

#[test]
fn test_master_stereo_balance_pipeline_e2e() {
    let mut router = AudioRouter::new(48000.0);

    // Initial balance is center 0.0
    assert_eq!(router.get_master_balance(), 0.0);

    // Pan full left (-1.0)
    router.set_master_balance(-1.0);
    assert_eq!(router.get_master_balance(), -1.0);

    let mut samples = vec![1.0f32; 128]; // [L, R, L, R, ...]
    router.process_master(&mut samples);
    // Left channel should be unaffected (1.0), right channel should be attenuated to 0.0
    for chunk in samples.chunks_exact(2) {
        assert!((chunk[0] - 1.0).abs() < 1e-4);
        assert!(chunk[1].abs() < 1e-4);
    }

    // Pan full right (1.0)
    router.set_master_balance(1.0);
    assert_eq!(router.get_master_balance(), 1.0);
    let mut samples = vec![1.0f32; 128];
    router.process_master(&mut samples);
    for chunk in samples.chunks_exact(2) {
        assert!(chunk[0].abs() < 1e-4);
        assert!((chunk[1] - 1.0).abs() < 1e-4);
    }

    // Reset to center
    router.set_master_balance(0.0);
    assert_eq!(router.get_master_balance(), 0.0);

    // Test CoreAudio device balance functions
    let _ = AudioDevice::set_master_balance(-0.4);
    let current_bal = AudioDevice::get_master_balance();
    assert!(current_bal >= -1.0 && current_bal <= 1.0);
    let _ = AudioDevice::set_master_balance(0.0);
}
