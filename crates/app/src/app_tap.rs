//! Opt-in application/system audio through one private CoreAudio aggregate.
//! The worker owns native resources until callbacks stop; each stream owns DSP history.

use crate::{AppAudioChannel, AudioRouter, ParametricEQ};
use serde::Serialize;
use sound_engine::spectrum::{SpectrumBuffer, SpectrumReading, SUPPORTED_RATES};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Default, Serialize)]
pub struct AppTapStatus {
    pub bundle_id: String,
    pub system_wide: bool,
    pub running: bool,
    pub frames: u64,
    pub error: Option<String>,
}

struct Processor {
    router: Arc<Mutex<AudioRouter>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
    channel: Option<AppAudioChannel>,
    master_eq: ParametricEQ,
}

impl Processor {
    fn new(
        router: Arc<Mutex<AudioRouter>>,
        spectrum: Arc<Mutex<SpectrumBuffer>>,
        bundle: Option<String>,
    ) -> Self {
        Self {
            router,
            spectrum,
            channel: bundle.map(|id| AppAudioChannel::new(id, 48000.0)),
            master_eq: ParametricEQ::new(48000.0),
        }
    }

    fn process(&mut self, samples: &mut [f32], rate: f32) {
        if let Ok(router) = self.router.try_lock() {
            sync_eq(&mut self.master_eq, router.master_eq(), rate);
            if let Some(channel) = &mut self.channel {
                if let Some(settings) = router.channels().get(&channel.bundle_id) {
                    channel.volume = settings.volume;
                    channel.muted = settings.muted;
                    sync_eq(&mut channel.eq, &settings.eq, rate);
                }
            }
        }
        // Sanitize before filtering so one invalid sample cannot poison its history.
        for sample in samples.iter_mut() {
            if !sample.is_finite() {
                *sample = 0.0;
            }
        }
        if let Some(channel) = &mut self.channel {
            channel.process(samples);
        }
        self.master_eq.process_interleaved_stereo(samples);
        for sample in samples.iter_mut() {
            *sample = sound_engine::soft_clip(*sample);
        }
        if let Ok(mut spectrum) = self.spectrum.try_lock() {
            spectrum.push_stereo(samples, rate);
        }
    }
}

fn sync_eq(target: &mut ParametricEQ, source: &ParametricEQ, rate: f32) {
    if target.sample_rate != rate {
        *target = ParametricEQ::new(rate);
    }
    if target.bands != source.bands {
        target.bands = source.bands;
        target.recalculate_all();
    }
    target.set_master_bypass(source.is_bypassed());
}

unsafe extern "C" fn process_audio(
    context: *mut std::ffi::c_void,
    samples: *mut f32,
    count: u32,
    rate: f64,
) {
    if context.is_null()
        || samples.is_null()
        || count == 0
        || count > 32768
        || count % 2 != 0
        || !rate.is_finite()
        || !SUPPORTED_RATES.contains(&(rate as f32))
    {
        return;
    }
    // CoreAudio invokes this IOProc serially; its worker keeps the box alive until Stop.
    let processor = unsafe { &mut *context.cast::<Processor>() };
    let samples = unsafe { std::slice::from_raw_parts_mut(samples, count as usize) };
    processor.process(samples, rate as f32);
}

