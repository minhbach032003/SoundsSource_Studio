//! macOS native CGEventTap and Accessibility permission support for Pingloom.

use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use core_foundation::{
    array::CFArrayGetValueAtIndex,
    base::TCFType,
    boolean::CFBoolean,
    dictionary::{CFDictionary, CFDictionaryGetValue, CFDictionaryRef},
    mach_port::CFMachPortRef,
    number::{kCFNumberSInt64Type, CFNumberGetValue, CFNumberRef},
    runloop::{kCFRunLoopCommonModes, kCFRunLoopDefaultMode, CFRunLoop},
    string::CFString,
};
use core_graphics::{
    display::CGDisplay,
    event::{
        CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
        CGEventType, CGMouseButton, CallbackResult, EventField,
    },
    event_source::{CGEventSource, CGEventSourceStateID},
    geometry::{CGPoint, CGRect, CGSize},
};

use crate::gesture::{GestureEngine, ReplayInput, VK_MASK_MENU};
use crate::model::{Action, Button, InputEvent, Point};
use crate::settings::{Settings, SettingsError};

pub const PERMISSION_MESSAGE: &str =
    "Allow Pingloom in System Settings → Privacy & Security → Accessibility. Gestures start automatically once access is granted.";

/// Synthetic event marker to prevent self-interception (`PINGLOOM` in ASCII hex).
pub const MARKER: i64 = 0x50494e474c4f4f4d;

/// The live tap pointer, so its own callback can re-enable it after a macOS timeout.
static TAP: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(std::ptr::null_mut());

pub type ActionCallback = Arc<dyn Fn(Action, Option<Point>, f64) + Send + Sync + 'static>;

const KEYS: &[(u8, u16)] = &[
    (0x41, 0),   // A
    (0x53, 1),   // S
    (0x44, 2),   // D
    (0x46, 3),   // F
    (0x48, 4),   // H
    (0x47, 5),   // G
    (0x5a, 6),   // Z
    (0x58, 7),   // X
    (0x43, 8),   // C
    (0x56, 9),   // V
    (0x42, 11),  // B
    (0x51, 12),  // Q
    (0x57, 13),  // W
    (0x45, 14),  // E
    (0x52, 15),  // R
    (0x59, 16),  // Y
    (0x54, 17),  // T
    (0x31, 18),  // 1
    (0x32, 19),  // 2
    (0x33, 20),  // 3
    (0x34, 21),  // 4
    (0x36, 22),  // 6
    (0x35, 23),  // 5
    (0xbb, 24),  // =
    (0x39, 25),  // 9
    (0x37, 26),  // 7
    (0xbd, 27),  // -
    (0x38, 28),  // 8
    (0x30, 29),  // 0
    (0xdd, 30),  // ]
    (0x4f, 31),  // O
    (0x55, 32),  // U
    (0xdb, 33),  // [
    (0x49, 34),  // I
    (0x50, 35),  // P
    (0x0d, 36),  // Return
    (0x4c, 37),  // L
    (0x4a, 38),  // J
    (0xde, 39),  // '
    (0x4b, 40),  // K
    (0xba, 41),  // ;
    (0xdc, 42),  // \
    (0xbc, 43),  // ,
    (0xbf, 44),  // /
    (0x4e, 45),  // N
    (0x4d, 46),  // M
    (0xbe, 47),  // .
    (0x09, 48),  // Tab
    (0x20, 49),  // Space
    (0xc0, 50),  // `
    (0x08, 51),  // Backspace
    (0x1b, 53),  // Escape
    (0x5c, 54),  // Right Command
    (0x5b, 55),  // Left Command
    (0xa0, 56),  // Left Shift
    (0xa4, 58),  // Left Option / Alt
    (0xa2, 59),  // Left Control
    (0xa1, 60),  // Right Shift
    (0xa5, 61),  // Right Option / Alt
    (0xa3, 62),  // Right Control
    (0x70, 122), // F1
    (0x71, 120), // F2
    (0x72, 99),  // F3
    (0x73, 118), // F4
    (0x74, 96),  // F5
    (0x75, 97),  // F6
    (0x76, 98),  // F7
    (0x77, 100), // F8
    (0x78, 101), // F9
    (0x79, 109), // F10
    (0x7a, 103), // F11
    (0x7b, 111), // F12
    (0x24, 115), // Home
    (0x23, 119), // End
    (0x21, 116), // PageUp
    (0x22, 121), // PageDown
    (0x2e, 117), // Delete
    (0x25, 123), // Left
    (0x27, 124), // Right
    (0x28, 125), // Down
    (0x26, 126), // Up
];

