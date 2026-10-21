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

fn mb(bytes: u64) -> f64 {
    ((bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0
}

fn info_from(resident: u64, virtual_size: u64, footprint: u64, peak: u64) -> ProcessMemoryInfo {
    ProcessMemoryInfo {
        resident_size_bytes: resident,
        resident_size_mb: mb(resident),
        virtual_size_bytes: virtual_size,
        virtual_size_mb: mb(virtual_size),
        phys_footprint_bytes: footprint,
        phys_footprint_mb: mb(footprint),
        peak_phys_footprint_bytes: peak.max(footprint),
        peak_phys_footprint_mb: mb(peak.max(footprint)),
    }
}

#[cfg(target_os = "linux")]
mod linux_proc {
    unsafe extern "C" {
        fn malloc_trim(pad: usize) -> i32;
        fn getpagesize() -> i32;
    }

    fn status_kb(key: &str) -> Option<u64> {
        let text = std::fs::read_to_string("/proc/self/status").ok()?;
        text.lines()
            .find(|line| line.starts_with(key) && line[key.len()..].starts_with(':'))
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|value| value.parse::<u64>().ok())
    }

    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        // statm is pages: size resident shared text lib data dt.
        let page = unsafe { getpagesize() }.max(1) as u64;
        let fields: Vec<u64> = std::fs::read_to_string("/proc/self/statm")
            .map(|text| {
                text.split_whitespace()
                    .filter_map(|value| value.parse::<u64>().ok())
                    .collect()
            })
            .unwrap_or_default();
        let virtual_size = fields.first().copied().unwrap_or(0) * page;
        let resident = fields.get(1).copied().unwrap_or(0) * page;
        // Linux has no phys_footprint; RSS minus shared file pages is the nearest honest
        // equivalent of what the process alone is costing.
        let shared = fields.get(2).copied().unwrap_or(0) * page;
        let footprint = resident.saturating_sub(shared).max(1);
        let peak = status_kb("VmHWM").unwrap_or(0) * 1024;
        super::info_from(resident, virtual_size.max(resident), footprint, peak)
    }

    pub fn trim_memory_cache() -> usize {
        // malloc_trim answers whether it released anything, not how much.
        let before = get_memory_info().resident_size_bytes;
        if unsafe { malloc_trim(0) } != 1 {
            return 0;
        }
        before.saturating_sub(get_memory_info().resident_size_bytes) as usize
    }
}

#[cfg(target_os = "windows")]
mod windows_psapi {
    type Handle = isize;

    #[repr(C)]
    #[derive(Default)]
    struct ProcessMemoryCountersEx {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
        private_usage: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn K32GetProcessMemoryInfo(
            process: Handle,
            counters: *mut ProcessMemoryCountersEx,
            size: u32,
        ) -> i32;
        fn SetProcessWorkingSetSizeEx(
            process: Handle,
            minimum: usize,
            maximum: usize,
            flags: u32,
        ) -> i32;
    }

    fn counters() -> Option<ProcessMemoryCountersEx> {
        let mut counters = ProcessMemoryCountersEx {
            cb: std::mem::size_of::<ProcessMemoryCountersEx>() as u32,
            ..Default::default()
        };
        let ok = unsafe {
            K32GetProcessMemoryInfo(
                GetCurrentProcess(),
                &raw mut counters,
                std::mem::size_of::<ProcessMemoryCountersEx>() as u32,
            )
        };
        (ok != 0).then_some(counters)
    }

    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        let Some(counters) = counters() else {
            return super::info_from(0, 0, 0, 0);
        };
        let resident = counters.working_set_size as u64;
        // Private bytes is what Windows charges this process, the closest reading to the
        // physical footprint Activity Monitor reports on macOS.
        let footprint = counters.private_usage as u64;
        super::info_from(
            resident,
            (counters.pagefile_usage as u64).max(resident),
            footprint,
            counters.peak_working_set_size as u64,
        )
    }

    pub fn trim_memory_cache() -> usize {
        let before = get_memory_info().resident_size_bytes;
        // (-1, -1) asks Windows to trim this process back to its minimum working set.
        let ok = unsafe {
            SetProcessWorkingSetSizeEx(GetCurrentProcess(), usize::MAX, usize::MAX, 0)
        };
        if ok == 0 {
            return 0;
        }
        before.saturating_sub(get_memory_info().resident_size_bytes) as usize
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
mod fallback {
    pub fn get_memory_info() -> super::ProcessMemoryInfo {
        super::info_from(0, 0, 0, 0)
    }

    pub fn trim_memory_cache() -> usize {
        0
    }
}

pub fn get_memory_info() -> ProcessMemoryInfo {
    #[cfg(target_os = "macos")]
    { macos_mach::get_memory_info() }
    #[cfg(target_os = "linux")]
    { linux_proc::get_memory_info() }
    #[cfg(target_os = "windows")]
    { windows_psapi::get_memory_info() }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { fallback::get_memory_info() }
}

pub fn trim_memory_cache() -> usize {
    #[cfg(target_os = "macos")]
    { macos_mach::trim_memory_cache() }
    #[cfg(target_os = "linux")]
    { linux_proc::trim_memory_cache() }
    #[cfg(target_os = "windows")]
    { windows_psapi::trim_memory_cache() }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { fallback::trim_memory_cache() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_memory_info_returns_valid_metrics() {
        // These invariants used to be asserted on macOS only, because every other
        // platform returned a stub of zeroes. They hold everywhere now.
        let mem = get_memory_info();
        assert!(mem.resident_size_bytes > 0, "resident size must be real");
        assert!(mem.resident_size_mb > 0.0);
        assert!(
            mem.virtual_size_bytes >= mem.resident_size_bytes,
            "virtual size should be >= resident size"
        );
        assert!(mem.phys_footprint_bytes > 0, "physical footprint must be real");
        assert!(mem.phys_footprint_mb > 0.0);
        assert!(
            mem.peak_phys_footprint_bytes >= mem.phys_footprint_bytes,
            "peak physical footprint should be >= current"
        );
    }

    #[test]
    fn test_trim_memory_cache_executes_safely() {
        // Safe invocation across memory zones
        let _freed = trim_memory_cache();
        let mem = get_memory_info();
        assert!(mem.resident_size_bytes > 0);
    }
}