pub struct AppTap {
    /// Serialize native routing commands, including the separately owned Spotify tap.
    pub(crate) routing: Arc<Mutex<()>>,
    status: Arc<Mutex<AppTapStatus>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Default for AppTap {
    fn default() -> Self {
        Self::new()
    }
}

impl AppTap {
    pub fn new() -> Self {
        Self {
            routing: Arc::new(Mutex::new(())),
            status: Default::default(),
            spectrum: Default::default(),
            stop: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }

    pub fn status(&self) -> AppTapStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn spectrum(&self) -> SpectrumReading {
        if !self.status().running {
            return SpectrumReading::default();
        }
        self.spectrum
            .try_lock()
            .map(|mut buffer| buffer.snapshot())
            .unwrap_or_default()
    }

    fn stop_worker(&self, worker: &mut Option<std::thread::JoinHandle<()>>) {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = worker.take() {
            let _ = handle.join();
        }
        *self.status.lock().unwrap() = AppTapStatus::default();
        *self.spectrum.lock().unwrap() = SpectrumBuffer::default();
    }

    pub fn stop(&self) {
        self.stop_worker(&mut self.worker.lock().unwrap());
    }

    pub fn start(
        &self,
        bundle_id: String,
        object_ids: Vec<u32>,
        router: Arc<Mutex<AudioRouter>>,
    ) -> Result<(), String> {
        if object_ids.is_empty() {
            return Err("Ứng dụng này chưa phát tiếng. Bật nhạc hoặc video rồi thử lại.".into());
        }
        router.lock().unwrap().get_or_create_channel(&bundle_id);
        self.start_capture(Some(bundle_id), object_ids, router)
    }

    pub fn start_system(&self, router: Arc<Mutex<AudioRouter>>) -> Result<(), String> {
        self.start_capture(None, Vec::new(), router)
    }

    #[cfg(target_os = "macos")]
    fn start_capture(
        &self,
        bundle: Option<String>,
        object_ids: Vec<u32>,
        router: Arc<Mutex<AudioRouter>>,
    ) -> Result<(), String> {
        let mut worker = self.worker.lock().unwrap();
        self.stop_worker(&mut worker);
        self.stop.store(false, Ordering::Release);
        let system_wide = bundle.is_none();
        *self.status.lock().unwrap() = AppTapStatus {
            bundle_id: bundle.clone().unwrap_or_default(),
            system_wide,
            ..Default::default()
        };
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let status = self.status.clone();
        let stop = self.stop.clone();
        let spectrum = self.spectrum.clone();
        *worker = Some(std::thread::spawn(move || {
            let mut context = Box::new(Processor::new(router, spectrum, bundle));
            let pointer = (&mut *context as *mut Processor).cast();
            let open = || unsafe {
                if system_wide {
                    sound_core::spotify::SpotifyTap::start_system(process_audio, pointer)
                } else {
                    sound_core::spotify::SpotifyTap::start(&object_ids, process_audio, pointer)
                }
            };
            let mut output = sound_core::spotify::default_output();
            let mut tap = match open() {
                Ok(tap) => tap,
                Err(error) => {
                    status.lock().unwrap().error = Some(error.clone());
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            // A timed-out activation must not become a late, unowned capture.
            if stop.load(Ordering::Acquire) {
                return;
            }
            status.lock().unwrap().running = true;
            let _ = ready_tx.send(Ok(()));
            let mut previous = 0;
            let mut stalled = 0;
            while !stop.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(100));
                let next_output = sound_core::spotify::default_output();
                if next_output != output {
                    drop(tap);
                    status.lock().unwrap().running = false;
                    if stop.load(Ordering::Acquire) {
                        return;
                    }
                    tap = match open() {
                        Ok(tap) => tap,
                        Err(error) => {
                            status.lock().unwrap().error = Some(error);
                            return;
                        }
                    };
                    output = next_output;
                    previous = 0;
                    stalled = 0;
                    status.lock().unwrap().running = true;
                }
                let frames = tap.frames();
                stalled = if frames > previous { 0 } else { stalled + 1 };
                previous = frames;
                status.lock().unwrap().frames = frames;
                if stalled >= 30 {
                    status.lock().unwrap().error = Some(
                        "Không nhận được tiếng. Đã trả âm thanh về đường phát thường; kiểm tra thiết bị đầu ra rồi bật lại System audio.".into()
                    );
                    break;
                }
            }
            drop(tap); // AudioDeviceStop completes before context is freed.
            status.lock().unwrap().running = false;
        }));
        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(result) => result,
            Err(_) => {
                self.stop.store(true, Ordering::Release);
                let error =
                    "Hết thời gian chờ CoreAudio mở đường âm thanh. Thử bật lại System audio."
                        .to_string();
                self.status.lock().unwrap().error = Some(error.clone());
                // Retain the cancelled worker so stop/restart/drop must join it.
                Err(error)
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn start_capture(
        &self,
        _bundle: Option<String>,
        _object_ids: Vec<u32>,
        _router: Arc<Mutex<AudioRouter>>,
    ) -> Result<(), String> {
        Err("Chỉ hỗ trợ trên macOS.".into())
    }
}

impl Drop for AppTap {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_silent_app_is_refused_before_touching_coreaudio() {
        let tap = AppTap::new();
        let error = tap
            .start(
                "com.brave.Browser".into(),
                Vec::new(),
                Arc::new(Mutex::new(AudioRouter::new(48000.0))),
            )
            .unwrap_err();
        assert!(error.contains("chưa phát tiếng"), "{error}");
        assert!(!tap.status().running);
    }

    #[test]
    fn external_stream_does_not_inherit_embedded_eq_history() {
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        router.lock().unwrap().set_master_eq_band(1, 6.0);
        let mut local = [0.1f32, 0.1];
        crate::spotify::process_spotify_frame(
            &router,
            &Mutex::default(),
            &mut local,
            48000.0,
            true,
        );
        let mut processor = Processor::new(router, Default::default(), None);
        let mut silence = [0.0f32; 128];
        unsafe {
            process_audio(
                (&mut processor as *mut Processor).cast(),
                silence.as_mut_ptr(),
                silence.len() as u32,
                48000.0,
            );
        }
        assert_eq!(
            silence, [0.0; 128],
            "independent external audio must not contain the embedded player's EQ tail"
        );
    }

    #[test]
    fn external_callback_applies_bass_once_and_bypass_is_transparent() {
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        let spectrum = Arc::new(Mutex::new(SpectrumBuffer::default()));
        let mut processor = Processor::new(router.clone(), spectrum.clone(), None);
        let tone: Vec<f32> = (0..8192)
            .flat_map(|i| {
                let sample = 0.05 * (std::f32::consts::TAU * 64.0 * i as f32 / 48000.0).sin();
                [sample, sample]
            })
            .collect();
        router.lock().unwrap().set_master_eq_band(1, 6.0);
        let mut boosted = tone.clone();
        unsafe {
            process_audio(
                (&mut processor as *mut Processor).cast(),
                boosted.as_mut_ptr(),
                boosted.len() as u32,
                48000.0,
            );
        }
        let energy = |samples: &[f32]| samples[8192..].iter().map(|v| v * v).sum::<f32>();
        let gain = energy(&boosted) / energy(&tone);
        assert!(
            (3.8..4.2).contains(&gain),
            "6 dB must apply once, got energy ratio {gain}"
        );
        assert!(spectrum.lock().unwrap().snapshot().has_signal);
        router.lock().unwrap().set_master_eq_bypass(true);
        let mut bypassed = tone.clone();
        unsafe {
            process_audio(
                (&mut processor as *mut Processor).cast(),
                bypassed.as_mut_ptr(),
                bypassed.len() as u32,
                48000.0,
            );
        }
        assert_eq!(bypassed, tone);
        assert_eq!(router.lock().unwrap().master_eq().sample_rate, 48000.0);
        processor.process(&mut [0.0; 128], 44100.0);
        assert_eq!(
            router.lock().unwrap().master_eq().sample_rate,
            48000.0,
            "external rate must not reconfigure embedded DSP"
        );
    }

    #[test]
    fn external_callback_rejects_invalid_buffers_and_recovers_from_nan() {
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        router.lock().unwrap().set_master_eq_band(1, 6.0);
        let mut processor = Processor::new(router, Default::default(), None);
        let pointer = (&mut processor as *mut Processor).cast();
        let mut odd = [0.25f32; 3];
        unsafe {
            process_audio(pointer, odd.as_mut_ptr(), 3, 48000.0);
            process_audio(pointer, odd.as_mut_ptr(), 2, f64::NAN);
            process_audio(pointer, odd.as_mut_ptr(), 2, 0.0);
            process_audio(pointer, std::ptr::null_mut(), 2, 48000.0);
        }
        assert_eq!(odd, [0.25; 3]);
        let mut invalid = [f32::NAN, f32::INFINITY];
        unsafe {
            process_audio(pointer, invalid.as_mut_ptr(), 2, 48000.0);
        }
        assert_eq!(invalid, [0.0; 2]);
        let mut valid = [0.1f32; 128];
        unsafe {
            process_audio(pointer, valid.as_mut_ptr(), 128, 48000.0);
        }
        assert!(valid.iter().all(|v| v.is_finite() && v.abs() < 1.0));
    }

    #[test]
    fn stop_joins_the_owned_worker_and_clears_status() {
        let tap = AppTap::new();
        tap.status.lock().unwrap().running = true;
        let stopped = Arc::new(AtomicBool::new(false));
        let signal = stopped.clone();
        let stop = tap.stop.clone();
        *tap.worker.lock().unwrap() = Some(std::thread::spawn(move || {
            while !stop.load(Ordering::Acquire) {
                std::thread::yield_now();
            }
            signal.store(true, Ordering::Release);
        }));
        tap.stop();
        assert!(stopped.load(Ordering::Acquire));
        assert!(tap.worker.lock().unwrap().is_none());
        assert!(!tap.status().running);
        assert!(!tap.spectrum().has_signal);
    }

    #[test]
    fn master_spectrum_reports_external_pcm_errors_and_stop() {
        let tap = AppTap::new();
        let spotify = crate::spotify::SpotifyIntegration::default();
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        let mut processor = Processor::new(router, tap.spectrum.clone(), None);
        let mut tone: Vec<f32> = (0..4096)
            .flat_map(|i| {
                let value = 0.1 * (std::f32::consts::TAU * 1000.0 * i as f32 / 48000.0).sin();
                [value, value]
            })
            .collect();
        processor.process(&mut tone, 48000.0);
        *tap.status.lock().unwrap() = AppTapStatus {
            system_wide: true,
            running: true,
            ..Default::default()
        };
        let live = crate::cmd_audio::master_spectrum(&spotify, &tap);
        assert_eq!(live.source, "system");
        assert!(live.system_audio_enabled && live.spectrum.reading.has_signal);
        *tap.status.lock().unwrap() = AppTapStatus {
            bundle_id: "com.google.Chrome".into(),
            running: true,
            ..Default::default()
        };
        let application = crate::cmd_audio::master_spectrum(&spotify, &tap);
        assert_eq!(application.source, "application");
        assert!(!application.system_audio_enabled && application.spectrum.reading.has_signal);
        {
            let mut status = tap.status.lock().unwrap();
            status.running = false;
            status.error = Some("Capture unavailable".into());
        }
        let failed = crate::cmd_audio::master_spectrum(&spotify, &tap);
        assert!(!failed.spectrum.reading.has_signal);
        assert_eq!(
            failed.spectrum.error.as_deref(),
            Some("Capture unavailable")
        );
        tap.stop();
        let stopped = crate::cmd_audio::master_spectrum(&spotify, &tap);
        assert_eq!(stopped.source, "spotify");
        assert!(!stopped.system_audio_enabled && !stopped.spectrum.reading.has_signal);
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires a quiet 64 Hz external test tone and macOS audio-capture consent"]
    fn native_system_capture_preserves_signal_and_bypass() {
        let tap = AppTap::new();
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        let output = sound_core::spotify::default_output();
        tap.start_system(router.clone()).expect("native system capture");
        for (gain, bypass) in [(0.0, false), (6.0, false), (3.5, false), (3.5, true)] {
            let previous = tap.status().frames;
            {
                let mut settings = router.lock().unwrap();
                settings.set_master_eq_band(1, gain);
                settings.set_master_eq_bypass(bypass);
            }
            let deadline = std::time::Instant::now() + Duration::from_secs(2);
            loop {
                let status = tap.status();
                assert!(status.running && status.error.is_none(), "native route stopped on EQ edit");
                assert!(status.frames >= previous, "native route restarted on EQ edit");
                if status.frames >= previous + 8192 && tap.spectrum().has_signal { break; }
                assert!(std::time::Instant::now() < deadline, "PCM stopped on EQ edit");
                std::thread::sleep(Duration::from_millis(20));
            }
            assert_eq!(output, sound_core::spotify::default_output());
        }
        tap.stop();
        assert!(!tap.status().running && !tap.spectrum().receiving);
        eprintln!("native AppTap: flat, Bass, fader and bypass preserve active route and advancing PCM; stop clears route");
    }

    #[test]
    fn a_fresh_tap_reports_nothing_running() {
        let status = AppTap::new().status();
        assert!(!status.running);
        assert!(!status.system_wide);
        assert_eq!(status.bundle_id, "");
        assert_eq!(status.frames, 0);
    }
}