pub fn code(vk: u8) -> Option<u16> {
    let vk = match vk {
        0x10 => 0xa0,
        0x11 => 0xa2,
        0x12 => 0xa4,
        _ => vk,
    };
    KEYS.iter().find(|(v, _)| *v == vk).map(|(_, code)| *code)
}

pub fn supported_vk(vk: u8) -> bool {
    code(vk).is_some()
}

pub fn vk(code: u16) -> u8 {
    KEYS.iter()
        .find(|(_, c)| *c == code)
        .map_or(0xff, |(vk, _)| *vk)
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceKeyState(state_id: i32, keycode: u16) -> bool;
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CGRectMakeWithDictionaryRepresentation(
        dictionary: CFDictionaryRef,
        rect: *mut CGRect,
    ) -> bool;
}

/// Query or request macOS Accessibility permissions via `AXIsProcessTrustedWithOptions`.
///
/// If `prompt` is true, macOS prompts the user and opens System Settings → Privacy & Security → Accessibility.
pub fn is_accessibility_trusted(prompt: bool) -> bool {
    let options = CFDictionary::from_CFType_pairs(&[(
        CFString::from_static_string("AXTrustedCheckOptionPrompt").as_CFType(),
        CFBoolean::from(prompt).as_CFType(),
    )]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

fn key_down(vk: u8) -> bool {
    code(vk).is_some_and(|code| unsafe {
        CGEventSourceKeyState(CGEventSourceStateID::HIDSystemState as i32, code)
    })
}

fn button(kind: CGEventType, event: &CGEvent) -> Option<(Button, bool)> {
    match kind {
        CGEventType::LeftMouseDown => Some((Button::Left, true)),
        CGEventType::LeftMouseUp => Some((Button::Left, false)),
        CGEventType::RightMouseDown => Some((Button::Right, true)),
        CGEventType::RightMouseUp => Some((Button::Right, false)),
        CGEventType::OtherMouseDown | CGEventType::OtherMouseUp => {
            let button = match event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER)
            {
                2 => Button::Middle,
                3 => Button::X1,
                4 => Button::X2,
                _ => return None,
            };
            Some((button, matches!(kind, CGEventType::OtherMouseDown)))
        }
        _ => None,
    }
}

fn fullscreen_at(point: Point) -> bool {
    use core_graphics::window::*;
    let Some(windows) = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        0,
    ) else {
        return false;
    };
    for index in 0..windows.len() {
        unsafe {
            let dict =
                CFArrayGetValueAtIndex(windows.as_concrete_TypeRef(), index) as CFDictionaryRef;
            let layer = CFDictionaryGetValue(dict, kCGWindowLayer.cast());
            let pid = CFDictionaryGetValue(dict, kCGWindowOwnerPID.cast());
            if layer.is_null() || pid.is_null() {
                continue;
            }
            let mut layer_number = 0i64;
            let mut owner = 0i64;
            if !CFNumberGetValue(
                layer as CFNumberRef,
                kCFNumberSInt64Type,
                (&mut layer_number as *mut i64).cast(),
            ) || !CFNumberGetValue(
                pid as CFNumberRef,
                kCFNumberSInt64Type,
                (&mut owner as *mut i64).cast(),
            ) {
                continue;
            }
            if layer_number != 0 || owner == std::process::id() as i64 {
                continue;
            }
            let bounds = CFDictionaryGetValue(dict, kCGWindowBounds.cast());
            if bounds.is_null() {
                continue;
            }
            let mut rect = CGRect::new(&CGPoint::new(0.0, 0.0), &CGSize::new(0.0, 0.0));
            if !CGRectMakeWithDictionaryRepresentation(bounds as CFDictionaryRef, &mut rect) {
                continue;
            }
            if !(point.x as f64 >= rect.origin.x
                && point.y as f64 >= rect.origin.y
                && (point.x as f64) < rect.origin.x + rect.size.width
                && (point.y as f64) < rect.origin.y + rect.size.height)
            {
                continue;
            }
            return CGDisplay::active_displays()
                .unwrap_or_default()
                .into_iter()
                .any(|id| {
                    let display = CGDisplay::new(id).bounds();
                    (rect.origin.x - display.origin.x).abs() < 2.0
                        && (rect.origin.y - display.origin.y).abs() < 2.0
                        && (rect.size.width - display.size.width).abs() < 2.0
                        && (rect.size.height - display.size.height).abs() < 2.0
                });
        }
    }
    false
}

