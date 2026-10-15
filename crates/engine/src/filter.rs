use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

/// Microphone Voice Isolation & Noise Suppression Configuration
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MicFilterConfig {
    pub enabled: bool,
    pub noise_gate_enabled: bool,
    pub noise_gate_threshold_db: f32, // -60.0 to -20.0 dB
    pub high_pass_enabled: bool,
    pub high_pass_cutoff_hz: f32, // 60.0 to 180.0 Hz
    pub voice_presence_enabled: bool,
    pub voice_presence_db: f32, // 0.0 to 6.0 dB
    pub de_esser_enabled: bool,
}

impl Default for MicFilterConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            noise_gate_enabled: true,
            noise_gate_threshold_db: -42.0,
            high_pass_enabled: true,
            high_pass_cutoff_hz: 85.0,
            voice_presence_enabled: true,
            voice_presence_db: 3.5,
            de_esser_enabled: true,
        }
    }
}

/// Output Audio Stream Enhancement Configuration
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OutputFilterConfig {
    pub enabled: bool,
    pub dialogue_boost: bool,
    pub night_mode_compression: bool,
    pub bass_warmth: bool,
    pub de_hiss: bool,
}

impl Default for OutputFilterConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            dialogue_boost: false,
            night_mode_compression: false,
            bass_warmth: false,
            de_hiss: false,
        }
    }
}

/// Combined Audio Filter Settings Payload
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct AudioFilterSettings {
    pub mic: MicFilterConfig,
    pub output: OutputFilterConfig,
}

/// Statistics reported from filtering a buffer
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct FilterProcessingStats {
    pub gate_open: bool,
    pub input_peak_db: f32,
    pub output_peak_db: f32,
    pub attenuation_db: f32,
}

