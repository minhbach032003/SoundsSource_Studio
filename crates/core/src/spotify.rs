//! Spotify desktop automation and a private, Spotify-only CoreAudio tap.
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SpotifyPlayback {
    pub running: bool,
    pub playing: bool,
    /// Cần để phát tiếp đúng bài đang dở sau khi mở lại app.
    #[serde(default)] pub uri: String,
    /// Thiết bị Spotify đang thật sự phát, kể cả khi đó là điện thoại chứ không phải
    /// thiết bị app đang chọn. Thiếu nó thì app không biết người dùng vừa đổi chỗ phát.
    #[serde(default)] pub device_id: String,
    #[serde(default)] pub device_name: String,
    #[serde(default)] pub shuffle: bool,
    /// Spotify tự báo lệnh nào đang bị cấm. Danh sách bài rời không cho bật trộn hay
    /// lặp danh sách; bấm vào là nhận "Restriction violated".
    #[serde(default)] pub can_shuffle: bool,
    #[serde(default)] pub can_previous: bool,
    #[serde(default)] pub can_next: bool,
    #[serde(default)] pub can_repeat: bool,
    /// "off", "context" (lặp danh sách) hoặc "track" (lặp một bài).
    #[serde(default)] pub repeat: String,
    #[serde(default)] pub title: String,
    #[serde(default)] pub artist: String,
    #[serde(default)] pub album: String,
    #[serde(default)] pub artwork: String,
    #[serde(default)] pub position: f64,
    #[serde(default)] pub duration: f64,
}