pub fn replay(input: ReplayInput) -> Result<(), ()> {
    if !unsafe { AXIsProcessTrusted() } {
        return Err(());
    }
    if matches!(
        input,
        ReplayInput::KeyDown(VK_MASK_MENU) | ReplayInput::KeyUp(VK_MASK_MENU)
    ) {
        return Ok(());
    }
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)?;
    let event = match input {
        ReplayInput::KeyDown(vk) => {
            CGEvent::new_keyboard_event(source, code(vk).ok_or(())?, true)?
        }
        ReplayInput::KeyUp(vk) => {
            CGEvent::new_keyboard_event(source, code(vk).ok_or(())?, false)?
        }
        ReplayInput::ButtonDown(btn) | ReplayInput::ButtonUp(btn) => {
            let location = CGEvent::new(source.clone())?.location();
            let down = matches!(input, ReplayInput::ButtonDown(_));
            let (kind, mouse, number) = match btn {
                Button::Left => (
                    if down {
                        CGEventType::LeftMouseDown
                    } else {
                        CGEventType::LeftMouseUp
                    },
                    CGMouseButton::Left,
                    0,
                ),
                Button::Right => (
                    if down {
                        CGEventType::RightMouseDown
                    } else {
                        CGEventType::RightMouseUp
                    },
                    CGMouseButton::Right,
                    1,
                ),
                Button::Middle | Button::X1 | Button::X2 => (
                    if down {
                        CGEventType::OtherMouseDown
                    } else {
                        CGEventType::OtherMouseUp
                    },
                    CGMouseButton::Center,
                    match btn {
                        Button::Middle => 2,
                        Button::X1 => 3,
                        _ => 4,
                    },
                ),
            };
            let event = CGEvent::new_mouse_event(source, kind, location, mouse)?;
            event.set_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER, number);
            event
        }
    };
    event.set_integer_value_field(EventField::EVENT_SOURCE_USER_DATA, MARKER);
    event.post(CGEventTapLocation::HID);
    Ok(())
}

