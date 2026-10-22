//! Bounded Spotify PCM history; analysis runs on the IPC thread, not the audio callback.
use serde::Serialize;
use std::time::{Duration, Instant};

/// Rates the DSP accepts. A Bluetooth headset in hands-free mode runs at 16 kHz,
/// so this must stay in one place: it has now been wrong in two copies twice.
pub const SUPPORTED_RATES: std::ops::RangeInclusive<f32> = 8000.0..=192000.0;

const SIZE: usize = 4096;
pub const BANDS: usize = 28;

#[derive(Clone, Serialize)]
pub struct SpectrumReading {
    pub heights: [f32; BANDS],
    pub receiving: bool,
    pub has_signal: bool,
}
impl Default for SpectrumReading {
    fn default() -> Self {
        Self {
            heights: [0.0; BANDS],
            receiving: false,
            has_signal: false,
        }
    }
}

#[derive(Clone)]
pub struct SpectrumBuffer {
    samples: [[f32; SIZE]; 2],
    cursor: usize,
    rate: f32,
    updated: Option<Instant>,
    last_analysis: Option<(Instant, SpectrumReading)>,
}
impl Default for SpectrumBuffer {
    fn default() -> Self {
        Self {
            samples: [[0.0; SIZE]; 2],
            cursor: 0,
            rate: 48000.0,
            updated: None,
            last_analysis: None,
        }
    }
}
impl SpectrumBuffer {
    pub fn push_stereo(&mut self, samples: &[f32], rate: f32) {
        if samples.is_empty()
            || samples.len() % 2 != 0
            || samples.len() > 32768
            || !rate.is_finite()
            || !SUPPORTED_RATES.contains(&rate)
        {
            return;
        }
        if self.rate != rate {
            self.samples = [[0.0; SIZE]; 2];
            self.cursor = 0;
            self.rate = rate;
            self.last_analysis = None;
        }
        for pair in samples.chunks_exact(2) {
            for (channel, &sample) in self.samples.iter_mut().zip(pair) {
                channel[self.cursor] = if sample.is_finite() {
                    sample.clamp(-1.0, 1.0)
                } else {
                    0.0
                };
            }
            self.cursor = (self.cursor + 1) % SIZE;
        }
        self.updated = Some(Instant::now());
        self.last_analysis = None;
    }