/// 2nd Order Butterworth High-Pass Filter
#[derive(Debug, Clone, Copy)]
pub struct HighPassBiquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl HighPassBiquad {
    pub fn new(cutoff_hz: f32, sample_rate: f32) -> Self {
        let omega = 2.0 * PI * cutoff_hz.clamp(20.0, 500.0) / sample_rate;
        let sn = omega.sin();
        let cs = omega.cos();
        let q = 0.7071f32; // Butterworth Q
        let alpha = sn / (2.0 * q);

        let a0 = 1.0 + alpha;
        let inv_a0 = 1.0 / a0;

        let b0 = ((1.0 + cs) / 2.0) * inv_a0;
        let b1 = (-(1.0 + cs)) * inv_a0;
        let b2 = ((1.0 + cs) / 2.0) * inv_a0;
        let a1 = (-2.0 * cs) * inv_a0;
        let a2 = (1.0 - alpha) * inv_a0;

        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

/// Peaking presence biquad for vocal clarity boost
#[derive(Debug, Clone, Copy)]
pub struct PeakingBiquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl PeakingBiquad {
    pub fn new(freq: f32, gain_db: f32, q: f32, sample_rate: f32) -> Self {
        if gain_db.abs() < 1e-3 {
            return Self {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
                x1: 0.0,
                x2: 0.0,
                y1: 0.0,
                y2: 0.0,
            };
        }

        let a = 10.0f32.powf(gain_db / 40.0);
        let omega = 2.0 * PI * freq / sample_rate;
        let sn = omega.sin();
        let cs = omega.cos();
        let alpha = sn / (2.0 * q);

        let a0 = 1.0 + alpha / a;
        let inv_a0 = 1.0 / a0;

        Self {
            b0: (1.0 + alpha * a) * inv_a0,
            b1: (-2.0 * cs) * inv_a0,
            b2: (1.0 - alpha * a) * inv_a0,
            a1: (-2.0 * cs) * inv_a0,
            a2: (1.0 - alpha / a) * inv_a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

/// Adaptive Real-Time Noise Gate
#[derive(Debug, Clone)]
pub struct NoiseGate {
    _sample_rate: f32,
    envelope: f32,
    current_gain: f32,
    is_open: bool,
    attack_coeff: f32,
    release_coeff: f32,
}

impl NoiseGate {
    pub fn new(sample_rate: f32) -> Self {
        let attack_ms = 2.0f32; // 2ms quick attack
        let release_ms = 85.0f32; // 85ms natural release
        let attack_coeff = (-1.0 / (sample_rate * (attack_ms / 1000.0))).exp();
        let release_coeff = (-1.0 / (sample_rate * (release_ms / 1000.0))).exp();

        Self {
            _sample_rate: sample_rate,
            envelope: 0.0,
            current_gain: 0.0,
            is_open: false,
            attack_coeff,
            release_coeff,
        }
    }

    pub fn process_sample(&mut self, input: f32, threshold_db: f32) -> (f32, bool) {
        let abs_val = input.abs();
        // Envelope tracking
        let env_coeff = if abs_val > self.envelope {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.envelope = env_coeff * self.envelope + (1.0 - env_coeff) * abs_val;

        let threshold_linear = 10.0f32.powf(threshold_db / 20.0);
        let open_threshold = threshold_linear;
        let close_threshold = threshold_linear * 0.70; // 3dB hysteresis

        if self.is_open {
            if self.envelope < close_threshold {
                self.is_open = false;
            }
        } else if self.envelope > open_threshold {
            self.is_open = true;
        }

        let target_gain = if self.is_open { 1.0f32 } else { 0.0f32 };
        let gain_coeff = if target_gain > self.current_gain {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.current_gain = gain_coeff * self.current_gain + (1.0 - gain_coeff) * target_gain;

        (input * self.current_gain, self.is_open)
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn current_gain(&self) -> f32 {
        self.current_gain
    }
}

/// Dynamic Range Peak Limiter & Night Mode Compressor
#[derive(Debug, Clone)]
pub struct DynamicLimiter {
    attack_coeff: f32,
    release_coeff: f32,
    envelope: f32,
}

impl DynamicLimiter {
    pub fn new(sample_rate: f32) -> Self {
        let attack_ms = 2.0f32; // 2ms fast attack
        let release_ms = 60.0f32; // 60ms release
        let attack_coeff = (-1.0 / (sample_rate * (attack_ms / 1000.0))).exp();
        let release_coeff = (-1.0 / (sample_rate * (release_ms / 1000.0))).exp();

        Self {
            attack_coeff,
            release_coeff,
            envelope: 0.0,
        }
    }

    pub fn process_sample(&mut self, input: f32, threshold_db: f32, ratio: f32) -> f32 {
        let abs_val = input.abs();
        let coeff = if abs_val > self.envelope {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.envelope = coeff * self.envelope + (1.0 - coeff) * abs_val;

        let env_db = 20.0 * (self.envelope.max(1e-5)).log10();
        if env_db > threshold_db {
            let over_db = env_db - threshold_db;
            let compressed_over = over_db / ratio.max(1.0);
            let gain_db = (threshold_db + compressed_over) - env_db;
            let gain_linear = 10.0f32.powf(gain_db / 20.0);
            input * gain_linear
        } else {
            input
        }
    }
}

/// Complete Real-Time Audio Filter & Voice Isolation Engine
pub struct AudioFilterEngine {
    pub sample_rate: f32,
    pub settings: AudioFilterSettings,

    // Microphone Voice Isolation Pipeline
    mic_gate: NoiseGate,
    mic_high_pass: HighPassBiquad,
    mic_presence: PeakingBiquad,
    mic_de_esser: PeakingBiquad,

    // Master Output Enhancement Pipeline
    out_dialogue_boost_l: PeakingBiquad,
    out_dialogue_boost_r: PeakingBiquad,
    out_bass_warmth_l: PeakingBiquad,
    out_bass_warmth_r: PeakingBiquad,
    out_de_hiss_l: PeakingBiquad,
    out_de_hiss_r: PeakingBiquad,
    out_limiter_l: DynamicLimiter,
    out_limiter_r: DynamicLimiter,
}

impl AudioFilterEngine {
    pub fn new(sample_rate: f32) -> Self {
        let settings = AudioFilterSettings::default();

        let mic_gate = NoiseGate::new(sample_rate);
        let mic_high_pass = HighPassBiquad::new(settings.mic.high_pass_cutoff_hz, sample_rate);
        let mic_presence = PeakingBiquad::new(2800.0, settings.mic.voice_presence_db, 1.2, sample_rate);
        let mic_de_esser = PeakingBiquad::new(7200.0, -3.0, 1.8, sample_rate);

        let out_dialogue_boost_l = PeakingBiquad::new(3000.0, 3.5, 1.1, sample_rate);
        let out_dialogue_boost_r = PeakingBiquad::new(3000.0, 3.5, 1.1, sample_rate);

        let out_bass_warmth_l = PeakingBiquad::new(90.0, 3.2, 0.8, sample_rate);
        let out_bass_warmth_r = PeakingBiquad::new(90.0, 3.2, 0.8, sample_rate);

        let out_de_hiss_l = PeakingBiquad::new(11000.0, -4.0, 0.7, sample_rate);
        let out_de_hiss_r = PeakingBiquad::new(11000.0, -4.0, 0.7, sample_rate);

        let out_limiter_l = DynamicLimiter::new(sample_rate);
        let out_limiter_r = DynamicLimiter::new(sample_rate);

        Self {
            sample_rate,
            settings,
            mic_gate,
            mic_high_pass,
            mic_presence,
            mic_de_esser,
            out_dialogue_boost_l,
            out_dialogue_boost_r,
            out_bass_warmth_l,
            out_bass_warmth_r,
            out_de_hiss_l,
            out_de_hiss_r,
            out_limiter_l,
            out_limiter_r,
        }
    }

    pub fn update_settings(&mut self, next: AudioFilterSettings) {
        self.settings = next;
        self.mic_high_pass = HighPassBiquad::new(self.settings.mic.high_pass_cutoff_hz, self.sample_rate);
        self.mic_presence = PeakingBiquad::new(2800.0, self.settings.mic.voice_presence_db, 1.2, self.sample_rate);
    }

    /// Process microphone mono or interleaved input audio buffer
    pub fn process_mic(&mut self, samples: &mut [f32]) -> FilterProcessingStats {
        if !self.settings.mic.enabled {
            let max_val = samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
            let peak_db = if max_val > 1e-5 { 20.0 * max_val.log10() } else { -90.0 };
            return FilterProcessingStats {
                gate_open: true,
                input_peak_db: peak_db,
                output_peak_db: peak_db,
                attenuation_db: 0.0,
            };
        }

        let mut in_max = 0.0f32;
        let mut out_max = 0.0f32;
        let mut last_gate_open = false;

        for sample in samples.iter_mut() {
            let original = *sample;
            in_max = in_max.max(original.abs());

            let mut s = original;

            // 1. Rumble removal High-Pass Filter
            if self.settings.mic.high_pass_enabled {
                s = self.mic_high_pass.process_sample(s);
            }

            // 2. Vocal presence boost
            if self.settings.mic.voice_presence_enabled {
                s = self.mic_presence.process_sample(s);
            }

            // 3. De-Esser sibilance smoothing
            if self.settings.mic.de_esser_enabled {
                s = self.mic_de_esser.process_sample(s);
            }

            // 4. Adaptive Noise Gate
            if self.settings.mic.noise_gate_enabled {
                let (gated, open) = self.mic_gate.process_sample(s, self.settings.mic.noise_gate_threshold_db);
                s = gated;
                last_gate_open = open;
            } else {
                last_gate_open = true;
            }

            *sample = s;
            out_max = out_max.max(s.abs());
        }

        let in_db = if in_max > 1e-5 { 20.0 * in_max.log10() } else { -90.0 };
        let out_db = if out_max > 1e-5 { 20.0 * out_max.log10() } else { -90.0 };
        let attenuation_db = (in_db - out_db).max(0.0);

        FilterProcessingStats {
            gate_open: last_gate_open,
            input_peak_db: in_db,
            output_peak_db: out_db,
            attenuation_db,
        }
    }

    /// Process interleaved stereo master output buffer
    pub fn process_output_interleaved_stereo(&mut self, samples: &mut [f32]) {
        if !self.settings.output.enabled {
            return;
        }

        for chunk in samples.chunks_exact_mut(2) {
            let mut left = chunk[0];
            let mut right = chunk[1];

            // 1. Dialogue Boost
            if self.settings.output.dialogue_boost {
                left = self.out_dialogue_boost_l.process_sample(left);
                right = self.out_dialogue_boost_r.process_sample(right);
            }

            // 2. Bass Warmth
            if self.settings.output.bass_warmth {
                left = self.out_bass_warmth_l.process_sample(left);
                right = self.out_bass_warmth_r.process_sample(right);
            }

            // 3. De-Hiss
            if self.settings.output.de_hiss {
                left = self.out_de_hiss_l.process_sample(left);
                right = self.out_de_hiss_r.process_sample(right);
            }

            // 4. Night Mode Compression
            if self.settings.output.night_mode_compression {
                left = self.out_limiter_l.process_sample(left, -13.0, 3.5);
                right = self.out_limiter_r.process_sample(right, -13.0, 3.5);
            }

            chunk[0] = left;
            chunk[1] = right;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noise_gate_attenuation_below_threshold() {
        let mut gate = NoiseGate::new(48000.0);
        // Feed quiet noise at -60dB (approx 0.001) with threshold -40dB
        let quiet_sample = 0.001;
        let mut last_gain = 1.0;
        for _ in 0..1000 {
            let (_, is_open) = gate.process_sample(quiet_sample, -40.0);
            assert!(!is_open, "Gate should remain closed on quiet noise");
            last_gain = gate.current_gain();
        }
        assert!(last_gain < 0.01, "Gate gain should attenuate quiet noise towards zero");
    }

    #[test]
    fn test_noise_gate_opens_on_speech() {
        let mut gate = NoiseGate::new(48000.0);
        // Feed loud speech sample at -10dB (0.316)
        let speech_sample = 0.316;
        let mut open_seen = false;
        for _ in 0..500 {
            let (_, is_open) = gate.process_sample(speech_sample, -40.0);
            if is_open {
                open_seen = true;
            }
        }
        assert!(open_seen, "Gate should open when speech exceeds threshold");
        assert!(gate.current_gain() > 0.9, "Gate gain should be close to unity during speech");
    }

    #[test]
    fn test_high_pass_filter_attenuates_low_frequencies() {
        let mut hp = HighPassBiquad::new(100.0, 48000.0);
        // Generate 30Hz sine wave (sub-bass rumble) vs 1000Hz (speech)
        let mut max_low_out = 0.0f32;

        for i in 0..4800 {
            let t = i as f32 / 48000.0;
            let low_in = (2.0 * PI * 30.0 * t).sin();
            let low_out = hp.process_sample(low_in);
            if i > 2400 {
                max_low_out = max_low_out.max(low_out.abs());
            }
        }
        assert!(max_low_out < 0.65, "30Hz rumble must be attenuated by 100Hz HPF (got {max_low_out})");

        let mut hp_high = HighPassBiquad::new(100.0, 48000.0);
        let mut max_high_out = 0.0f32;
        for i in 0..4800 {
            let t = i as f32 / 48000.0;
            let high_in = (2.0 * PI * 1000.0 * t).sin();
            let high_out = hp_high.process_sample(high_in);
            if i > 2400 {
                max_high_out = max_high_out.max(high_out.abs());
            }
        }
        assert!(max_high_out > 0.95, "1000Hz speech frequency must pass through unattenuated (got {max_high_out})");
    }

    #[test]
    fn test_filter_engine_mic_pipeline() {
        let mut engine = AudioFilterEngine::new(48000.0);
        let mut buffer = vec![0.0005f32; 512]; // Quiet background noise
        let stats = engine.process_mic(&mut buffer);

        assert!(!stats.gate_open);
        assert!(stats.output_peak_db <= stats.input_peak_db);
    }

    #[test]
    fn test_dynamic_limiter_compresses_loud_spikes() {
        let mut limiter = DynamicLimiter::new(48000.0);
        // Loud input at +6dB (2.0 amplitude) with threshold at 0dB (1.0)
        let mut out = 0.0;
        for _ in 0..2000 {
            out = limiter.process_sample(2.0, 0.0, 4.0);
        }
        assert!(out < 1.35, "Limiter must compress samples exceeding threshold (got {out})");
    }
}
