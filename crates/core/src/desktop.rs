//! Bounded desktop actions. Model arguments never become executable source.
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct DesktopApp {
    pub name: String,
    pub bundle_id: String,
}

pub fn list_apps() -> Result<Vec<DesktopApp>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(
            crate::platform::macos::macos_app::get_running_applications()
                .into_iter()
                .filter(|app| {
                    app.is_regular
                        && app.pid as u32 != std::process::id()
                        && !app.bundle_id.is_empty()
                })
                .map(|app| DesktopApp {
                    name: app.name,
                    bundle_id: app.bundle_id,
                })
                .collect(),
        )
    }
    #[cfg(not(target_os = "macos"))]
    Err("Desktop Control hiện chỉ hỗ trợ macOS.".into())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DesktopAction {
    CloseChromeTab {},
    Click {
        bundle_id: String,
        x: f64,
        y: f64,
    },
    TypeText {
        bundle_id: String,
        text: String,
    },
    PressKey {
        bundle_id: String,
        key: String,
    },
    Scroll {
        bundle_id: String,
        x: f64,
        y: f64,
        direction: String,
        amount: u32,
    },
}

impl DesktopAction {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(bundle) = self.bundle_id() {
            if bundle.len() > 200
                || !bundle.contains('.')
                || !bundle
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b".-".contains(&c))
            {
                return Err("Bundle ID ứng dụng không hợp lệ.".into());
            }
        }
        match self {
            Self::Click { x, y, .. } | Self::Scroll { x, y, .. } => {
                if !x.is_finite()
                    || !y.is_finite()
                    || !(0.0..=1000.0).contains(x)
                    || !(0.0..=1000.0).contains(y)
                {
                    return Err("Tọa độ phải nằm trong 0–1000 trên màn hình chính.".into());
                }
            }
            Self::TypeText { text, .. }
                if text.is_empty()
                    || text.chars().count() > 2000
                    || text.chars().any(char::is_control) =>
            {
                return Err(
                    "Nhập 1–2000 ký tự, không chứa ký tự điều khiển hoặc xuống dòng.".into(),
                );
            }
            Self::PressKey { key, .. } if key_code(key).is_none() => {
                return Err("Phím tắt không được hỗ trợ.".into())
            }
            Self::PressKey { key, bundle_id }
                if key == "cmd+w" && bundle_id.eq_ignore_ascii_case("com.google.Chrome") =>
            {
                return Err(
                    "Dùng close_chrome_tab để khóa đúng tab Chrome trước khi xác nhận.".into(),
                )
            }
            _ => {}
        }
        if let Self::Scroll {
            direction, amount, ..
        } = self
        {
            if !matches!(direction.as_str(), "up" | "down" | "left" | "right")
                || !(1..=10).contains(amount)
            {
                return Err("Cuộn 1–10 dòng theo up/down/left/right.".into());
            }
        }
        Ok(())
    }

    fn bundle_id(&self) -> Option<&str> {
        match self {
            Self::CloseChromeTab {} => None,
            Self::Click { bundle_id, .. }
            | Self::TypeText { bundle_id, .. }
            | Self::PressKey { bundle_id, .. }
            | Self::Scroll { bundle_id, .. } => Some(bundle_id),
        }
    }

    pub fn description(&self) -> String {
        match self {
            Self::CloseChromeTab {} => "Đóng tab Chrome (có thể mất dữ liệu chưa lưu)".into(),
            Self::Click { x, y, .. } => format!("Click tại ({x}, {y}) trên thang 0–1000"),
            Self::TypeText { text, .. } => format!("Nhập nguyên văn: {text}"),
            Self::PressKey { key, .. } => format!("Gửi phím: {key}"),
            Self::Scroll {
                direction,
                amount,
                x,
                y,
                ..
            } => format!("Cuộn {direction}, {amount} dòng tại ({x}, {y})"),
        }
    }
}

fn key_code(key: &str) -> Option<(u16, u64)> {
    const CMD: u64 = 1 << 20;
    const SHIFT: u64 = 1 << 17;
    Some(match key {
        "enter" => (36, 0),
        "tab" => (48, 0),
        "escape" => (53, 0),
        "backspace" => (51, 0),
        "left" => (123, 0),
        "right" => (124, 0),
        "down" => (125, 0),
        "up" => (126, 0),
        "space" => (49, 0),
        "cmd+a" => (0, CMD),
        "cmd+c" => (8, CMD),
        "cmd+v" => (9, CMD),
        "cmd+z" => (6, CMD),
        "cmd+l" => (37, CMD),
        "cmd+t" => (17, CMD),
        "cmd+w" => (13, CMD),
        "cmd+shift+t" => (17, CMD | SHIFT),
        _ => return None,
    })
}

