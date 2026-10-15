//! System input blocker matching voice-macos reference behavior.
//!
//! Provides selective shortcut suppression during active break periods via macOS `CGEventTap`.
//! Mouse movement and clicks are NEVER suppressed to ensure the user can always click "Bỏ qua / Skip".

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

pub const MASK_COMMAND: u64 = 0x0010_0000;
pub const MASK_SHIFT: u64 = 0x0002_0000;
pub const MASK_CONTROL: u64 = 0x0004_0000;
pub const MASK_ALTERNATE: u64 = 0x0008_0000;

pub const KEYCODE_TAB: u16 = 48;
pub const KEYCODE_F3: u16 = 99;
pub const KEYCODE_Q: u16 = 12;
pub const KEYCODE_W: u16 = 13;
pub const KEYCODE_H: u16 = 4;
pub const KEYCODE_GRAVE: u16 = 50;
pub const KEYCODE_M: u16 = 46;
pub const KEYCODE_ESCAPE: u16 = 53;

/// Classifies keyboard events and determines if they must be suppressed during a break.
/// Matches exact behavior of `shouldSuppressEvent` from `voice-macos`.
pub fn should_suppress_event(keycode: u16, flags: u64) -> bool {
    let cmd = (flags & MASK_COMMAND) != 0;
    let shift = (flags & MASK_SHIFT) != 0;

    // Cmd-Tab / Cmd-Shift-Tab — app switcher
    if cmd && keycode == KEYCODE_TAB {
        return true;
    }

    // Mission Control (kVK_F3 = 99 on Apple keyboard layout)
    if keycode == KEYCODE_F3 {
        return true;
    }

    // Cmd-Q — quit frontmost app
    if cmd && keycode == KEYCODE_Q {
        return true;
    }

    // Cmd-W — close window
    if cmd && keycode == KEYCODE_W {
        return true;
    }

    // Cmd-H — hide
    if cmd && keycode == KEYCODE_H {
        return true;
    }

    // Cmd-` — next window in same app (backtick)
    if cmd && !shift && keycode == KEYCODE_GRAVE {
        return true;
    }

    // Cmd-M — minimise
    if cmd && keycode == KEYCODE_M {
        return true;
    }

    // Escape key — bare Escape
    if keycode == KEYCODE_ESCAPE {
        return true;
    }

    false
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::ffi::c_void;

    pub type CGEventRef = *mut c_void;
    pub type CGEventTapProxy = *mut c_void;
    pub type CFMachPortRef = *mut c_void;
    pub type CFRunLoopSourceRef = *mut c_void;
    pub type CGEventMask = u64;
    pub type CGEventType = u32;

    pub const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
    pub const K_CG_EVENT_KEY_UP: CGEventType = 11;
    pub const K_CG_EVENT_FLAGS_CHANGED: CGEventType = 12;
    pub const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: CGEventType = 0xFFFFFFFE;
    pub const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: CGEventType = 0xFFFFFFFF;
    pub const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        pub fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        pub fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: CGEventMask,
            callback: unsafe extern "C" fn(
                proxy: CGEventTapProxy,
                event_type: CGEventType,
                event: CGEventRef,
                user_info: *mut c_void,
            ) -> CGEventRef,
            user_info: *mut c_void,
        ) -> CFMachPortRef;

        pub fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        pub fn CGEventGetFlags(event: CGEventRef) -> u64;
        pub fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        pub fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void,
            port: CFMachPortRef,
            order: isize,
        ) -> CFRunLoopSourceRef;
        pub fn CFRunLoopGetMain() -> *mut c_void;
        pub fn CFRunLoopAddSource(rl: *mut c_void, source: CFRunLoopSourceRef, mode: *const c_void);
        pub fn CFRunLoopRemoveSource(rl: *mut c_void, source: CFRunLoopSourceRef, mode: *const c_void);
        pub static kCFRunLoopCommonModes: *const c_void;
        pub fn CFRelease(cf: *const c_void);
        pub static kCFBooleanTrue: *const c_void;
        pub fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            value_callbacks: *const c_void,
        ) -> *const c_void;
        pub static kCFTypeDictionaryKeyCallBacks: c_void;
        pub static kCFTypeDictionaryValueCallBacks: c_void;
        pub fn CFStringCreateWithCString(
            allocator: *const c_void,
            c_str: *const std::ffi::c_char,
            encoding: u32,
        ) -> *const c_void;
    }

    pub fn is_ax_trusted(prompt: bool) -> bool {
        if !prompt {
            unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
        } else {
            unsafe {
                let key_str = std::ffi::CString::new("AXTrustedCheckOptionPrompt").unwrap();
                let key_cf = CFStringCreateWithCString(
                    std::ptr::null(),
                    key_str.as_ptr(),
                    0x08000100, // UTF-8
                );
                let keys = [key_cf];
                let values = [kCFBooleanTrue];
                let dict = CFDictionaryCreate(
                    std::ptr::null(),
                    keys.as_ptr(),
                    values.as_ptr(),
                    1,
                    &kCFTypeDictionaryKeyCallBacks as *const _ as *const c_void,
                    &kCFTypeDictionaryValueCallBacks as *const _ as *const c_void,
                );
                let trusted = AXIsProcessTrustedWithOptions(dict);
                if !dict.is_null() {
                    CFRelease(dict);
                }
                if !key_cf.is_null() {
                    CFRelease(key_cf);
                }
                trusted
            }
        }
    }

    struct NativeTapHandles {
        tap: CFMachPortRef,
        source: CFRunLoopSourceRef,
    }

    unsafe impl Send for NativeTapHandles {}
    unsafe impl Sync for NativeTapHandles {}

    static GLOBAL_TAP: Mutex<Option<NativeTapHandles>> = Mutex::new(None);
    static IS_ACTIVE: AtomicBool = AtomicBool::new(false);
    static WATCHDOG_GENERATION: AtomicU64 = AtomicU64::new(0);

    unsafe extern "C" fn tap_callback(
        _proxy: CGEventTapProxy,
        event_type: CGEventType,
        event: CGEventRef,
        _user_info: *mut c_void,
    ) -> CGEventRef {
        if event_type == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT {
            if let Ok(guard) = GLOBAL_TAP.lock() {
                if let Some(handles) = guard.as_ref() {
                    unsafe {
                        CGEventTapEnable(handles.tap, true);
                    }
                }
            }
            return event;
        }

        if event_type == K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT {
            // Respect system security during secure input (pass through, do not force re-enable)
            return event;
        }

        // 2.3: NEVER suppress mouse events — only inspect key events
        if event_type != K_CG_EVENT_KEY_DOWN
            && event_type != K_CG_EVENT_KEY_UP
            && event_type != K_CG_EVENT_FLAGS_CHANGED
        {
            return event;
        }

        if !IS_ACTIVE.load(Ordering::Relaxed) {
            return event;
        }

        let keycode = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) as u16 };
        let flags = unsafe { CGEventGetFlags(event) };

        if should_suppress_event(keycode, flags) {
            // Drop event to suppress
            std::ptr::null_mut()
        } else {
            event
        }
    }

    pub fn install_tap(watchdog_seconds: u64) -> bool {
        let mut guard = match GLOBAL_TAP.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };

        if guard.is_some() {
            IS_ACTIVE.store(true, Ordering::SeqCst);
            return true;
        }

        if !is_ax_trusted(false) {
            return false;
        }

        unsafe {
            let mask: CGEventMask = (1 << K_CG_EVENT_KEY_DOWN)
                | (1 << K_CG_EVENT_KEY_UP)
                | (1 << K_CG_EVENT_FLAGS_CHANGED);

            // .cgSessionEventTap = 1, .headInsertEventTap = 0, .defaultTap = 0
            let tap = CGEventTapCreate(
                1, // SessionEventTap
                0, // HeadInsertEventTap
                0, // DefaultTap
                mask,
                tap_callback,
                std::ptr::null_mut(),
            );

            if tap.is_null() {
                return false;
            }

            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
            if source.is_null() {
                CFRelease(tap);
                return false;
            }

            let run_loop = CFRunLoopGetMain();
            CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);

            *guard = Some(NativeTapHandles { tap, source });
            IS_ACTIVE.store(true, Ordering::SeqCst);
        }

        // Bounded Watchdog Teardown
        let current_gen = WATCHDOG_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(watchdog_seconds.max(1)));
            if WATCHDOG_GENERATION.load(Ordering::SeqCst) == current_gen {
                uninstall_tap();
            }
        });

        true
    }

    pub fn uninstall_tap() {
        IS_ACTIVE.store(false, Ordering::SeqCst);
        WATCHDOG_GENERATION.fetch_add(1, Ordering::SeqCst);

        let mut guard = match GLOBAL_TAP.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        if let Some(handles) = guard.take() {
            unsafe {
                CGEventTapEnable(handles.tap, false);
                let run_loop = CFRunLoopGetMain();
                CFRunLoopRemoveSource(run_loop, handles.source, kCFRunLoopCommonModes);
                CFRelease(handles.source);
                CFRelease(handles.tap);
            }
        }
    }

    pub fn is_tap_active() -> bool {
        IS_ACTIVE.load(Ordering::Relaxed)
    }
}

