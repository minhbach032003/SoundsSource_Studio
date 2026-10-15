use crate::eq::ParametricEQ;
use crate::filter::{AudioFilterEngine, AudioFilterSettings, FilterProcessingStats};
use crate::preset::AppAudioSettings;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelStateDto {
    pub volume: f32,
    pub muted: bool,
    pub target_device_uid: Option<String>,
}

pub struct AppAudioChannel {
    pub bundle_id: String,
    pub volume: f32,
    pub muted: bool,
    pub target_device_uid: Option<String>,
    pub eq: ParametricEQ,
}

impl AppAudioChannel {
    pub fn new(bundle_id: impl Into<String>, sample_rate: f32) -> Self {
        Self {
            bundle_id: bundle_id.into(),
            volume: 1.0,
            muted: false,
            target_device_uid: None,
            eq: ParametricEQ::new(sample_rate),
        }
    }

    /// Process in-place interleaved stereo audio buffer
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.muted {
            for sample in samples.iter_mut() {
                *sample = 0.0;
            }
            return;
        }

        // Apply 10-band EQ
        self.eq.process_interleaved_stereo(samples);

        // Apply volume gain
        if (self.volume - 1.0).abs() > 1e-4 {
            for sample in samples.iter_mut() {
                *sample *= self.volume;
            }
        }
    }

    pub fn apply_settings(&mut self, settings: &AppAudioSettings) {
        self.volume = settings.volume;
        self.muted = settings.muted;
        self.target_device_uid = settings.target_device_uid.clone();
        self.eq.set_master_bypass(settings.eq_bypass);
        for (i, band) in settings.eq_bands.iter().enumerate().take(10) {
            self.eq.set_band_gain(i, band.gain);
            self.eq.set_band_bypass(i, band.bypass);
        }
    }
}

pub struct AudioRouter {
    channels: HashMap<String, AppAudioChannel>,
    sample_rate: f32,
    pub master_eq: ParametricEQ,
    pub filter_engine: AudioFilterEngine,
    pub master_balance: f32,
}