    pub fn snapshot(&mut self) -> SpectrumReading {
        let now = Instant::now();
        if !self
            .updated
            .is_some_and(|at| at.elapsed() < Duration::from_millis(500))
        {
            return SpectrumReading::default();
        }
        // Giới hạn tần suất tính toán FFT nặng: nếu lần phân tích trước cách chưa tới 40ms (~25 FPS),
        // tái sử dụng kết quả đã cache thay vì chạy lại 2 lần FFT 4096-point Radix-2 trên CPU.
        if let Some((at, ref cached)) = self.last_analysis {
            if now.duration_since(at) < Duration::from_millis(40) {
                return cached.clone();
            }
        }
        let mut heights = [0.0_f32; BANDS];
        let mut peak = 0.0_f32;
        // Analyze channels independently: stereo phase must not cancel the spectrum.
        for channel in &self.samples {
            let mut real = [0.0_f32; SIZE];
            let mut imaginary = [0.0_f32; SIZE];
            for (i, value) in real.iter_mut().enumerate() {
                let sample = channel[(self.cursor + i) % SIZE];
                peak = peak.max(sample.abs());
                *value =
                    sample * (0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / SIZE as f32).cos());
            }
            // In-place radix-2 FFT. Fixed size; no allocation or analysis in the IOProc.
            for i in 0..SIZE {
                let reversed = i.reverse_bits() >> (usize::BITS - SIZE.trailing_zeros());
                if reversed > i {
                    real.swap(i, reversed);
                }
            }
            let mut width = 2;
            while width <= SIZE {
                let angle = -std::f32::consts::TAU / width as f32;
                let (sin, cos) = angle.sin_cos();
                for start in (0..SIZE).step_by(width) {
                    let (mut wr, mut wi) = (1.0, 0.0);
                    for offset in 0..width / 2 {
                        let a = start + offset;
                        let b = a + width / 2;
                        let tr = wr * real[b] - wi * imaginary[b];
                        let ti = wr * imaginary[b] + wi * real[b];
                        real[b] = real[a] - tr;
                        imaginary[b] = imaginary[a] - ti;
                        real[a] += tr;
                        imaginary[a] += ti;
                        (wr, wi) = (wr * cos - wi * sin, wr * sin + wi * cos);
                    }
                }
                width *= 2;
            }
            for bin in 1..SIZE / 2 {
                let hz = bin as f32 * self.rate / SIZE as f32;
                if !(20.0..=20000.0).contains(&hz) {
                    continue;
                }
                let band = ((hz / 20.0).ln() / 1000.0_f32.ln() * BANDS as f32) as usize;
                let amplitude = real[bin].hypot(imaginary[bin]) * 4.0 / SIZE as f32;
                let height =
                    ((20.0 * amplitude.max(1e-6).log10() + 60.0) / 60.0 * 100.0).clamp(0.0, 100.0);
                heights[band.min(BANDS - 1)] = heights[band.min(BANDS - 1)].max(height);
            }
        }
        let reading = SpectrumReading {
            heights,
            receiving: true,
            has_signal: peak > 0.001,
        };
        self.last_analysis = Some((now, reading.clone()));
        reading
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tone(buffer: &mut SpectrumBuffer, hz: f32, rate: f32) {
        let samples: Vec<f32> = (0..SIZE)
            .flat_map(|i| {
                let v = 0.25 * (std::f32::consts::TAU * hz * i as f32 / rate).sin();
                [v, v]
            })
            .collect();
        // Exercise fragmented native callbacks, not only whole analysis windows.
        for chunk in samples.chunks(512) {
            buffer.push_stereo(chunk, rate);
        }
    }
    #[test]
    fn spectrum_tracks_real_pcm_frequency_and_silence() {
        for rate in [16000.0, 44100.0, 48000.0, 96000.0] {
            let mut buffer = SpectrumBuffer::default();
            assert!(!buffer.snapshot().receiving);
            tone(&mut buffer, 1000.0, rate);
            let reading = buffer.snapshot();
            assert!(
                reading.receiving && reading.has_signal,
                "real Spotify PCM must activate spectrum"
            );
            let peak = reading
                .heights
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .unwrap()
                .0;
            assert!(
                (14..=16).contains(&peak),
                "1kHz should peak near the 1kHz label: {peak}"
            );
            assert!(reading.heights[peak] > 60.0);
            buffer.push_stereo(&vec![0.0; SIZE * 2], rate);
            let silent = buffer.snapshot();
            assert!(silent.receiving && !silent.has_signal);
            assert_eq!(silent.heights, [0.0; BANDS]);
        }
    }
    #[test]
    fn spectrum_preserves_both_stereo_channels_and_resets_rate() {
        let mut buffer = SpectrumBuffer::default();
        let stereo: Vec<f32> = (0..SIZE)
            .flat_map(|i| {
                [
                    0.25 * (std::f32::consts::TAU * 1000.0 * i as f32 / 48000.0).sin(),
                    0.25 * (std::f32::consts::TAU * 4000.0 * i as f32 / 48000.0).sin(),
                ]
            })
            .collect();
        buffer.push_stereo(&stereo, 48000.0);
        let reading = buffer.snapshot();
        assert!(reading.heights[15] > 60.0 && reading.heights[21] > 60.0);
        buffer.push_stereo(&[0.0, 0.0], 96000.0);
        assert_eq!(buffer.snapshot().heights, [0.0; BANDS]);
    }

    #[test]
    fn spectrum_rejects_invalid_and_stale_input() {
        let mut buffer = SpectrumBuffer::default();
        buffer.push_stereo(&[1.0], 48000.0);
        buffer.push_stereo(&[1.0, 1.0], f32::NAN);
        assert!(!buffer.snapshot().receiving);
        tone(&mut buffer, 64.0, 48000.0);
        assert!(buffer.snapshot().has_signal);
        buffer.updated = Some(Instant::now() - Duration::from_secs(1));
        assert!(!buffer.snapshot().receiving);
        assert_eq!(buffer.snapshot().heights, [0.0; BANDS]);
        buffer.push_stereo(&[f32::NAN, f32::INFINITY], 48000.0);
        assert!(
            buffer
                .snapshot()
                .heights
                .iter()
                .all(|v| v.is_finite() && (0.0..=100.0).contains(v))
        );
    }
}
