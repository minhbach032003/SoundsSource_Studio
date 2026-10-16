//! Read-only macOS process + notification ABI link regression.
//! Run: cargo run -p sound-core --release --example process_link_check
//! Keep the workspace release LTO settings: cargo check cannot catch linker symbol conflicts.
fn main() {
    let processes = sound_core::AudioProcess::enumerate_system_processes();
    println!("Enumerated {} audio-capable processes", processes.len());
    // Poll the real notification boundary once to retain its ObjC runtime calls in the LTO unit.
    // A bare CLI reports unavailable; this never requests permission or delivers notifications.
    let mut status = std::pin::pin!(sound_core::pet_notifications::status());
    let mut context = std::task::Context::from_waker(std::task::Waker::noop());
    println!("Notification status: {:?}", std::future::Future::poll(status.as_mut(), &mut context));
}