impl AudioRouter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            channels: HashMap::new(),
            sample_rate,
            master_eq: ParametricEQ::new(sample_rate),
            filter_engine: AudioFilterEngine::new(sample_rate),
            master_balance: 0.0,
        }
    }

    pub fn get_master_balance(&self) -> f32 {
        self.master_balance
    }

    pub fn set_master_balance(&mut self, balance: f32) {
        self.master_balance = balance.clamp(-1.0, 1.0);
    }

    /// Calculate Left and Right channel gains for a given balance value in [-1.0, 1.0]
    pub fn compute_channel_gains(balance: f32) -> (f32, f32) {
        let b = balance.clamp(-1.0, 1.0);
        let left_gain = if b > 0.0 { 1.0 - b } else { 1.0 };
        let right_gain = if b < 0.0 { 1.0 + b } else { 1.0 };
        (left_gain, right_gain)
    }

    /// Apply stereo balance in-place to interleaved stereo samples [L, R, L, R, ...]
    pub fn apply_stereo_balance(samples: &mut [f32], balance: f32) {
        let (left_gain, right_gain) = Self::compute_channel_gains(balance);
        if (left_gain - 1.0).abs() < 1e-4 && (right_gain - 1.0).abs() < 1e-4 {
            return;
        }

        for chunk in samples.chunks_exact_mut(2) {
            chunk[0] *= left_gain;
            chunk[1] *= right_gain;
        }
    }

    pub fn filter_engine(&self) -> &AudioFilterEngine {
        &self.filter_engine
    }

    pub fn filter_engine_mut(&mut self) -> &mut AudioFilterEngine {
        &mut self.filter_engine
    }

    pub fn get_filter_settings(&self) -> AudioFilterSettings {
        self.filter_engine.settings
    }

    pub fn set_filter_settings(&mut self, settings: AudioFilterSettings) {
        self.filter_engine.update_settings(settings);
    }

    pub fn process_mic_buffer(&mut self, samples: &mut [f32]) -> FilterProcessingStats {
        self.filter_engine.process_mic(samples)
    }

    pub fn master_eq(&self) -> &ParametricEQ {
        &self.master_eq
    }

    pub fn master_eq_mut(&mut self) -> &mut ParametricEQ {
        &mut self.master_eq
    }

    pub fn set_master_eq_band(&mut self, band_index: usize, gain_db: f32) {
        self.master_eq.set_band_gain(band_index, gain_db);
    }

    pub fn reset_master_eq(&mut self) {
        for i in 0..10 {
            self.master_eq.set_band_gain(i, 0.0);
            self.master_eq.set_band_bypass(i, false);
        }
        self.master_eq.set_master_bypass(false);
    }

    pub fn set_master_eq_bypass(&mut self, bypass: bool) {
        self.master_eq.set_master_bypass(bypass);
    }

    pub fn process_master(&mut self, samples: &mut [f32]) {
        self.master_eq.process_interleaved_stereo(samples);
        self.filter_engine.process_output_interleaved_stereo(samples);
        Self::apply_stereo_balance(samples, self.master_balance);
    }

    pub fn get_or_create_channel(&mut self, bundle_id: &str) -> &mut AppAudioChannel {
        self.channels
            .entry(bundle_id.to_string())
            .or_insert_with(|| AppAudioChannel::new(bundle_id, self.sample_rate))
    }

    pub fn set_app_volume(&mut self, bundle_id: &str, volume: f32) {
        let ch = self.get_or_create_channel(bundle_id);
        ch.volume = volume.max(0.0);
    }

    pub fn set_app_mute(&mut self, bundle_id: &str, muted: bool) {
        let ch = self.get_or_create_channel(bundle_id);
        ch.muted = muted;
    }

    pub fn set_app_route(&mut self, bundle_id: &str, device_uid: Option<String>) {
        let ch = self.get_or_create_channel(bundle_id);
        ch.target_device_uid = device_uid;
    }

    pub fn channels(&self) -> &HashMap<String, AppAudioChannel> {
        &self.channels
    }

    pub fn get_channel_states(&self) -> HashMap<String, ChannelStateDto> {
        self.channels
            .iter()
            .map(|(bundle_id, ch)| {
                (
                    bundle_id.clone(),
                    ChannelStateDto {
                        volume: ch.volume,
                        muted: ch.muted,
                        target_device_uid: ch.target_device_uid.clone(),
                    },
                )
            })
            .collect()
    }

    /// Snapshot active channel volumes and scale down by duck_factor (e.g. 0.15)
    pub fn duck_all(&mut self, duck_factor: f32) -> HashMap<String, f32> {
        let mut snapshot = HashMap::new();
        for (bundle_id, channel) in self.channels.iter_mut() {
            snapshot.insert(bundle_id.clone(), channel.volume);
            channel.volume = (channel.volume * duck_factor).max(0.0);
        }
        snapshot
    }

    /// Restore channels to their pre-duck volume snapshot
    pub fn restore_volumes(&mut self, snapshot: &HashMap<String, f32>) {
        for (bundle_id, &orig_volume) in snapshot.iter() {
            if let Some(channel) = self.channels.get_mut(bundle_id) {
                channel.volume = orig_volume;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stereo_balance_gains_and_processing() {
        assert_eq!(AudioRouter::compute_channel_gains(0.0), (1.0, 1.0));
        assert_eq!(AudioRouter::compute_channel_gains(-1.0), (1.0, 0.0));
        assert_eq!(AudioRouter::compute_channel_gains(1.0), (0.0, 1.0));
        assert_eq!(AudioRouter::compute_channel_gains(-0.5), (1.0, 0.5));
        assert_eq!(AudioRouter::compute_channel_gains(0.5), (0.5, 1.0));

        let mut samples = [1.0f32, 1.0, 1.0, 1.0];
        AudioRouter::apply_stereo_balance(&mut samples, -0.5);
        assert!((samples[0] - 1.0).abs() < 1e-4);
        assert!((samples[1] - 0.5).abs() < 1e-4);
        assert!((samples[2] - 1.0).abs() < 1e-4);
        assert!((samples[3] - 0.5).abs() < 1e-4);
    }

    #[test]
    fn test_audio_router_mute_and_volume() {
        let mut router = AudioRouter::new(48000.0);
        let ch = router.get_or_create_channel("com.apple.Music");

        let mut buffer = [1.0f32, 1.0, 1.0, 1.0];
        ch.volume = 0.5;
        ch.process(&mut buffer);

        for val in buffer.iter() {
            assert!((val - 0.5).abs() < 1e-4);
        }

        ch.muted = true;
        ch.process(&mut buffer);
        for val in buffer.iter() {
            assert_eq!(*val, 0.0);
        }
    }

    #[test]
    fn test_audio_router_duck_and_restore() {
        let mut router = AudioRouter::new(48000.0);
        router.set_app_volume("com.spotify.client", 0.8);
        router.set_app_volume("com.brave.Browser", 0.6);

        let snapshot = router.duck_all(0.2);
        assert_eq!(snapshot.get("com.spotify.client"), Some(&0.8));
        assert_eq!(snapshot.get("com.brave.Browser"), Some(&0.6));

        let ch_spotify = router.get_or_create_channel("com.spotify.client");
        assert!((ch_spotify.volume - 0.16).abs() < 1e-4);

        router.restore_volumes(&snapshot);
        let ch_spotify_restored = router.get_or_create_channel("com.spotify.client");
        assert!((ch_spotify_restored.volume - 0.8).abs() < 1e-4);
    }

    #[test]
    fn test_audio_router_master_eq() {
        let mut router = AudioRouter::new(48000.0);
        assert!(!router.master_eq().is_bypassed());
        assert_eq!(router.master_eq().bands()[0].gain, 0.0);

        router.set_master_eq_band(0, 6.0);
        assert_eq!(router.master_eq().bands()[0].gain, 6.0);

        router.set_master_eq_bypass(true);
        assert!(router.master_eq().is_bypassed());

        router.reset_master_eq();
        assert!(!router.master_eq().is_bypassed());
        assert_eq!(router.master_eq().bands()[0].gain, 0.0);
    }
}
