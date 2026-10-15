use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessMemoryInfo {
    pub resident_size_bytes: u64,
    pub resident_size_mb: f64,
    pub virtual_size_bytes: u64,
    pub virtual_size_mb: f64,
    pub phys_footprint_bytes: u64,
    pub phys_footprint_mb: f64,
    pub peak_phys_footprint_bytes: u64,
    pub peak_phys_footprint_mb: f64,
}

#[cfg(target_os = "macos")]
mod macos_mach {
    use std::ffi::c_void;

    type MachPort = u32;
    type KernReturn = i32;

    const MACH_TASK_BASIC_INFO: i32 = 20;
    const MACH_TASK_BASIC_INFO_COUNT: u32 =
        (std::mem::size_of::<MachTaskBasicInfo>() / 4) as u32;

    const TASK_VM_INFO: i32 = 22;
    const TASK_VM_INFO_COUNT: u32 =
        (std::mem::size_of::<TaskVmInfo>() / 4) as u32;

    #[repr(C)]
    #[derive(Default)]
    struct TimeValue {
        _seconds: i32,
        _microseconds: i32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        _resident_size_max: u64,
        _user_time: TimeValue,
        _system_time: TimeValue,
        _policy: i32,
        _suspend_count: i32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct TaskVmInfo {
        virtual_size: u64,
        region_count: i32,
        page_size: i32,
        resident_size: u64,
        resident_size_peak: u64,
        device: u64,
        device_peak: u64,
        internal: u64,
        internal_peak: u64,
        external: u64,
        external_peak: u64,
        reusable: u64,
        reusable_peak: u64,
        purgeable_volatile_pmap: u64,
        purgeable_volatile_resident: u64,
        purgeable_volatile_virtual: u64,
        compressed: u64,
        compressed_peak: u64,
        compressed_lifetime: u64,
        phys_footprint: u64,
        min_address: u64,
        max_address: u64,
        ledger_phys_footprint_peak: i64,
        ledger_purgeable_nonvolatile: i64,
        ledger_purgeable_novolatile_compressed: i64,
        ledger_purgeable_volatile: i64,
        ledger_purgeable_volatile_compressed: i64,
        ledger_tag_network_nonvolatile: i64,
        ledger_tag_network_nonvolatile_compressed: i64,
        ledger_tag_network_volatile: i64,
        ledger_tag_network_volatile_compressed: i64,
        ledger_tag_media_footprint: i64,
        ledger_tag_media_footprint_compressed: i64,
        ledger_tag_media_nofootprint: i64,
        ledger_tag_media_nofootprint_compressed: i64,
        ledger_tag_graphics_footprint: i64,
        ledger_tag_graphics_footprint_compressed: i64,
        ledger_tag_graphics_nofootprint: i64,
        ledger_tag_graphics_nofootprint_compressed: i64,
        ledger_tag_neural_footprint: i64,
        ledger_tag_neural_footprint_compressed: i64,
        ledger_tag_neural_nofootprint: i64,
        ledger_tag_neural_nofootprint_compressed: i64,
        limit_bytes_remaining: u64,
        decompressions: i32,
        _pad: i32,
        ledger_swapins: i64,
        ledger_tag_neural_nofootprint_total: i64,
        ledger_tag_neural_nofootprint_peak: i64,
    }

    unsafe extern "C" {
        fn mach_task_self() -> MachPort;
        fn task_info(
            target_task: MachPort,
            flavor: i32,
            task_info_out: *mut c_void,
            task_info_out_cnt: *mut u32,
        ) -> KernReturn;
        fn malloc_zone_pressure_relief(zone: *mut c_void, goal: usize) -> usize;
    }

    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        // Try TASK_VM_INFO first (provides exact physical footprint used by Activity Monitor)
        let mut vm_info = TaskVmInfo::default();
        let mut vm_count = TASK_VM_INFO_COUNT;

        let kr_vm = unsafe {
            task_info(
                mach_task_self(),
                TASK_VM_INFO,
                (&raw mut vm_info).cast::<c_void>(),
                &raw mut vm_count,
            )
        };

