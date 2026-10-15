#[cfg(target_os = "macos")]
pub mod macos;
pub mod windows;
pub mod linux;
pub mod fallback;

#[cfg(target_os = "macos")]
pub use macos as current;

#[cfg(target_os = "windows")]
pub use windows as current;

#[cfg(target_os = "linux")]
pub use linux as current;

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub use fallback as current;
