//! Đưa tiếng của một ứng dụng bất kỳ qua rust-sound.
//!
//! macOS không có API chỉnh âm lượng riêng cho từng app, nên ngoài ba app tự viết
//! AppleScript (Spotify, Music, QuickTime) thì thanh trượt không làm được gì. Cách duy
//! nhất còn lại là tap tiến trình đó, tắt đường ra gốc, xử lý rồi tự phát lại — đúng
//! cơ chế Spotify đang dùng, chỉ khác là mở cho mọi app.
//!
//! Mỗi lúc chỉ tap **một** app. Tap tất cả cùng lúc nghĩa là một lỗi trong chuỗi DSP
//! làm câm cả máy chứ không phải một ứng dụng.

use crate::spotify::process_app_frame;
use crate::AudioRouter;
use serde::Serialize;
use sound_engine::spectrum::SpectrumBuffer;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Default, Serialize)]
pub struct AppTapStatus {
    /// Bundle id đang được đưa qua rust-sound, rỗng nghĩa là không tap gì.
    pub bundle_id: String,
    pub running: bool,
    /// Số frame IOProc đã xử lý; đứng yên nghĩa là không có tiếng đi qua.
    pub frames: u64,
    pub error: Option<String>,
}

/// Dữ liệu IOProc chạm tới. Sống đúng bằng tuổi của tap và chỉ một luồng đọc.
struct Processor {
    router: Arc<Mutex<AudioRouter>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
    bundle_id: String,
}

unsafe extern "C" fn process_audio(
    context: *mut std::ffi::c_void,
    samples: *mut f32,
    count: u32,
    rate: f64,
) {
    if context.is_null() || samples.is_null() || count == 0 || count > 32768 || count % 2 != 0 || !rate.is_finite() {
        return;
    }
    let processor = unsafe { &*context.cast::<Processor>() };
    let samples = unsafe { std::slice::from_raw_parts_mut(samples, count as usize) };
    process_app_frame(
        &processor.router,
        &processor.spectrum,
        samples,
        rate as f32,
        Some(&processor.bundle_id),
    );
}

pub struct AppTap {
    status: Arc<Mutex<AppTapStatus>>,
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
            status: Arc::new(Mutex::new(AppTapStatus::default())),
            stop: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }

    pub fn status(&self) -> AppTapStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = self.worker.lock().unwrap().take() {
            let _ = handle.join();
        }
        *self.status.lock().unwrap() = AppTapStatus::default();
    }

    /// `object_ids` là CoreAudio process object id, không phải PID — `AudioProcess`
    /// đã mang sẵn chúng.
    #[cfg(target_os = "macos")]
    pub fn start(
        &self,
        bundle_id: String,
        object_ids: Vec<u32>,
        router: Arc<Mutex<AudioRouter>>,
        spectrum: Arc<Mutex<SpectrumBuffer>>,
    ) -> Result<(), String> {
        if object_ids.is_empty() {
            return Err("Ứng dụng này chưa phát tiếng. Bật nhạc hoặc video rồi thử lại.".into());
        }
        self.stop();
        self.stop.store(false, Ordering::Release);

        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let status = self.status.clone();
        let stop = self.stop.clone();
        let worker = std::thread::spawn(move || {
            // Context phải sống lâu hơn tap và chỉ được IOProc nối tiếp chạm vào.
            let mut context = Box::new(Processor { router, spectrum, bundle_id: bundle_id.clone() });
            let tap = unsafe {
                sound_core::spotify::SpotifyTap::start(
                    &object_ids,
                    process_audio,
                    (&mut *context as *mut Processor).cast(),
                )
            };
            let tap = match tap {
                Ok(tap) => {
                    let _ = ready_tx.send(Ok(()));
                    tap
                }
                Err(error) => {
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            {
                let mut current = status.lock().unwrap();
                current.bundle_id = bundle_id;
                current.running = true;
                current.error = None;
            }
            // IOProc ngừng sinh frame nghĩa là tiếng đã rời đường này; buông ra thay vì
            // để người dùng ngồi trước một app câm.
            let mut previous = 0;
            let mut stalled = 0;
            while !stop.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(500));
                let frames = tap.frames();
                if frames > previous {
                    stalled = 0;
                } else {
                    stalled += 1;
                }
                previous = frames;
                let mut current = status.lock().unwrap();
                current.frames = frames;
                if stalled >= 6 {
                    current.running = false;
                    current.error = Some(
                        "Không nhận được tiếng từ ứng dụng này. Đã trả nó về đường phát thường."
                            .into(),
                    );
                    break;
                }
            }
            drop(tap);
            let mut current = status.lock().unwrap();
            current.running = false;
        });

        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {
                *self.worker.lock().unwrap() = Some(worker);
                Ok(())
            }
            Ok(Err(error)) => {
                self.stop.store(true, Ordering::Release);
                let _ = worker.join();
                self.status.lock().unwrap().error = Some(error.clone());
                Err(error)
            }
            Err(_) => {
                self.stop.store(true, Ordering::Release);
                Err("Hết thời gian chờ CoreAudio mở đường tap.".into())
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn start(
        &self,
        _bundle_id: String,
        _object_ids: Vec<u32>,
        _router: Arc<Mutex<AudioRouter>>,
        _spectrum: Arc<Mutex<SpectrumBuffer>>,
    ) -> Result<(), String> {
        Err("Chỉ hỗ trợ trên macOS.".into())
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
                Default::default(),
            )
            .unwrap_err();
        assert!(error.contains("chưa phát tiếng"), "{error}");
        assert!(!tap.status().running);
    }

    #[test]
    fn a_fresh_tap_reports_nothing_running() {
        let status = AppTap::new().status();
        assert!(!status.running);
        assert_eq!(status.bundle_id, "");
        assert_eq!(status.frames, 0);
    }
}