        if kr_vm == 0 && vm_info.phys_footprint > 0 {
            let res_bytes = vm_info.resident_size;
            let virt_bytes = vm_info.virtual_size;
            let phys_bytes = vm_info.phys_footprint;
            let peak_phys_bytes = if vm_info.ledger_phys_footprint_peak > 0 {
                vm_info.ledger_phys_footprint_peak as u64
            } else if vm_info.resident_size_peak > 0 {
                vm_info.resident_size_peak
            } else {
                phys_bytes
            };

            return super::ProcessMemoryInfo {
                resident_size_bytes: res_bytes,
                resident_size_mb: ((res_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                virtual_size_bytes: virt_bytes,
                virtual_size_mb: ((virt_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                phys_footprint_bytes: phys_bytes,
                phys_footprint_mb: ((phys_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                peak_phys_footprint_bytes: peak_phys_bytes,
                peak_phys_footprint_mb: ((peak_phys_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
            };
        }

        // Fallback to MACH_TASK_BASIC_INFO
        let mut basic_info = MachTaskBasicInfo::default();
        let mut count = MACH_TASK_BASIC_INFO_COUNT;

        let kr = unsafe {
            task_info(
                mach_task_self(),
                MACH_TASK_BASIC_INFO,
                (&raw mut basic_info).cast::<c_void>(),
                &raw mut count,
            )
        };

        if kr == 0 {
            let res_bytes = basic_info.resident_size;
            let virt_bytes = basic_info.virtual_size;
            super::ProcessMemoryInfo {
                resident_size_bytes: res_bytes,
                resident_size_mb: ((res_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                virtual_size_bytes: virt_bytes,
                virtual_size_mb: ((virt_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                phys_footprint_bytes: res_bytes,
                phys_footprint_mb: ((res_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                peak_phys_footprint_bytes: res_bytes,
                peak_phys_footprint_mb: ((res_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
            }
        } else {
            super::ProcessMemoryInfo {
                resident_size_bytes: 0,
                resident_size_mb: 0.0,
                virtual_size_bytes: 0,
                virtual_size_mb: 0.0,
                phys_footprint_bytes: 0,
                phys_footprint_mb: 0.0,
                peak_phys_footprint_bytes: 0,
                peak_phys_footprint_mb: 0.0,
            }
        }
    }

    pub fn trim_memory_cache() -> usize {
        unsafe { malloc_zone_pressure_relief(std::ptr::null_mut(), 0) }
    }
}

#[cfg(not(target_os = "macos"))]
mod fallback {
    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        super::ProcessMemoryInfo {
            resident_size_bytes: 0,
            resident_size_mb: 0.0,
            virtual_size_bytes: 0,
            virtual_size_mb: 0.0,
            phys_footprint_bytes: 0,
            phys_footprint_mb: 0.0,
            peak_phys_footprint_bytes: 0,
            peak_phys_footprint_mb: 0.0,
        }
    }

    pub fn trim_memory_cache() -> usize {
        0
    }
}

pub fn get_memory_info() -> ProcessMemoryInfo {
    #[cfg(target_os = "macos")]
    {
        macos_mach::get_memory_info()
    }
    #[cfg(not(target_os = "macos"))]
    {
        fallback::get_memory_info()
    }
}

pub fn trim_memory_cache() -> usize {
    #[cfg(target_os = "macos")]
    {
        macos_mach::trim_memory_cache()
    }
    #[cfg(not(target_os = "macos"))]
    {
        fallback::trim_memory_cache()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_memory_info_returns_valid_metrics() {
        let mem = get_memory_info();
        #[cfg(target_os = "macos")]
        {
            assert!(
                mem.resident_size_bytes > 0,
                "Resident size should be greater than 0 on macOS"
            );
            assert!(
                mem.resident_size_mb > 0.0,
                "Resident size in MB should be greater than 0"
            );
            assert!(
                mem.virtual_size_bytes >= mem.resident_size_bytes,
                "Virtual size should be >= resident size"
            );
            assert!(
                mem.phys_footprint_bytes > 0,
                "Physical footprint should be greater than 0 on macOS"
            );
            assert!(
                mem.phys_footprint_mb > 0.0,
                "Physical footprint in MB should be greater than 0"
            );
            assert!(
                mem.peak_phys_footprint_bytes >= mem.phys_footprint_bytes,
                "Peak physical footprint should be >= current physical footprint"
            );
        }
    }

    #[test]
    fn test_trim_memory_cache_executes_safely() {
        // Safe invocation across memory zones
        let _freed = trim_memory_cache();
        let mem = get_memory_info();
        assert!(mem.resident_size_bytes > 0);
    }
}