fn run_script(script: &str) -> Result<String, String> {
    let mut child = Command::new("/usr/bin/osascript")
        .args(["-l", "JavaScript", "-e", script])
        .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(6);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Spotify không phản hồi. Kiểm tra quyền Automation trong System Settings.".into());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Không điều khiển được Spotify. Cho phép rust-sound trong Privacy & Security → Automation. {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "macos")]
pub fn is_spotify_running() -> bool {
    let ids = process_ids();
    if !ids.is_empty() {
        return true;
    }
    unsafe {
        use objc2::runtime::AnyClass;
        use objc2_foundation::NSString;
        if let Some(cls) = AnyClass::get(c"NSRunningApplication") {
            let bundle = NSString::from_str("com.spotify.client");
            let apps: *mut objc2::runtime::AnyObject = objc2::msg_send![cls, runningApplicationsWithBundleIdentifier: &*bundle];
            if !apps.is_null() {
                let count: usize = objc2::msg_send![apps, count];
                return count > 0;
            }
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
pub fn is_spotify_running() -> bool {
    false
}

pub fn launch() -> Result<(), String> {
    let status = Command::new("/usr/bin/open").args(["-g", "-j", "-b", "com.spotify.client"])
        .status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("Không tìm thấy Spotify trên Mac. Hãy cài Spotify rồi thử lại.".into()); }
    // `open -j` does not hide windows of an already-running Spotify instance.
    run_script(include_str!("spotify_hide.js")).map(|_| ())
}

pub fn playback() -> Result<SpotifyPlayback, String> {
    if !is_spotify_running() {
        return Ok(SpotifyPlayback::default());
    }
    let json = run_script(r#"const s = Application('com.spotify.client');
if (!s.running()) { JSON.stringify({running:false,playing:false}); }
else {
 const state = {running:true,playing:s.playerState()==='playing'};
 try { const t=s.currentTrack(); Object.assign(state,{can_previous:true,can_next:true,title:t.name(),artist:t.artist(),album:t.album(),artwork:t.artworkUrl(),duration:t.duration()/1000,position:s.playerPosition()}); } catch (_) {}
 JSON.stringify(state);
}"#)?;
    serde_json::from_str(&json).map_err(|e| format!("Spotify trả về dữ liệu không hợp lệ: {e}"))
}

pub fn set_volume(volume: f32) -> Result<(), String> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) { return Err("Volume must be between 0 and 1".into()); }
    run_script(&format!("Application('com.spotify.client').soundVolume = {}", (volume * 100.0).round() as u32)).map(|_| ())
}

/// Only public Spotify authorization URLs may leave the app through this helper.
pub fn open_authorization(url: &str) -> Result<(), String> {
    if !url.starts_with("https://accounts.spotify.com/authorize?") || url.len() > 8192 {
        return Err("Invalid Spotify authorization URL".into());
    }
    Command::new("/usr/bin/open").arg(url).status().map_err(|_| "Không mở được trình duyệt".to_string())?
        .success().then_some(()).ok_or_else(|| "Không mở được trình duyệt".into())
}

/// Read, update or delete the refresh token for this public Client ID.
#[cfg(target_os = "macos")]
pub fn refresh_token(account: &str, update: Option<Option<&str>>) -> Result<Option<String>, String> {
    use std::ffi::CString;
    unsafe extern "C" {
        fn rs_spotify_token_load(account: *const i8, buffer: *mut i8, capacity: u32) -> i32;
        fn rs_spotify_token_save(account: *const i8, token: *const i8) -> i32;
        fn rs_spotify_token_delete(account: *const i8) -> i32;
    }
    let account = CString::new(account).map_err(|_| "Invalid Client ID")?;
    let status = match update {
        None => {
            let mut buffer = vec![0u8; 8192];
            let length = unsafe { rs_spotify_token_load(account.as_ptr(), buffer.as_mut_ptr().cast(), buffer.len() as u32) };
            if length == 0 { return Ok(None); }
            if length > 0 { return String::from_utf8(buffer[..length as usize].to_vec()).map(Some).map_err(|_| "Invalid Keychain data".into()); }
            length
        },
        Some(Some(token)) => {
            let token = CString::new(token).map_err(|_| "Invalid refresh token")?;
            unsafe { rs_spotify_token_save(account.as_ptr(), token.as_ptr()) }
        },
        Some(None) => unsafe { rs_spotify_token_delete(account.as_ptr()) },
    };
    if status == 0 { Ok(None) } else { Err(format!("Không truy cập được macOS Keychain ({status}). Mở khóa Keychain rồi thử lại.")) }
}
#[cfg(not(target_os = "macos"))]
pub fn refresh_token(_: &str, _: Option<Option<&str>>) -> Result<Option<String>, String> {
    Err("Spotify credential storage requires macOS".into())
}

pub fn control(action: &str) -> Result<(), String> {
    let script = match action {
        "play_pause" => "Application('com.spotify.client').playpause()",
        "next" => "Application('com.spotify.client').nextTrack()",
        "previous" => "Application('com.spotify.client').previousTrack()",
        _ => return Err("Invalid Spotify action".into()),
    };
    run_script(script).map(|_| ())
}

#[cfg(target_os = "macos")]
mod native {
    use std::ffi::c_void;
    pub type Processor = unsafe extern "C" fn(*mut c_void, *mut f32, u32, f64);
    unsafe extern "C" {
        pub fn rs_spotify_tap_start(ids: *const u32, count: u32, process: Processor, context: *mut c_void, error: *mut i32, stage: *mut i32) -> *mut c_void;
        pub fn rs_spotify_tap_output_format(session: *mut c_void, rate: *mut f64, channels: *mut u32);
        pub fn rs_spotify_tap_stop(session: *mut c_void);
        pub fn rs_spotify_tap_frames(session: *mut c_void) -> u64;
        pub fn rs_default_output() -> u32;
        pub fn rs_spotify_processes(ids: *mut u32, capacity: u32) -> u32;
    }

    /// Stage says which CoreAudio step failed; the enum lives in spotify_tap.m.
    fn start_error(error: i32, stage: i32) -> String {
        match (error, stage) {
            (560947818, _) => "Không nối được tiếng Spotify (CoreAudio !per). Cần cấp quyền Screen & System Audio Recording trong System Settings > Privacy & Security.".into(),
            (_, 1) => "Cần macOS 14.2 trở lên để tách riêng tiếng Spotify.".into(),
            (_, 2) => "Đợi Spotify tạo luồng âm thanh. Bấm Play để bắt đầu.".into(),
            _ => format!("Không nối được tiếng Spotify (CoreAudio {error}, bước {stage}). Kiểm tra thiết bị âm thanh và quyền ghi âm hệ thống rồi thử lại."),
        }
    }
    pub struct SpotifyTap(*mut c_void);
    impl SpotifyTap {
        /// Context must outlive this tap and be exclusively accessed by its serial IOProc.
        pub unsafe fn start(ids: &[u32], process: Processor, context: *mut c_void) -> Result<Self, String> {
            if ids.is_empty() { return Err("Đợi Spotify tạo luồng âm thanh. Bấm Play để bắt đầu.".into()); }
            let (mut error, mut stage) = (0, 0);
            let ptr = unsafe { rs_spotify_tap_start(ids.as_ptr(), ids.len() as u32, process, context, &mut error, &mut stage) };
            if ptr.is_null() { Err(start_error(error, stage)) } else { Ok(Self(ptr)) }
        }
        pub fn frames(&self) -> u64 { unsafe { rs_spotify_tap_frames(self.0) } }
        /// Rate and channel count the IOProc is resampling the 48 kHz tap down to.
        pub fn output_format(&self) -> (f64, u32) {
            let (mut rate, mut channels) = (0.0, 0);
            unsafe { rs_spotify_tap_output_format(self.0, &mut rate, &mut channels) };
            (rate, channels)
        }
    }
    impl Drop for SpotifyTap { fn drop(&mut self) { unsafe { rs_spotify_tap_stop(self.0) } } }
    pub fn default_output() -> u32 { unsafe { rs_default_output() } }
    pub fn process_ids() -> Vec<u32> {
        let mut ids = [0; 128];
        let count = unsafe { rs_spotify_processes(ids.as_mut_ptr(), ids.len() as u32) } as usize;
        ids[..count.min(ids.len())].to_vec()
    }
}
#[cfg(target_os = "macos")]
pub use native::{SpotifyTap, default_output, process_ids};

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_script_injection_before_launching_osascript() {
        assert!(super::control("next; do shell script").is_err());
        assert!(super::set_volume(f32::NAN).is_err());
        assert!(super::set_volume(100.0).is_err());
    }
}
