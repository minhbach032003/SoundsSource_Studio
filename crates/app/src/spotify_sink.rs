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
use std::time::{Duration, Instant};

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
    // librespot giải mã nhanh hơn thời gian thực và trông đợi sink chặn lại cho tới khi
    // dữ liệu được tiêu thụ. Đẩy rồi trả về ngay sẽ vứt gần hết bài hát và loa chỉ phát
    // ra vụn âm thanh. Bỏ cuộc sau vài giây để lúc dừng phát không bị treo.
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut written = 0;
    while written < buf.len() {
        let n = queue.push(&buf[written..]);
        written += n;
        if written < buf.len() {
            if Instant::now() >= deadline {
                break;
            }
            // Tăng thời gian nghỉ từ 2ms lên 8ms để giảm CPU wakeups / spinloop dồn dập
            std::thread::sleep(Duration::from_millis(8));
        }
    }
    written
}

/// Rút theo khối: rodio lấy từng mẫu một, mà mỗi lần đọc hàng đợi tốn hơn nhiều một
/// phép sao chép trong bộ nhớ.
const PULL_CHUNK_SAMPLES: usize = 512;

struct QueueSource {
    queue: Arc<PcmQueue>,
    buffer: Box<[f32; PULL_CHUNK_SAMPLES]>,
    cursor: usize,
}

impl QueueSource {
    fn new(queue: Arc<PcmQueue>) -> Self {
        Self {
            queue,
            buffer: Box::new([0.0; PULL_CHUNK_SAMPLES]),
            cursor: PULL_CHUNK_SAMPLES,
        }
    }
}

impl Iterator for QueueSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if self.cursor >= PULL_CHUNK_SAMPLES {
            // pop lấp phần thiếu bằng im lặng, nên khối luôn đầy và hai kênh không lệch.
            self.queue.pop(self.buffer.as_mut_slice());
            self.cursor = 0;
        }
        let sample = self.buffer[self.cursor];
        self.cursor += 1;
        Some(sample)
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
        // Tăng dung lượng hàng đợi lên 65536 frames (~1.5s stereo buffer) để hấp thụ các đợt giải mã burst
        // của librespot và ngăn ngừa tình trạng thread starvation/sleep thrashing gây đơ hệ điều hành.
        let queue = Arc::new(PcmQueue::new(65536));
        let output_sink = DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("Không thể mở thiết bị âm thanh đầu ra: {e}"))?;

        let source = QueueSource::new(queue.clone());
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

    #[test]
    fn a_full_queue_makes_the_decoder_wait_instead_of_dropping_audio() {
        let router = Arc::new(Mutex::new(AudioRouter::new(44100.0)));
        let spectrum: Arc<Mutex<SpectrumBuffer>> = Default::default();
        // Hàng đợi nhỏ hơn hẳn một gói: librespot giải mã nhanh hơn thời gian thực, nên
        // nếu ghi không chờ thì phần dư bị vứt và loa chỉ nhận được vụn âm thanh.
        let queue = Arc::new(PcmQueue::new(64));
        let packet: Vec<f64> = (0..4096).map(|i| ((i % 100) as f64 / 100.0) - 0.5).collect();

        let drain = {
            let queue = queue.clone();
            std::thread::spawn(move || {
                let mut drained = 0;
                let mut out = vec![0.0f32; 128];
                while drained < 4096 {
                    drained += queue.pop(&mut out);
                    std::thread::sleep(Duration::from_millis(1));
                }
                drained
            })
        };

        let written = write_packet(&router, &spectrum, &queue, &packet);
        assert_eq!(written, packet.len(), "phải ghi hết gói, không được bỏ mẫu");
        assert_eq!(drain.join().unwrap(), 4096);
    }
}