/// Cross-platform InputBlocker manager.
#[derive(Debug, Default, Clone)]
pub struct InputBlocker {
    pub watchdog_timeout_secs: u64,
}

impl InputBlocker {
    pub fn new() -> Self {
        Self {
            watchdog_timeout_secs: 300, // 5 minutes hard ceiling matching Swift reference
        }
    }

    pub fn is_accessibility_trusted(&self, prompt: bool) -> bool {
        #[cfg(target_os = "macos")]
        {
            macos::is_ax_trusted(prompt)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = prompt;
            true
        }
    }

    pub fn install(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            macos::install_tap(self.watchdog_timeout_secs)
        }
        #[cfg(not(target_os = "macos"))]
        {
            true
        }
    }

    pub fn uninstall(&self) {
        #[cfg(target_os = "macos")]
        {
            macos::uninstall_tap();
        }
    }

    pub fn is_active(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            macos::is_tap_active()
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
}

impl Drop for InputBlocker {
    fn drop(&mut self) {
        // Safe idempotent cleanup on drop
        self.uninstall();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suppresses_app_switching_shortcuts() {
        // Cmd+Tab
        assert!(should_suppress_event(KEYCODE_TAB, MASK_COMMAND));
        // Cmd+Shift+Tab
        assert!(should_suppress_event(KEYCODE_TAB, MASK_COMMAND | MASK_SHIFT));
        // Tab without Cmd should NOT be suppressed
        assert!(!should_suppress_event(KEYCODE_TAB, 0));
        assert!(!should_suppress_event(KEYCODE_TAB, MASK_SHIFT));
    }

    #[test]
    fn test_suppresses_mission_control() {
        // F3 (Mission Control)
        assert!(should_suppress_event(KEYCODE_F3, 0));
        assert!(should_suppress_event(KEYCODE_F3, MASK_COMMAND));
    }

    #[test]
    fn test_suppresses_window_and_app_controls() {
        // Cmd+Q (Quit)
        assert!(should_suppress_event(KEYCODE_Q, MASK_COMMAND));
        assert!(!should_suppress_event(KEYCODE_Q, 0)); // typing 'q' is fine

        // Cmd+W (Close Window)
        assert!(should_suppress_event(KEYCODE_W, MASK_COMMAND));
        assert!(!should_suppress_event(KEYCODE_W, 0));

        // Cmd+H (Hide App)
        assert!(should_suppress_event(KEYCODE_H, MASK_COMMAND));
        assert!(!should_suppress_event(KEYCODE_H, 0));

        // Cmd+` (Cycle Windows)
        assert!(should_suppress_event(KEYCODE_GRAVE, MASK_COMMAND));
        // Cmd+Shift+` is not suppressed in Swift reference
        assert!(!should_suppress_event(KEYCODE_GRAVE, MASK_COMMAND | MASK_SHIFT));

        // Cmd+M (Minimise)
        assert!(should_suppress_event(KEYCODE_M, MASK_COMMAND));
        assert!(!should_suppress_event(KEYCODE_M, 0));
    }

    #[test]
    fn test_suppresses_escape() {
        // Bare Escape
        assert!(should_suppress_event(KEYCODE_ESCAPE, 0));
        assert!(should_suppress_event(KEYCODE_ESCAPE, MASK_SHIFT));
    }

    #[test]
    fn test_allows_normal_keys() {
        // Common keys should never be suppressed
        let normal_keys = [0, 1, 2, 35, 49 /* space */, 36 /* enter */];
        for k in normal_keys {
            assert!(!should_suppress_event(k, 0));
            assert!(!should_suppress_event(k, MASK_SHIFT));
        }
    }

    #[test]
    fn test_input_blocker_idempotent_lifecycle() {
        let blocker = InputBlocker::new();
        // Multiple uninstalls should never panic or error
        blocker.uninstall();
        blocker.uninstall();
        assert!(!blocker.is_active());
    }

    #[test]
    fn test_accessibility_check_does_not_crash() {
        let blocker = InputBlocker::new();
        let _trusted = blocker.is_accessibility_trusted(false);
        // Does not panic regardless of environment permission
    }
}
