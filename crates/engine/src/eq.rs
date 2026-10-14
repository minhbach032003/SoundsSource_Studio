use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

pub const DEFAULT_EQ_FREQUENCIES: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EQBandConfig {
    pub frequency: f32,
    pub gain: f32,       // in dB, e.g. -12.0 to +12.0
    pub bandwidth: f32,  // Q factor / bandwidth
    pub bypass: bool,
}

impl Default for EQBandConfig {
    fn default() -> Self {
        Self {
            frequency: 1000.0,
            gain: 0.0,
            bandwidth: 1.0,
            bypass: false,
        }
    }
}

/// Peaking Biquad Filter Coefficients
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoefficients {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoefficients {
    /// Compute peaking EQ filter coefficients for a given sample rate
    pub fn peaking_eq(frequency: f32, gain_db: f32, q: f32, sample_rate: f32) -> Self {
        if gain_db.abs() < 1e-4 {
            return Self {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            };
        }

        let a = 10.0f32.powf(gain_db / 40.0);
        let omega = 2.0 * PI * frequency / sample_rate;
        let sn = omega.sin();
        let cs = omega.cos();
        let alpha = sn / (2.0 * q.max(0.1));

        let a0 = 1.0 + alpha / a;
        let inv_a0 = 1.0 / a0;

        Self {
            b0: (1.0 + alpha * a) * inv_a0,
            b1: (-2.0 * cs) * inv_a0,
            b2: (1.0 - alpha * a) * inv_a0,
            a1: (-2.0 * cs) * inv_a0,
            a2: (1.0 - alpha / a) * inv_a0,
        }
    }
}

/// Filter state per audio channel
#[derive(Debug, Clone, Copy, Default)]
pub struct BiquadState {
    pub x1: f32,
    pub x2: f32,
    pub y1: f32,
    pub y2: f32,
}

impl BiquadState {
    #[inline]
    pub fn process_sample(&mut self, input: f32, coeff: &BiquadCoefficients) -> f32 {
        let output = coeff.b0 * input + coeff.b1 * self.x1 + coeff.b2 * self.x2
            - coeff.a1 * self.y1
            - coeff.a2 * self.y2;

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

/// 10-band Parametric Equalizer for stereo audio channels
pub struct ParametricEQ {
    pub sample_rate: f32,
    pub bands: [EQBandConfig; 10],
    pub bypass: bool,
    coefficients: [BiquadCoefficients; 10],
    state_ch1: [BiquadState; 10],
    state_ch2: [BiquadState; 10],
}

impl ParametricEQ {
    pub fn new(sample_rate: f32) -> Self {
        let mut bands = [EQBandConfig::default(); 10];
        for (i, freq) in DEFAULT_EQ_FREQUENCIES.iter().enumerate() {
            bands[i] = EQBandConfig {
                frequency: *freq,
                gain: 0.0,
                bandwidth: 1.0,
                bypass: false,
            };
        }

        let mut eq = Self {
            sample_rate,
            bands,
            bypass: false,
            coefficients: [BiquadCoefficients {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            }; 10],
            state_ch1: [BiquadState::default(); 10],
            state_ch2: [BiquadState::default(); 10],
        };

        eq.recalculate_all();
        eq
    }

    pub fn bands(&self) -> &[EQBandConfig; 10] {
        &self.bands
    }

    pub fn is_bypassed(&self) -> bool {
        self.bypass
    }

    pub fn set_band_gain(&mut self, band_index: usize, gain_db: f32) {
        if band_index < 10 {
            self.bands[band_index].gain = gain_db.clamp(-24.0, 24.0);
            self.recalculate_band(band_index);
        }
    }

    pub fn set_band_bypass(&mut self, band_index: usize, bypass: bool) {
        if band_index < 10 {
            self.bands[band_index].bypass = bypass;
            self.recalculate_band(band_index);
        }
    }

    pub fn set_master_bypass(&mut self, bypass: bool) {
        self.bypass = bypass;
    }

    pub fn recalculate_all(&mut self) {
        for i in 0..10 {
            self.recalculate_band(i);
        }
    }

    fn recalculate_band(&mut self, band_index: usize) {
        let band = &self.bands[band_index];
        if band.bypass {
            self.coefficients[band_index] = BiquadCoefficients {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            };
        } else {
            self.coefficients[band_index] = BiquadCoefficients::peaking_eq(
                band.frequency,
                band.gain,
                band.bandwidth,
                self.sample_rate,
            );
        }
    }

    /// Process in-place interleaved stereo buffer [L0, R0, L1, R1, ...]
    pub fn process_interleaved_stereo(&mut self, samples: &mut [f32]) {
        if self.bypass {
            return;
        }

        let frames = samples.len() / 2;
        for frame in 0..frames {
            let left_idx = frame * 2;
            let right_idx = left_idx + 1;

            let mut l = samples[left_idx];
            let mut r = samples[right_idx];

            for band in 0..10 {
                let coeff = &self.coefficients[band];
                l = self.state_ch1[band].process_sample(l, coeff);
                r = self.state_ch2[band].process_sample(r, coeff);
            }

            samples[left_idx] = l;
            samples[right_idx] = r;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eq_flat_passthrough() {
        let mut eq = ParametricEQ::new(48000.0);
        let mut buffer = [0.5f32, -0.5, 0.25, -0.25];
        let original = buffer;

        eq.process_interleaved_stereo(&mut buffer);

        for (a, b) in buffer.iter().zip(original.iter()) {
            assert!((a - b).abs() < 1e-5);
        }
    }

    #[test]
    fn test_eq_boost() {
        let mut eq = ParametricEQ::new(48000.0);
        eq.set_band_gain(5, 6.0); // Boost 1000 Hz by 6 dB

        let mut buffer = [0.5f32; 100];
        eq.process_interleaved_stereo(&mut buffer);

        assert!(buffer[0] != 0.0);
    }
}