#[derive(Serialize)]
pub struct DesktopResult {
    pub summary: String,
    pub verified: bool,
}

pub struct PreparedDesktopAction {
    action: DesktopAction,
    pub target_label: String,
    #[cfg(target_os = "macos")]
    target: Target,
}

impl PreparedDesktopAction {
    pub fn prepare(action: DesktopAction) -> Result<Self, String> {
        action.validate()?;
        #[cfg(target_os = "macos")]
        {
            let (target, target_label) = match &action {
                DesktopAction::CloseChromeTab {} => {
                    let tab: ChromeTab = serde_json::from_str(&chrome_script(None)?)
                        .map_err(|_| "Chrome trả về dữ liệu không hợp lệ.")?;
                    let label = format!(
                        "Google Chrome — {} (tab {}, cửa sổ {})",
                        tab.title, tab.tab_id, tab.window_id
                    );
                    (Target::Chrome(tab), label)
                }
                _ => {
                    let native =
                        NativeTarget::prepare(action.bundle_id().ok_or("Thiếu ứng dụng đích")?)?;
                    let label = native.label();
                    (Target::Input(native), label)
                }
            };
            Ok(Self {
                action,
                target_label,
                target,
            })
        }
        #[cfg(not(target_os = "macos"))]
        Err("Desktop Control hiện chỉ hỗ trợ macOS.".into())
    }

    pub fn execute(self) -> Result<DesktopResult, String> {
        #[cfg(target_os = "macos")]
        match self.target {
            Target::Chrome(tab) => {
                let output = chrome_script(Some(&tab))?;
                if output != "closed" {
                    return Err("Chưa xác minh được tab đã đóng.".into());
                }
                Ok(DesktopResult {
                    summary: "Đã xác minh đóng tab Chrome được duyệt.".into(),
                    verified: true,
                })
            }
            Target::Input(target) => {
                target.execute(&self.action)?;
                Ok(DesktopResult {
                    summary: format!(
                        "Đã gửi thao tác tới {}. Chưa xác minh kết quả bên trong ứng dụng.",
                        self.target_label
                    ),
                    verified: false,
                })
            }
        }
        #[cfg(not(target_os = "macos"))]
        Err("Desktop Control hiện chỉ hỗ trợ macOS.".into())
    }
}

/// Only called by the user-facing permission button, never by the model tool.
pub fn request_chrome_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return chrome_permission(true);
    #[cfg(not(target_os = "macos"))]
    Err("Desktop Control hiện chỉ hỗ trợ macOS.".into())
}
#[cfg(target_os = "macos")]
fn chrome_permission(prompt: bool) -> Result<(), String> {
    let status = unsafe { rs_desktop_chrome_permission(prompt) };
    if status == 0 {
        Ok(())
    } else {
        Err(format!("Chrome Automation chưa được cấp ({status}). Mở Chrome rồi bấm Cấp quyền Chrome trong Desktop Control; kiểm tra System Settings → Privacy & Security → Automation."))
    }
}

#[cfg(target_os = "macos")]
enum Target {
    Chrome(ChromeTab),
    Input(NativeTarget),
}

#[cfg(target_os = "macos")]
#[derive(Serialize, Deserialize)]
struct ChromeTab {
    window_id: i64,
    tab_id: i64,
    title: String,
    url: String,
}

#[cfg(target_os = "macos")]
fn chrome_script(tab: Option<&ChromeTab>) -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};
    chrome_permission(false)?;
    // JSON goes through argv, never through code interpolation or a shell.
    let argument = serde_json::to_string(&tab).map_err(|e| e.to_string())?;
    let mut child = Command::new("/usr/bin/osascript")
        .args([
            "-l",
            "JavaScript",
            "-e",
            include_str!("desktop_chrome.js"),
            &argument,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    // Drain pipes concurrently: a long URL/title must never deadlock the child.
    fn drain(
        pipe: impl std::io::Read + Send + 'static,
    ) -> std::thread::JoinHandle<std::io::Result<Vec<u8>>> {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            pipe.take(65537).read_to_end(&mut bytes)?;
            Ok(bytes)
        })
    }
    let out = drain(child.stdout.take().ok_or("Thiếu stdout")?);
    let err = drain(child.stderr.take().ok_or("Thiếu stderr")?);
    let deadline = Instant::now() + Duration::from_secs(8);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(match result { Err(e) => e.to_string(), _ => "Chrome hết thời gian phản hồi. Kiểm tra quyền Automation cho SoundsSource Studio rồi thử lại.".into() });
            }
        }
    };
    let stdout = out
        .join()
        .map_err(|_| "Không đọc được Chrome output")?
        .map_err(|e| e.to_string())?;
    let stderr = err
        .join()
        .map_err(|_| "Không đọc được Chrome error")?
        .map_err(|e| e.to_string())?;
    if !status?.success() {
        return Err(format!(
            "Không điều khiển được Chrome. Kiểm tra Privacy & Security → Automation. {}",
            String::from_utf8_lossy(&stderr)
                .chars()
                .take(500)
                .collect::<String>()
        ));
    }
    if stdout.len() > 65536 {
        return Err("Chrome trả về quá nhiều dữ liệu.".into());
    }
    Ok(String::from_utf8_lossy(&stdout).trim().to_owned())
}