/// High-level native macOS gesture listener.
pub struct NativeGestureListener {
    running: Arc<AtomicBool>,
    run_loop: Arc<AtomicPtr<std::ffi::c_void>>,
    engine: Arc<Mutex<GestureEngine>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl NativeGestureListener {
    /// Start listening for global gestures using `CGEventTap`.
    ///
    /// If Accessibility permissions are not yet granted, the background thread polls
    /// every second until access is granted, then attaches the tap without needing an app restart.
    pub fn start(settings: Settings, callback: ActionCallback) -> Result<Self, String> {
        let engine = GestureEngine::new(settings.clone())
            .map_err(|e| format!("Invalid gesture settings: {:?}", e))?;
        let engine = Arc::new(Mutex::new(engine));
        let running = Arc::new(AtomicBool::new(true));
        let run_loop = Arc::new(AtomicPtr::new(std::ptr::null_mut()));

        let thread_running = Arc::clone(&running);
        let thread_run_loop = Arc::clone(&run_loop);
        let thread_engine = Arc::clone(&engine);

        let thread = std::thread::Builder::new()
            .name("pingloom-macos-tap".into())
            .spawn(move || {
                run_listener_loop(
                    thread_running,
                    thread_run_loop,
                    thread_engine,
                    callback,
                );
            })
            .map_err(|e| format!("Failed to spawn native gesture thread: {}", e))?;

        Ok(Self {
            running,
            run_loop,
            engine,
            thread: Some(thread),
        })
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Release);
        let ptr = self.run_loop.load(Ordering::Acquire);
        if !ptr.is_null() {
            unsafe {
                core_foundation::runloop::CFRunLoopStop(ptr.cast());
            }
        }
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }

    pub fn set_enabled(&self, enabled: bool) {
        if let Ok(mut engine) = self.engine.lock() {
            let decision = engine.set_enabled(enabled);
            for replay_input in decision.replay {
                let _ = replay(replay_input);
            }
        }
    }

    pub fn update_settings(&self, settings: Settings) -> Result<(), SettingsError> {
        let mut engine = self
            .engine
            .lock()
            .map_err(|_| SettingsError::Invalid("engine lock poisoned"))?;
        let decision = engine.set_settings(settings)?;
        for replay_input in decision.replay {
            let _ = replay(replay_input);
        }
        Ok(())
    }

    pub fn is_enabled(&self) -> bool {
        self.engine.lock().map(|e| e.enabled()).unwrap_or(false)
    }
}

