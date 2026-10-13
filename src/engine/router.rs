use crate::engine::eq::ParametricEQ;
use crate::engine::preset::AppAudioSettings;
use std::collections::HashMap;

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
}

impl AudioRouter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            channels: HashMap::new(),
            sample_rate,
        }
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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