#[cfg(target_os = "macos")]
struct NativeTarget(std::ptr::NonNull<std::ffi::c_void>);
// SAFETY: the native object is immutable between prepare and execute; access is
// exclusive through ownership. CoreGraphics/AX and NSRunningApplication support
// cross-thread calls; each native entry owns an autorelease pool.
#[cfg(target_os = "macos")]
unsafe impl Send for NativeTarget {}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn rs_desktop_chrome_permission(prompt: bool) -> i32;
    fn rs_desktop_prepare(
        bundle: *const std::ffi::c_char,
        error: *mut std::ffi::c_char,
        size: usize,
    ) -> *mut std::ffi::c_void;
    fn rs_desktop_label(target: *mut std::ffi::c_void, output: *mut std::ffi::c_char, size: usize);
    fn rs_desktop_release(target: *mut std::ffi::c_void);
    fn rs_desktop_execute(
        target: *mut std::ffi::c_void,
        kind: u32,
        x: f64,
        y: f64,
        key: u16,
        flags: u64,
        text: *const std::ffi::c_char,
        vertical: i32,
        horizontal: i32,
        error: *mut std::ffi::c_char,
        size: usize,
    ) -> bool;
}
#[cfg(target_os = "macos")]
fn buffer_string(buffer: &[u8]) -> String {
    String::from_utf8_lossy(&buffer[..buffer.iter().position(|b| *b == 0).unwrap_or(buffer.len())])
        .into_owned()
}
#[cfg(target_os = "macos")]
impl NativeTarget {
    fn prepare(bundle: &str) -> Result<Self, String> {
        let bundle = std::ffi::CString::new(bundle).map_err(|_| "Bundle ID không hợp lệ")?;
        let mut error = [0u8; 1024];
        // SAFETY: valid C string and writable bounded buffer; returned pointer owns one reference.
        let ptr =
            unsafe { rs_desktop_prepare(bundle.as_ptr(), error.as_mut_ptr().cast(), error.len()) };
        std::ptr::NonNull::new(ptr)
            .map(Self)
            .ok_or_else(|| buffer_string(&error))
    }
    fn label(&self) -> String {
        let mut buffer = [0u8; 2048];
        unsafe { rs_desktop_label(self.0.as_ptr(), buffer.as_mut_ptr().cast(), buffer.len()) };
        buffer_string(&buffer)
    }
    fn execute(&self, action: &DesktopAction) -> Result<(), String> {
        action.validate()?;
        let (kind, x, y, key, flags, text, vertical, horizontal) = match action {
            DesktopAction::Click { x, y, .. } => (1, *x, *y, 0, 0, "", 0, 0),
            DesktopAction::TypeText { text, .. } => (2, 0.0, 0.0, 0, 0, text.as_str(), 0, 0),
            DesktopAction::PressKey { key, .. } => {
                let (code, flags) = key_code(key).ok_or("Phím không hợp lệ")?;
                (3, 0.0, 0.0, code, flags, "", 0, 0)
            }
            DesktopAction::Scroll {
                x,
                y,
                direction,
                amount,
                ..
            } => {
                let n = *amount as i32;
                let (v, h) = match direction.as_str() {
                    "up" => (n, 0),
                    "down" => (-n, 0),
                    "left" => (0, n),
                    _ => (0, -n),
                };
                (4, *x, *y, 0, 0, "", v, h)
            }
            _ => return Err("Hành động không hợp lệ".into()),
        };
        let text = std::ffi::CString::new(text).map_err(|_| "Văn bản không hợp lệ")?;
        let mut error = [0u8; 1024];
        // SAFETY: target remains owned, text is NUL-terminated, error buffer is bounded.
        if unsafe {
            rs_desktop_execute(
                self.0.as_ptr(),
                kind,
                x,
                y,
                key,
                flags,
                text.as_ptr(),
                vertical,
                horizontal,
                error.as_mut_ptr().cast(),
                error.len(),
            )
        } {
            Ok(())
        } else {
            Err(buffer_string(&error))
        }
    }
}
#[cfg(target_os = "macos")]
impl Drop for NativeTarget {
    fn drop(&mut self) {
        unsafe { rs_desktop_release(self.0.as_ptr()) };
    }
}