impl Drop for NativeGestureListener {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Convenience function matching the task description.
pub fn start_gesture_monitor(
    settings: Settings,
    callback: ActionCallback,
) -> Result<NativeGestureListener, String> {
    NativeGestureListener::start(settings, callback)
}

fn run_listener_loop(
    running: Arc<AtomicBool>,
    run_loop: Arc<AtomicPtr<std::ffi::c_void>>,
    engine: Arc<Mutex<GestureEngine>>,
    callback: ActionCallback,
) {
    // Poll for accessibility permissions quietly without popping modal dialogs on startup
    let mut logged_untrusted = false;
    while !is_accessibility_trusted(false) {
        if !logged_untrusted {
            eprintln!("[Pingloom] Process waiting for Accessibility permission.");
            logged_untrusted = true;
        }
        if !running.load(Ordering::Acquire) {
            return;
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    eprintln!("[Pingloom] Accessibility permission GRANTED. Attaching CGEventTap...");

    let events = vec![
        CGEventType::KeyDown,
        CGEventType::KeyUp,
        CGEventType::FlagsChanged,
        CGEventType::MouseMoved,
        CGEventType::LeftMouseDragged,
        CGEventType::RightMouseDragged,
        CGEventType::OtherMouseDragged,
        CGEventType::LeftMouseDown,
        CGEventType::LeftMouseUp,
        CGEventType::RightMouseDown,
        CGEventType::RightMouseUp,
        CGEventType::OtherMouseDown,
        CGEventType::OtherMouseUp,
    ];

    let current_origin = Arc::new(Mutex::new(None::<Point>));
    let tracking_pointer = Arc::new(AtomicBool::new(false));
    let start_instant = Instant::now();

    let cb_engine = Arc::clone(&engine);
    let cb_origin = Arc::clone(&current_origin);
    let cb_tracking = Arc::clone(&tracking_pointer);
    let cb_callback = Arc::clone(&callback);

    let tap_result = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::Default,
        events,
        move |_proxy, kind, event| {
            if matches!(kind, CGEventType::TapDisabledByTimeout) {
                let tap_ptr = TAP.load(Ordering::Acquire);
                if !tap_ptr.is_null() {
                    unsafe { CGEventTapEnable(tap_ptr.cast(), true) };
                }
                if let Ok(mut engine) = cb_engine.lock() {
                    engine.resync_key_states(key_down);
                }
                return CallbackResult::Keep;
            }

            if matches!(kind, CGEventType::TapDisabledByUserInput) {
                return CallbackResult::Keep;
            }

            // Fast-path pointer movement when not currently tracking a gesture
            let is_pointer_movement = matches!(
                kind,
                CGEventType::MouseMoved
                    | CGEventType::LeftMouseDragged
                    | CGEventType::RightMouseDragged
                    | CGEventType::OtherMouseDragged
            );
            if is_pointer_movement && !cb_tracking.load(Ordering::Relaxed) {
                return CallbackResult::Keep;
            }

            if event.get_integer_value_field(EventField::EVENT_SOURCE_USER_DATA) == MARKER
                || event.get_integer_value_field(EventField::EVENT_SOURCE_UNIX_PROCESS_ID) > 0
            {
                return CallbackResult::Keep;
            }

            let location = event.location();
            let point = Point::new(location.x.round() as i32, location.y.round() as i32);
            let time_ms = start_instant.elapsed().as_millis() as u64;

            let native = match kind {
                CGEventType::KeyDown | CGEventType::KeyUp => {
                    let code =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                    Some(if matches!(kind, CGEventType::KeyDown) {
                        InputEvent::KeyDown {
                            vk: vk(code),
                            injected: false,
                        }
                    } else {
                        InputEvent::KeyUp {
                            vk: vk(code),
                            injected: false,
                        }
                    })
                }
                CGEventType::FlagsChanged => {
                    let code =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                    if code == 57 {
                        // CapsLock handled separately
                        return CallbackResult::Keep;
                    }
                    let mut is_down = unsafe {
                        CGEventSourceKeyState(CGEventSourceStateID::HIDSystemState as i32, code)
                    };
                    // Use per-side NX_DEVICE*KEYMASK bits: FlagsChanged arrives before CGEventSourceKeyState updates.
                    let flags = event.get_flags().bits();
                    let mask = match code {
                        59 => Some(0x0001), // left Control
                        56 => Some(0x0002), // left Shift
                        60 => Some(0x0004), // right Shift
                        55 => Some(0x0008), // left Command
                        54 => Some(0x0010), // right Command
                        58 => Some(0x0020), // left Option
                        61 => Some(0x0040), // right Option
                        62 => Some(0x2000), // right Control
                        _ => None,
                    };
                    if let Some(m) = mask {
                        is_down = (flags & m) != 0;
                    }
                    Some(if is_down {
                        InputEvent::KeyDown {
                            vk: vk(code),
                            injected: false,
                        }
                    } else {
                        InputEvent::KeyUp {
                            vk: vk(code),
                            injected: false,
                        }
                    })
                }
                CGEventType::MouseMoved
                | CGEventType::LeftMouseDragged
                | CGEventType::RightMouseDragged
                | CGEventType::OtherMouseDragged => {
                    Some(InputEvent::PointerMove {
                        point,
                        time_ms,
                        injected: false,
                    })
                }
                _ => button(kind, event).map(|(button, down)| {
                    if down {
                        let is_game_check = cb_engine.lock().map(|e| e.settings().game_check).unwrap_or(false);
                        let fullscreen_app = if is_game_check { fullscreen_at(point) } else { false };
                        InputEvent::PointerDown {
                            button,
                            point,
                            time_ms,
                            injected: false,
                            fullscreen_app,
                            dpi_scale: 1.0,
                        }
                    } else {
                        InputEvent::PointerUp {
                            button,
                            point,
                            time_ms,
                            injected: false,
                        }
                    }
                }),
            };

            if let Some(event) = native {
                if let Ok(mut engine) = cb_engine.lock() {
                    if matches!(event, InputEvent::PointerDown { .. }) {
                        engine.resync_key_states(key_down);
                    }
                    let decision = engine.on_event(event);

                    for replay_input in decision.replay {
                        let _ = replay(replay_input);
                    }

                    for action in decision.actions {
                        let origin = match action {
                            Action::WheelOpen { origin, .. } => {
                                *cb_origin.lock().unwrap() = Some(origin);
                                Some(origin)
                            }
                            Action::Select { .. } | Action::Cancel => {
                                cb_origin.lock().unwrap().take()
                            }
                            _ => *cb_origin.lock().unwrap(),
                        };
                        cb_callback(action, origin, 1.0);
                    }

                    if decision.swallow {
                        cb_tracking.store(engine.is_tracking_pointer(), Ordering::Release);
                        return CallbackResult::Drop;
                    }
                    cb_tracking.store(engine.is_tracking_pointer(), Ordering::Release);
                }
            }

            CallbackResult::Keep
        },
    );

    let tap = match tap_result {
        Ok(t) => {
            eprintln!("[Pingloom] CGEventTap created successfully.");
            t
        }
        Err(e) => {
            eprintln!("[Pingloom] Failed to create CGEventTap: {:?}", e);
            return;
        }
    };

    let source = match tap.mach_port().create_runloop_source(0) {
        Ok(s) => s,
        Err(_) => return,
    };

    let current_rl = CFRunLoop::get_current();
    current_rl.add_source(&source, unsafe { kCFRunLoopCommonModes });
    run_loop.store(
        current_rl.as_concrete_TypeRef().cast(),
        Ordering::Release,
    );
    TAP.store(
        tap.mach_port().as_concrete_TypeRef().cast(),
        Ordering::Release,
    );
    tap.enable();

    while running.load(Ordering::Acquire) {
        CFRunLoop::run_in_mode(
            unsafe { kCFRunLoopDefaultMode },
            Duration::from_millis(100),
            false,
        );

        // Tick watchdog for timeouts
        let now_ms = start_instant.elapsed().as_millis() as u64;
        if let Ok(mut engine) = engine.lock() {
            let tick_decision = engine.tick(now_ms);
            tracking_pointer.store(engine.is_tracking_pointer(), Ordering::Release);
            for action in tick_decision.actions {
                let origin = match action {
                    Action::WheelOpen { origin, .. } => {
                        *current_origin.lock().unwrap() = Some(origin);
                        Some(origin)
                    }
                    Action::Select { .. } | Action::Cancel => {
                        current_origin.lock().unwrap().take()
                    }
                    _ => *current_origin.lock().unwrap(),
                };
                callback(action, origin, 1.0);
            }
        }
    }

    TAP.store(std::ptr::null_mut(), Ordering::Release);
    run_loop.store(std::ptr::null_mut(), Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn virtual_keys_round_trip() {
        for &(vk_val, native) in KEYS {
            assert_eq!(vk(native), vk_val);
            assert_eq!(code(vk_val), Some(native));
        }
        assert_eq!(code(0x12), Some(58));
        assert!(!supported_vk(0x14));
    }

    #[test]
    fn accessibility_check_does_not_panic() {
        // Calling check without prompt should return a boolean without panicking
        let _trusted = is_accessibility_trusted(false);
    }

    #[test]
    fn native_listener_lifecycle() {
        let settings = Settings::default();
        let callback: ActionCallback = Arc::new(|_action, _point, _scale| {});
        let mut listener = NativeGestureListener::start(settings, callback).expect("start listener");
        assert!(listener.is_running());
        listener.stop();
        assert!(!listener.is_running());
    }
}
