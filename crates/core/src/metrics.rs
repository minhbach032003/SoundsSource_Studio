use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessMemoryInfo {
    pub resident_size_bytes: u64,
    pub resident_size_mb: f64,
    pub virtual_size_bytes: u64,
    pub virtual_size_mb: f64,
}

#[cfg(target_os = "macos")]
mod macos_mach {
    use std::ffi::c_void;

    type MachPort = u32;
    type KernReturn = i32;

    const MACH_TASK_BASIC_INFO: i32 = 20;
    const MACH_TASK_BASIC_INFO_COUNT: u32 =
        (std::mem::size_of::<MachTaskBasicInfo>() / 4) as u32;

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

    unsafe extern "C" {
        fn mach_task_self() -> MachPort;
        fn task_info(
            target_task: MachPort,
            flavor: i32,
            task_info_out: *mut MachTaskBasicInfo,
            task_info_out_cnt: *mut u32,
        ) -> KernReturn;
        fn malloc_zone_pressure_relief(zone: *mut c_void, goal: usize) -> usize;
    }

    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        let mut info = MachTaskBasicInfo::default();
        let mut count = MACH_TASK_BASIC_INFO_COUNT;

        let kr = unsafe {
            task_info(
                mach_task_self(),
                MACH_TASK_BASIC_INFO,
                &raw mut info,
                &raw mut count,
            )
        };

        if kr == 0 {
            let res_bytes = info.resident_size;
            let virt_bytes = info.virtual_size;
            super::ProcessMemoryInfo {
                resident_size_bytes: res_bytes,
                resident_size_mb: ((res_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
                virtual_size_bytes: virt_bytes,
                virtual_size_mb: ((virt_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0,
            }
        } else {
            super::ProcessMemoryInfo {
                resident_size_bytes: 0,
                resident_size_mb: 0.0,
                virtual_size_bytes: 0,
                virtual_size_mb: 0.0,
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
