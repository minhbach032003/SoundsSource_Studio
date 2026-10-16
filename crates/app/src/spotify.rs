use crate::{AudioRouter, AppState};
use serde::Serialize;
use sound_core::spotify::{self, SpotifyPlayback};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread::JoinHandle;
use tauri::State;
use sound_engine::spectrum::{SpectrumBuffer, SpectrumReading};

#[derive(Clone, Default, Serialize)]
pub struct SpotifyStatus {
    #[serde(flatten)]
    pub playback: SpotifyPlayback,
    pub enabled: bool,
    pub connected: bool,
    pub processing: bool,
    pub frames: u64,
    pub sample_rate: f64,
    pub error: Option<String>,
    /// Degraded but working: the output device forces a lossy rate or mono.
    pub warning: Option<String>,
    pub playback_error: Option<String>,
}

pub struct SpotifyIntegration {
    pub web: Arc<sound_engine::spotify::SpotifyWeb>,
    status: Arc<Mutex<SpotifyStatus>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
    enabled: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl Default for SpotifyIntegration {
    fn default() -> Self {
        Self { web: Arc::new(sound_engine::spotify::SpotifyWeb::new(env!("SPOTIFY_CLIENT_ID"))),
            status: Default::default(), spectrum: Default::default(), enabled: Default::default(), stop: Default::default(), worker: Default::default() }
    }
}

impl SpotifyIntegration {
    #[cfg(target_os = "macos")]
    pub fn start(&self, router: Arc<Mutex<AudioRouter>>) {
        let web = self.web.clone();
        let status = self.status.clone();
        let spectrum = self.spectrum.clone();
        let enabled = self.enabled.clone();
        let stop = self.stop.clone();
        let mut worker = self.worker.lock().unwrap();
        if worker.is_some() { return; }
        *worker = Some(std::thread::spawn(move || {
            if let Err(error) = spotify::launch() {
                status.lock().unwrap().error = Some(error);
                return;
            }
            router.lock().unwrap().get_or_create_channel("com.spotify.client");
            let mut context = Box::new(Processor { router, spectrum });
            let mut tap: Option<spotify::SpotifyTap> = None;
            let mut signature = (Vec::<u32>::new(), 0);
            let mut previous_frames = 0;
            let mut stalled = 0;
            let mut route_error = None;
            while !stop.load(Ordering::Acquire) {
                let playback = if web.connected() { web.playback() } else { spotify::playback() };
                let mut ids = spotify::process_ids();
                ids.sort_unstable(); ids.dedup();
                let current = (ids, spotify::default_output());
                if !enabled.load(Ordering::Acquire) || current != signature {
                    tap = None; previous_frames = 0; stalled = 0;
                }
                let mut error = if enabled.load(Ordering::Acquire) { None } else { route_error.clone() };
                if enabled.load(Ordering::Acquire) && tap.is_none() {
                    // Context is boxed and remains alive until after AudioDeviceStop.
                    match unsafe { spotify::SpotifyTap::start(&current.0, process_audio, (&mut *context as *mut Processor).cast()) } {
                        Ok(session) => { tap = Some(session); signature = current; route_error = None; },
                        Err(e) => error = Some(e),
                    }
                }
                let frames = tap.as_ref().map_or(0, |t| t.frames());
                let processing = frames > previous_frames;
                previous_frames = frames;
                // Release the source if the IOProc stops producing valid frames.
                if tap.is_some() && !processing {
                    stalled += 1;
                    if stalled >= 3 {
                        tap = None;
                        enabled.store(false, Ordering::Release);
                        error = Some("Không nhận được buffer âm thanh. Tiếng Spotify đã trở về đường phát thường; thử kết nối lại hoặc đổi thiết bị đầu ra.".into());
                    }
                } else { stalled = 0; }
                if error.is_some() { route_error = error.clone(); }
                let warning = tap.as_ref().and_then(|t| output_warning(t.output_format()));
                let mut next = SpotifyStatus { enabled: enabled.load(Ordering::Acquire), connected: tap.is_some(), processing: processing && tap.is_some(), frames, sample_rate: 0.0, error, warning, ..Default::default() };
                // rate is only written by IOProc: read the router's EQ rate under its lock.
                next.sample_rate = context.router.lock().unwrap().master_eq().sample_rate as f64;
                match playback {
                    Ok(p) => next.playback = p,
                    Err(e) => next.playback_error = Some(e),
                }
                *status.lock().unwrap() = next;
                for _ in 0..20 {
                    if stop.load(Ordering::Acquire) { break; }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
            drop(tap); // Stop IOProc before freeing its context. Leave Spotify running.
        }));
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.lock().unwrap().take() { let _ = worker.join(); }
    }
}

/// The tap is fixed at 48 kHz stereo; say so when the device cannot carry that.
fn output_warning((rate, channels): (f64, u32)) -> Option<String> {
    let mut limits = Vec::new();
    if rate > 0.0 && rate < 44100.0 { limits.push(format!("{} kHz", (rate / 100.0).round() / 10.0)); }
    if channels == 1 { limits.push("mono".into()); }
    if limits.is_empty() { return None; }
    Some(format!("Thiết bị phát đang chạy {} nên tiếng bị giảm chất lượng. Thường là do app khác đang dùng mic đẩy tai nghe Bluetooth sang chế độ hands-free — thoát mic hoặc đổi thiết bị phát để nghe đầy đủ.", limits.join(" · ")))
}

struct Processor {
    router: Arc<Mutex<AudioRouter>>,
    spectrum: Arc<Mutex<SpectrumBuffer>>,
}

#[derive(Serialize)]
pub struct SpotifySpectrum {
    #[serde(flatten)]
    pub reading: SpectrumReading,
    pub enabled: bool,
    pub connected: bool,
    pub error: Option<String>,
}

impl SpotifyIntegration {
    fn spectrum(&self) -> SpotifySpectrum {
        let status = self.status.lock().unwrap().clone();
        let enabled = self.enabled.load(Ordering::Acquire);
        // Copy a bounded PCM window, release the lock, then analyze off the audio thread.
        let buffer = self.spectrum.lock().unwrap().clone();
        let reading = if enabled && status.connected && status.error.is_none() {
            buffer.snapshot()
        } else { SpectrumReading::default() };
        SpotifySpectrum { reading, enabled, connected: status.connected, error: status.error }
    }
}

#[tauri::command]
pub fn get_spotify_spectrum(state: State<'_, AppState>) -> SpotifySpectrum {
    state.spotify.spectrum()
}

unsafe extern "C" fn process_audio(context: *mut std::ffi::c_void, samples: *mut f32, count: u32, rate: f64) {
    if context.is_null() || samples.is_null() || count == 0 || count > 32768 || count % 2 != 0 || !rate.is_finite() || !(8000.0..=192000.0).contains(&rate) { return; }
    let processor = unsafe { &*context.cast::<Processor>() };
    let samples = unsafe { std::slice::from_raw_parts_mut(samples, count as usize) };
    // Never block the audio thread on UI commands. A contended buffer passes through.
    if let Ok(mut router) = processor.router.try_lock() {
        if router.master_eq().sample_rate != rate as f32 {
            let eq = router.master_eq_mut();
            eq.sample_rate = rate as f32; eq.recalculate_all();
            let eq = &mut router.get_or_create_channel("com.spotify.client").eq;
            eq.sample_rate = rate as f32; eq.recalculate_all();
        }
        router.get_or_create_channel("com.spotify.client").eq.process_interleaved_stereo(samples);
        // This rack is fed only by the Spotify tap, not the system mix.
        router.master_eq_mut().process_interleaved_stereo(samples);
    }
    for s in samples.iter_mut() { *s = if s.is_finite() { s.clamp(-1.0, 1.0) } else { 0.0 }; }
    if let Ok(mut spectrum) = processor.spectrum.try_lock() {
        spectrum.push_stereo(samples, rate as f32);
    }
}

#[tauri::command]
pub fn get_spotify_status(state: State<'_, AppState>) -> SpotifyStatus {
    let mut status = state.spotify.status.lock().unwrap().clone();
    status.enabled = state.spotify.enabled.load(Ordering::Acquire);
    status
}

#[tauri::command]
pub fn connect_spotify_audio(enabled: bool, state: State<'_, AppState>) {
    state.spotify.enabled.store(enabled, Ordering::Release);
}

#[tauri::command]
pub async fn spotify_control(action: String, state: State<'_, AppState>) -> Result<(), String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || if web.connected() { web.control(&action) } else { spotify::control(&action) }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spotify_account(state: State<'_, AppState>) -> Result<sound_engine::spotify::AccountStatus, String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.account()).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_login(state: State<'_, AppState>) -> Result<sound_engine::spotify::AccountStatus, String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.login()).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_logout(state: State<'_, AppState>) -> Result<(), String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.logout()).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_browse(kind: String, query: String, offset: u32, playlist_id: Option<String>, state: State<'_, AppState>) -> Result<sound_engine::spotify::MusicPage, String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.browse(&kind, &query, offset, playlist_id.as_deref())).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_devices(state: State<'_, AppState>) -> Result<Vec<sound_engine::spotify::Device>, String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.devices()).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_select_device(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.select_device(&id)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn spotify_play_uri(uri: String, state: State<'_, AppState>) -> Result<(), String> {
    let web = state.spotify.web.clone();
    tauri::async_runtime::spawn_blocking(move || web.play_uri(&uri)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spotify_open_automation_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        std::process::Command::new("/usr/bin/open").arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
            .status().map_err(|e| e.to_string())?.success().then_some(()).ok_or_else(|| "Không mở được System Settings".into())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_tap_callback_routes_spotify_through_eq_and_bypass() {
        let router = Arc::new(Mutex::new(AudioRouter::new(48000.0)));
        let mut processor = Processor { router: router.clone(), spectrum: Default::default() };
        let tone: Vec<f32> = (0..8192).flat_map(|i| {
            let v = 0.05 * (std::f32::consts::TAU * 64.0 * i as f32 / 48000.0).sin(); [v, v]
        }).collect();
        router.lock().unwrap().set_master_eq_band(1, 6.0);
        let mut boosted = tone.clone();
        unsafe { process_audio((&mut processor as *mut Processor).cast(), boosted.as_mut_ptr(), boosted.len() as u32, 48000.0); }
        let energy = |s: &[f32]| s[8192..].iter().map(|v| v*v).sum::<f32>();
        assert!(energy(&boosted) > energy(&tone) * 3.0, "Bass EQ must change actual tap output");
        router.lock().unwrap().set_master_eq_bypass(true);
        let mut bypassed = tone.clone();
        unsafe { process_audio((&mut processor as *mut Processor).cast(), bypassed.as_mut_ptr(), bypassed.len() as u32, 48000.0); }
        assert_eq!(bypassed, tone);
        let mut other_app = tone.clone();
        router.lock().unwrap().get_or_create_channel("com.hnc.Discord").process(&mut other_app);
        assert_eq!(other_app, tone, "Spotify rack must not affect another app");
        let mut invalid = [f32::NAN, 5.0];
        unsafe { process_audio((&mut processor as *mut Processor).cast(), invalid.as_mut_ptr(), 2, 48000.0); }
        assert_eq!(invalid, [0.0, 1.0]);
        assert!(processor.spectrum.lock().unwrap().snapshot().has_signal);
    }

    #[test]
    fn spotify_spectrum_uses_callback_pcm_and_clears_when_disconnected() {
        let integration = SpotifyIntegration::default();
        let mut processor = Processor { router: Arc::new(Mutex::new(AudioRouter::new(48000.0))), spectrum: integration.spectrum.clone() };
        let mut tone: Vec<f32> = (0..4096).flat_map(|i| {
            let v = 0.25 * (std::f32::consts::TAU * 1000.0 * i as f32 / 48000.0).sin(); [v, -v]
        }).collect();
        unsafe { process_audio((&mut processor as *mut Processor).cast(), tone.as_mut_ptr(), tone.len() as u32, 48000.0); }
        assert!(!integration.spectrum().reading.has_signal, "no consent means no displayed capture");
        integration.enabled.store(true, Ordering::Release);
        integration.status.lock().unwrap().connected = true;
        assert!(integration.spectrum().reading.has_signal);
        assert!(integration.spectrum().reading.heights[15] > 60.0);
        integration.enabled.store(false, Ordering::Release);
        assert_eq!(integration.spectrum().reading.heights, [0.0; 28]);
    }
}
