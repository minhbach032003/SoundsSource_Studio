pub mod cleaner_policy;
pub mod device;
pub mod input_blocker;
pub mod memory;
pub mod memory_cleaner;
pub mod metrics;
pub mod pet_notifications;
pub mod platform;
pub mod process;
pub mod spotify;

pub use cleaner_policy::{risk_for, risk_note, CleanRisk};
pub use device::AudioDevice;
pub use input_blocker::{
    should_suppress_event, InputBlocker, KEYCODE_ESCAPE, KEYCODE_F3, KEYCODE_GRAVE, KEYCODE_H,
    KEYCODE_M, KEYCODE_Q, KEYCODE_TAB, KEYCODE_W, MASK_COMMAND, MASK_SHIFT,
};
pub mod ring_buffer;
pub mod tap;

pub use memory::{
    AutoCleanDecision, AutoCleanPolicy, AutoCleanTrigger, MemoryArea, MemoryAreaOutcome,
    MemoryCleanReport, MemorySegment, MemorySnapshot,
};
pub use memory_cleaner::{MemoryAutoStatus, MemoryCleaner, MemoryRunRecord};
pub use metrics::{get_memory_info, trim_memory_cache, ProcessMemoryInfo};
pub use process::AudioProcess;
pub use ring_buffer::{RingBuffer, SharedRingBuffer};
pub use tap::{AudioStreamBasicDescription, ProcessTap};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cross_platform_device_enumeration() {
        let devices = AudioDevice::enumerate_system_devices();
        assert!(!devices.is_empty(), "Should enumerate output devices on any platform");

        let inputs = AudioDevice::enumerate_system_input_devices();
        assert!(!inputs.is_empty(), "Should enumerate input devices on any platform");
    }

    #[test]
    fn test_cross_platform_volume_control() {
        let orig = AudioDevice::get_master_volume();
        assert!(orig >= 0.0 && orig <= 1.0);

        let _ = AudioDevice::set_master_volume(0.8);
        let _ = AudioDevice::set_master_mute(false);
        assert!(!AudioDevice::get_master_mute());

        // Restore
        let _ = AudioDevice::set_master_volume(orig);
    }

    #[test]
    fn test_cross_platform_process_enumeration() {
        let procs = AudioProcess::enumerate_system_processes();
        // Check structure
        for p in procs {
            assert!(p.pid >= 0);
            assert!(!p.name.is_empty());
        }
    }

    #[test]
    fn test_fallback_driver_behavior() {
        use crate::platform::fallback;
        let devs = fallback::enumerate_system_devices();
        assert_eq!(devs.len(), 2);
        assert_eq!(devs[0].name, "Default System Output");

        let _ = fallback::set_master_volume(0.75);
        assert_eq!(fallback::get_master_volume(), 0.75);
    }

    #[test]
    fn test_windows_driver_behavior() {
        use crate::platform::windows;
        let devs = windows::enumerate_system_devices();
        assert!(!devs.is_empty());
        let _ = windows::set_master_volume(0.9);
        assert_eq!(windows::get_master_volume(), 0.9);
    }

    #[test]
    fn test_linux_driver_behavior() {
        use crate::platform::linux;
        let devs = linux::enumerate_system_devices();
        assert!(!devs.is_empty());
    }
}
