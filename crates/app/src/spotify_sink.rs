use crate::spotify::process_spotify_frame;
use crate::AudioRouter;
use librespot_playback::audio_backend::{Sink as LibrespotSink, SinkError, SinkResult};
use librespot_playback::convert::Converter;
use librespot_playback::decoder::AudioPacket;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Source};
use sound_engine::pcm_queue::PcmQueue;
use sound_engine::spectrum::SpectrumBuffer;
use std::num::NonZero;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub fn write_packet(
    router: &Mutex<AudioRouter>,
    spectrum: &Mutex<SpectrumBuffer>,
    queue: &PcmQueue,
    samples: &[f64],
) -> usize {
    if samples.is_empty() {
        return 0;
    }
    let mut buf: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
    process_spotify_frame(router, spectrum, &mut buf, 44100.0, true);
    queue.push(&buf)
}

struct QueueSource {
    queue: Arc<PcmQueue>,
}

impl Iterator for QueueSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        let mut sample = [0.0f32; 1];
        self.queue.pop(&mut sample);
        Some(sample[0])
    }
}

impl Source for QueueSource {
    #[inline]
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    #[inline]
    fn channels(&self) -> NonZero<u16> {
        NonZero::new(2).unwrap()
    }

    #[inline]
    fn sample_rate(&self) -> NonZero<u32> {
        NonZero::new(44100).unwrap()
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

pub struct RustSoundSink {
    router: Arc<Mutex<AudioRouter>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
    queue: Arc<PcmQueue>,
    _output_sink: MixerDeviceSink,
}

impl RustSoundSink {
    pub fn new(
        router: Arc<Mutex<AudioRouter>>,
        spectrum: Arc<Mutex<SpectrumBuffer>>,
    ) -> Result<Self, String> {
        let queue = Arc::new(PcmQueue::new(16384));
        let output_sink = DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("Không thể mở thiết bị âm thanh đầu ra: {e}"))?;

        let source = QueueSource {
            queue: queue.clone(),
        };
        output_sink.mixer().add(source);

        Ok(Self {
            router,
            spectrum,
            queue,
            _output_sink: output_sink,
        })
    }
}

impl LibrespotSink for RustSoundSink {
    fn start(&mut self) -> SinkResult<()> {
        Ok(())
    }

    fn stop(&mut self) -> SinkResult<()> {
        self.queue.clear();
        Ok(())
    }

    fn write(&mut self, packet: AudioPacket, _converter: &mut Converter) -> SinkResult<()> {
        match packet {
            AudioPacket::Samples(samples) => {
                write_packet(&self.router, &self.spectrum, &self.queue, &samples);
                Ok(())
            }
            AudioPacket::Raw(_) => Err(SinkError::InvalidParams(
                "Định dạng RAW không được hỗ trợ".into(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sink_runs_audio_through_the_eq_and_pads_underrun() {
        let router = Arc::new(Mutex::new(AudioRouter::new(44100.0)));
        let spectrum: Arc<Mutex<SpectrumBuffer>> = Default::default();
        let queue = PcmQueue::new(8192);
        let tone: Vec<f64> = (0..4096)
            .flat_map(|i| {
                let v = 0.05 * (std::f64::consts::TAU * 64.0 * i as f64 / 44100.0).sin();
                [v, v]
            })
            .collect();

        router.lock().unwrap().set_master_eq_band(1, 6.0);
        let written = write_packet(&router, &spectrum, &queue, &tone);
        assert_eq!(written, tone.len());
        let mut out = vec![0.0f32; tone.len()];
        queue.pop(&mut out);
        let energy = |s: &[f32]| s[4096..].iter().map(|v| v * v).sum::<f32>();
        let flat: Vec<f32> = tone.iter().map(|v| *v as f32).collect();
        assert!(
            energy(&out) > energy(&flat) * 3.0,
            "bass +6 dB phải nghe được ở đầu ra"
        );

        let mut starved = vec![9.9f32; 64];
        assert_eq!(queue.pop(&mut starved), 0);
        assert_eq!(starved, vec![0.0; 64], "hết dữ liệu phải ra im lặng");
    }
}
