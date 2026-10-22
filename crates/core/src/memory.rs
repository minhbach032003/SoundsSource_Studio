//! Cross-platform physical memory reporting and reclamation.
//!
//! The three platforms do not offer the same levers, and pretending otherwise is how
//! a memory cleaner ends up with buttons that quietly do nothing:
//!
//! * **Windows** keeps page lists the kernel can be told to drop — standby, modified,
//!   combined — through `NtSetSystemInformation`. This is what WinMemoryCleaner drives,
//!   and it needs `SeProfileSingleProcessPrivilege`, so it works only when the app runs
//!   elevated.
//! * **macOS** exposes no equivalent. The only honest levers are this process's own
//!   allocator and `purge`, which asks the kernel to drop the file cache and needs root.
//! * **Linux** has `malloc_trim` and `/proc/sys/vm/drop_caches`, the latter root-only.
//!
//! So [`areas`] is platform-specific and every entry states whether this machine can run
//! it, and whether running it may put an authentication dialog on screen. The scheduler
//! in [`decide`] is pure, so the policy that matters — when to reclaim, and how often at
//! most — is the same everywhere and testable without touching the kernel.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// This process's own allocator caches. Always available, never needs privileges.
pub const AREA_APP_WORKING_SET: &str = "app_working_set";
/// The OS file cache: `purge` on macOS, `drop_caches` on Linux.
pub const AREA_FILE_CACHE: &str = "file_cache";
/// Windows: trim every accessible process's working set.
pub const AREA_WORKING_SETS: &str = "working_sets";
/// Windows: write modified pages out so they become reusable.
pub const AREA_MODIFIED_PAGE_LIST: &str = "modified_page_list";
/// Windows: drop the standby list.
pub const AREA_STANDBY_LIST: &str = "standby_list";
/// Windows: drop only the low-priority part of the standby list.
pub const AREA_STANDBY_LIST_LOW: &str = "standby_list_low";
/// Windows: combine identical pages. Effective but CPU-heavy.
pub const AREA_COMBINED_PAGE_LIST: &str = "combined_page_list";

/// One named part of physical memory, as that platform describes it. The UI renders
/// whatever comes back rather than assuming a fixed set of bars.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemorySegment {
    pub id: String,
    pub label: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct MemorySnapshot {
    pub total_bytes: u64,
    /// What the OS says it can still hand out without swapping.
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub used_percent: f64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    /// The part a clean could plausibly give back on this platform.
    pub reclaimable_bytes: u64,
    pub segments: Vec<MemorySegment>,
    pub captured_at_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryArea {
    pub id: String,
    pub name: String,
    pub description: String,
    /// False when this platform has no such lever; the UI greys it out and says why.
    pub supported: bool,
    /// May fail without administrator / root.
    pub needs_privileges: bool,
    /// Running it can put an authentication dialog on screen.
    pub prompts_for_credentials: bool,
    /// Safe for the scheduler to run with nobody watching.
    pub background_safe: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryAreaOutcome {
    pub id: String,
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryCleanReport {
    pub before: MemorySnapshot,
    pub after: MemorySnapshot,
    /// Signed on purpose: memory can legitimately grow during a clean, and reporting a
    /// clamped zero would be a nicer number than the truth.
    pub freed_bytes: i64,
    pub outcomes: Vec<MemoryAreaOutcome>,
    pub duration_ms: u64,
}

// ============================================================================
// Scheduling policy — pure, so the part that decides when to touch the kernel is
// testable on any machine.
// ============================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoCleanPolicy {
    pub enabled: bool,
    pub areas: Vec<String>,
    /// Reclaim on a fixed cadence.
    pub every_minutes: Option<u32>,
    /// Reclaim when memory use crosses this percentage.
    pub when_used_percent_above: Option<f64>,
    /// Floor between two runs, whichever trigger fired. Without it a machine sitting
    /// above the threshold would be cleaned on every poll.
    pub cooldown_minutes: u32,
}

impl Default for AutoCleanPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            areas: default_background_areas(),
            every_minutes: None,
            when_used_percent_above: Some(85.0),
            cooldown_minutes: 10,
        }
    }
}

impl AutoCleanPolicy {
    /// Clamps values the UI could otherwise send in a state that makes the scheduler
    /// thrash: a zero cooldown, a 0% threshold, an unknown or interactive area.
    pub fn sanitized(&self) -> Self {
        let supported: Vec<MemoryArea> = areas();
        let areas: Vec<String> = self
            .areas
            .iter()
            .filter(|id| {
                supported
                    .iter()
                    .any(|a| &&a.id == id && a.supported && a.background_safe)
            })
            .cloned()
            .collect();
        Self {
            enabled: self.enabled,
            areas,
            every_minutes: self.every_minutes.map(|m| m.clamp(1, 7 * 24 * 60)),
            when_used_percent_above: self
                .when_used_percent_above
                .filter(|p| p.is_finite())
                .map(|p| p.clamp(1.0, 99.0)),
            cooldown_minutes: self.cooldown_minutes.clamp(1, 24 * 60),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AutoCleanTrigger {
    /// The configured cadence came round.
    Interval,
    /// Memory use crossed the configured percentage.
    UsageAbove { used_percent: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AutoCleanDecision {
    /// Nothing to do, and why — the UI shows this verbatim so the feature is never a
    /// toggle with no observable behaviour.
    Idle { reason: String },
    Run { trigger: AutoCleanTrigger },
}

impl AutoCleanDecision {
    pub fn should_run(&self) -> bool {
        matches!(self, Self::Run { .. })
    }
}

fn idle(reason: &str) -> AutoCleanDecision {
    AutoCleanDecision::Idle {
        reason: reason.to_string(),
    }
}

/// Decides whether the scheduler should reclaim now. `since_last_run` is `None` when it
/// has not run yet this session, which satisfies the cooldown and arms the interval.
pub fn decide(
    policy: &AutoCleanPolicy,
    snapshot: &MemorySnapshot,
    since_last_run: Option<Duration>,
) -> AutoCleanDecision {
    if !policy.enabled {
        return idle("Auto clean is off");
    }
    if policy.areas.is_empty() {
        return idle("No memory area is selected");
    }
    if policy.every_minutes.is_none() && policy.when_used_percent_above.is_none() {
        return idle("No trigger is configured");
    }
    let cooldown = Duration::from_secs(u64::from(policy.cooldown_minutes.max(1)) * 60);
    if let Some(elapsed) = since_last_run {
        if elapsed < cooldown {
            let left = (cooldown - elapsed).as_secs() / 60 + 1;
            return AutoCleanDecision::Idle {
                reason: format!("Cooling down for another {left} min"),
            };
        }
    }
    // The threshold is the reason the user turned this on, so it wins over the cadence.
    if let Some(limit) = policy.when_used_percent_above {
        if snapshot.used_percent >= limit {
            return AutoCleanDecision::Run {
                trigger: AutoCleanTrigger::UsageAbove {
                    used_percent: snapshot.used_percent,
                },
            };
        }
    }
    if let Some(minutes) = policy.every_minutes {
        let due = Duration::from_secs(u64::from(minutes.max(1)) * 60);
        if since_last_run.is_none_or(|elapsed| elapsed >= due) {
            return AutoCleanDecision::Run {
                trigger: AutoCleanTrigger::Interval,
            };
        }
    }
    idle("Memory is within the configured limits")
}

/// What the scheduler selects when the user has never chosen: everything this platform
/// can do unattended.
pub fn default_background_areas() -> Vec<String> {
    areas()
        .into_iter()
        .filter(|a| a.supported && a.background_safe)
        .map(|a| a.id)
        .collect()
}

// ============================================================================
// Public entry points
// ============================================================================

pub fn snapshot() -> MemorySnapshot {
    let mut snap = imp::snapshot();
    snap.captured_at_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if snap.total_bytes > 0 {
        snap.used_percent =
            ((snap.used_bytes as f64 / snap.total_bytes as f64) * 1000.0).round() / 10.0;
    }
    snap
}

pub fn areas() -> Vec<MemoryArea> {
    imp::areas()
}

/// Runs the requested areas in the order this platform lists them, so a clean always
/// flushes before it purges rather than in whatever order the UI sent.
///
/// `allow_prompt` gates the areas that can put an authentication dialog on screen; the
/// scheduler passes false so a background run never interrupts anyone.
pub fn clean(area_ids: &[String], allow_prompt: bool) -> MemoryCleanReport {
    let start = std::time::Instant::now();
    let before = snapshot();
    let catalog = areas();
    let mut outcomes = Vec::new();

    for area in catalog.iter().filter(|a| area_ids.iter().any(|id| id == &a.id)) {
        let outcome = if !area.supported {
            MemoryAreaOutcome {
                id: area.id.clone(),
                name: area.name.clone(),
                ok: false,
                detail: format!("{} is not available on this system", area.name),
            }
        } else if area.prompts_for_credentials && !allow_prompt {
            MemoryAreaOutcome {
                id: area.id.clone(),
                name: area.name.clone(),
                ok: false,
                detail: "Skipped: it would ask for an administrator password".into(),
            }
        } else {
            match imp::run_area(&area.id, allow_prompt) {
                Ok(detail) => MemoryAreaOutcome {
                    id: area.id.clone(),
                    name: area.name.clone(),
                    ok: true,
                    detail,
                },
                Err(detail) => MemoryAreaOutcome {
                    id: area.id.clone(),
                    name: area.name.clone(),
                    ok: false,
                    detail,
                },
            }
        };
        outcomes.push(outcome);
    }

    for id in area_ids {
        if !catalog.iter().any(|a| &a.id == id) {
            outcomes.push(MemoryAreaOutcome {
                id: id.clone(),
                name: id.clone(),
                ok: false,
                detail: "Unknown memory area".into(),
            });
        }
    }

    let after = snapshot();
    MemoryCleanReport {
        freed_bytes: after.available_bytes as i64 - before.available_bytes as i64,
        before,
        after,
        outcomes,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

// ============================================================================
// Shared helpers for the platform backends
// ============================================================================

fn base_snapshot() -> MemorySnapshot {
    use sysinfo::{MemoryRefreshKind, RefreshKind, System};
    let sys = System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::everything()),
    );
    let total = sys.total_memory();
    let available = sys.available_memory();
    MemorySnapshot {
        total_bytes: total,
        available_bytes: available,
        used_bytes: total.saturating_sub(available),
        used_percent: 0.0,
        swap_total_bytes: sys.total_swap(),
        swap_used_bytes: sys.used_swap(),
        reclaimable_bytes: 0,
        segments: Vec::new(),
        captured_at_secs: 0,
    }
}

fn segment(id: &str, label: &str, bytes: u64) -> MemorySegment {
    MemorySegment {
        id: id.to_string(),
        label: label.to_string(),
        bytes,
    }
}

// ============================================================================
// macOS
// ============================================================================

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::process::Command;

    type MachPort = u32;
    const HOST_VM_INFO64: i32 = 4;
    const HOST_VM_INFO64_COUNT: u32 = (std::mem::size_of::<VmStatistics64>() / 4) as u32;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct VmStatistics64 {
        free_count: u32,
        active_count: u32,
        inactive_count: u32,
        wire_count: u32,
        zero_fill_count: u64,
        reactivations: u64,
        pageins: u64,
        pageouts: u64,
        faults: u64,
        cow_faults: u64,
        lookups: u64,
        hits: u64,
        purges: u64,
        purgeable_count: u32,
        speculative_count: u32,
        decompressions: u64,
        compressions: u64,
        swapins: u64,
        swapouts: u64,
        compressor_page_count: u32,
        throttled_count: u32,
        external_page_count: u32,
        internal_page_count: u32,
        total_uncompressed_pages_in_compressor: u64,
    }

    unsafe extern "C" {
        fn mach_host_self() -> MachPort;
        fn host_statistics64(host: MachPort, flavor: i32, info: *mut i32, count: *mut u32) -> i32;
        fn host_page_size(host: MachPort, out: *mut usize) -> i32;
    }

    fn vm_stats() -> Option<(VmStatistics64, u64)> {
        let mut stats = VmStatistics64::default();
        let mut count = HOST_VM_INFO64_COUNT;
        let mut page_size: usize = 0;
        let host = unsafe { mach_host_self() };
        let kr = unsafe {
            host_statistics64(
                host,
                HOST_VM_INFO64,
                (&raw mut stats).cast::<i32>(),
                &raw mut count,
            )
        };
        if kr != 0 {
            return None;
        }
        if unsafe { host_page_size(host, &raw mut page_size) } != 0 || page_size == 0 {
            page_size = 4096;
        }
        Some((stats, page_size as u64))
    }

    pub fn snapshot() -> MemorySnapshot {
        let mut snap = base_snapshot();
        let Some((stats, page)) = vm_stats() else {
            return snap;
        };
        let wired = u64::from(stats.wire_count) * page;
        let compressed = u64::from(stats.compressor_page_count) * page;
        let file_backed = u64::from(stats.external_page_count) * page;
        let app = u64::from(stats.internal_page_count) * page;
        let purgeable = u64::from(stats.purgeable_count) * page;
        let free = u64::from(stats.free_count.saturating_sub(stats.speculative_count)) * page;

        // `purge` drops cached file pages and purgeable objects; nothing else is on offer.
        snap.reclaimable_bytes = file_backed.saturating_add(purgeable);
        snap.segments = vec![
            segment("app", "App memory", app.saturating_sub(purgeable)),
            segment("wired", "Wired", wired),
            segment("compressed", "Compressed", compressed),
            segment("file_cache", "Cached files", file_backed),
            segment("purgeable", "Purgeable", purgeable),
            segment("free", "Free", free),
        ];
        snap
    }

    fn can_purge_without_prompt() -> bool {
        // Test if unprivileged purge works, or if passwordless sudo purge is configured.
        if Command::new("/usr/sbin/purge").status().map(|s| s.success()).unwrap_or(false) {
            return true;
        }
        Command::new("sudo")
            .args(["-n", "/usr/sbin/purge"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    pub fn areas() -> Vec<MemoryArea> {
        let passwordless = can_purge_without_prompt();
        vec![
            MemoryArea {
                id: AREA_APP_WORKING_SET.into(),
                name: "App working set".into(),
                description: "Returns this app's own allocator caches to the system.".into(),
                supported: true,
                needs_privileges: false,
                prompts_for_credentials: false,
                background_safe: true,
            },
            MemoryArea {
                id: AREA_FILE_CACHE.into(),
                name: "Cached files & purgeable pages".into(),
                description: if passwordless {
                    "Runs the system `purge`, which drops the disk cache (configured for background execution)."
                        .into()
                } else {
                    "Runs the system `purge`, which drops the disk cache. macOS requires an \
                     administrator for this, so it asks for your password."
                        .into()
                },
                supported: true,
                needs_privileges: !passwordless,
                prompts_for_credentials: !passwordless,
                background_safe: passwordless,
            },
        ]
    }

    pub fn run_area(id: &str, allow_prompt: bool) -> Result<String, String> {
        match id {
            AREA_APP_WORKING_SET => {
                let freed = crate::metrics::trim_memory_cache();
                Ok(format!(
                    "Allocator returned {} KB to the system",
                    freed / 1024
                ))
            }
            AREA_FILE_CACHE => {
                // Try unprivileged first: asking for a password when it was not needed is
                // its own kind of broken.
                if let Ok(status) = Command::new("/usr/sbin/purge").status() {
                    if status.success() {
                        return Ok("Disk cache purged".into());
                    }
                }
                // Check if passwordless sudo is available (e.g. via sudoers NOPASSWD)
                if let Ok(status) = Command::new("sudo").args(["-n", "/usr/sbin/purge"]).status() {
                    if status.success() {
                        return Ok("Disk cache purged via system privileges".into());
                    }
                }
                if !allow_prompt {
                    return Err("`purge` needs an administrator and prompting is disabled".into());
                }
                let script = "do shell script \"/usr/sbin/purge\" with administrator privileges";
                match Command::new("/usr/bin/osascript").args(["-e", script]).output() {
                    Ok(out) if out.status.success() => {
                        Ok("Disk cache purged with administrator rights".into())
                    }
                    Ok(out) => {
                        let err = String::from_utf8_lossy(&out.stderr);
                        if err.contains("-128") {
                            Err("Cancelled at the password prompt".into())
                        } else {
                            Err(format!("`purge` failed: {}", err.trim()))
                        }
                    }
                    Err(e) => Err(format!("Could not run `purge`: {e}")),
                }
            }
            _ => Err("Unknown memory area".into()),
        }
    }
}

// ============================================================================
// Windows
// ============================================================================

#[cfg(target_os = "windows")]
mod imp {
    use super::*;
    use std::ffi::c_void;

    type NtStatus = i32;
    type Handle = isize;

    const SYSTEM_MEMORY_LIST_INFORMATION: i32 = 80;
    const SYSTEM_COMBINE_PHYSICAL_MEMORY_INFORMATION: i32 = 130;

    // SYSTEM_MEMORY_LIST_COMMAND
    const MEMORY_EMPTY_WORKING_SETS: i32 = 2;
    const MEMORY_FLUSH_MODIFIED_LIST: i32 = 3;
    const MEMORY_PURGE_STANDBY_LIST: i32 = 4;
    const MEMORY_PURGE_LOW_PRIORITY_STANDBY_LIST: i32 = 5;

    const TOKEN_QUERY: u32 = 0x0008;
    const TOKEN_ADJUST_PRIVILEGES: u32 = 0x0020;
    const SE_PRIVILEGE_ENABLED: u32 = 0x0002;
    const ERROR_NOT_ALL_ASSIGNED: u32 = 1300;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct Luid {
        low_part: u32,
        high_part: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct LuidAndAttributes {
        luid: Luid,
        attributes: u32,
    }

    #[repr(C)]
    struct TokenPrivileges {
        privilege_count: u32,
        privileges: [LuidAndAttributes; 1],
    }

    #[repr(C)]
    #[derive(Default)]
    struct SystemMemoryListInformation {
        zero_page_count: usize,
        free_page_count: usize,
        modified_page_count: usize,
        modified_no_write_page_count: usize,
        bad_page_count: usize,
        page_count_by_priority: [usize; 8],
        repurposed_pages_by_priority: [usize; 8],
        modified_page_count_page_file: usize,
    }

    #[repr(C)]
    #[derive(Default)]
    struct MemoryCombineInformationEx {
        handle: Handle,
        pages_combined: usize,
        flags: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct SystemInfo {
        processor_architecture: u16,
        reserved: u16,
        page_size: u32,
        minimum_application_address: usize,
        maximum_application_address: usize,
        active_processor_mask: usize,
        number_of_processors: u32,
        processor_type: u32,
        allocation_granularity: u32,
        processor_level: u16,
        processor_revision: u16,
    }

    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtSetSystemInformation(class: i32, info: *mut c_void, length: u32) -> NtStatus;
        fn NtQuerySystemInformation(
            class: i32,
            info: *mut c_void,
            length: u32,
            returned: *mut u32,
        ) -> NtStatus;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn CloseHandle(handle: Handle) -> i32;
        fn GetLastError() -> u32;
        fn GetNativeSystemInfo(info: *mut SystemInfo);
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn OpenProcessToken(process: Handle, access: u32, token: *mut Handle) -> i32;
        fn LookupPrivilegeValueW(system: *const u16, name: *const u16, luid: *mut Luid) -> i32;
        fn AdjustTokenPrivileges(
            token: Handle,
            disable_all: i32,
            new_state: *const TokenPrivileges,
            buffer_length: u32,
            previous: *mut c_void,
            return_length: *mut u32,
        ) -> i32;
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Every memory-list command is rejected without this privilege, and the rejection
    /// arrives as a plain STATUS_PRIVILEGE_NOT_HELD with no hint, so acquire it first and
    /// report the real reason when the process is not elevated.
    fn enable_privilege(name: &str) -> Result<(), String> {
        let wide_name = wide(name);
        let mut token: Handle = 0;
        unsafe {
            if OpenProcessToken(
                GetCurrentProcess(),
                TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
                &raw mut token,
            ) == 0
            {
                return Err(format!("Could not open the process token ({})", GetLastError()));
            }
            let mut luid = Luid::default();
            if LookupPrivilegeValueW(std::ptr::null(), wide_name.as_ptr(), &raw mut luid) == 0 {
                let code = GetLastError();
                CloseHandle(token);
                return Err(format!("{name} is not known to this system ({code})"));
            }
            let privileges = TokenPrivileges {
                privilege_count: 1,
                privileges: [LuidAndAttributes {
                    luid,
                    attributes: SE_PRIVILEGE_ENABLED,
                }],
            };
            let adjusted = AdjustTokenPrivileges(
                token,
                0,
                &raw const privileges,
                std::mem::size_of::<TokenPrivileges>() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
            let code = GetLastError();
            CloseHandle(token);
            if adjusted == 0 {
                return Err(format!("Could not enable {name} ({code})"));
            }
            // AdjustTokenPrivileges reports success even when it granted nothing.
            if code == ERROR_NOT_ALL_ASSIGNED {
                return Err(format!(
                    "{name} was refused. Run the app as administrator to reclaim system memory."
                ));
            }
        }
        Ok(())
    }

    fn page_size() -> u64 {
        let mut info = SystemInfo::default();
        unsafe { GetNativeSystemInfo(&raw mut info) };
        if info.page_size == 0 {
            4096
        } else {
            u64::from(info.page_size)
        }
    }

    fn memory_list() -> Option<SystemMemoryListInformation> {
        let mut info = SystemMemoryListInformation::default();
        let mut returned = 0u32;
        let status = unsafe {
            NtQuerySystemInformation(
                SYSTEM_MEMORY_LIST_INFORMATION,
                (&raw mut info).cast::<c_void>(),
                std::mem::size_of::<SystemMemoryListInformation>() as u32,
                &raw mut returned,
            )
        };
        (status == 0).then_some(info)
    }

    pub fn snapshot() -> MemorySnapshot {
        let mut snap = base_snapshot();
        let Some(list) = memory_list() else {
            return snap;
        };
        let page = page_size();
        let standby: u64 = list
            .page_count_by_priority
            .iter()
            .map(|pages| *pages as u64 * page)
            .sum();
        let modified = list.modified_page_count as u64 * page;
        let free = (list.free_page_count as u64 + list.zero_page_count as u64) * page;

        // Standby and modified pages are exactly what the memory-list commands give back.
        snap.reclaimable_bytes = standby.saturating_add(modified);
        snap.segments = vec![
            segment(
                "in_use",
                "In use",
                snap.total_bytes
                    .saturating_sub(standby)
                    .saturating_sub(modified)
                    .saturating_sub(free),
            ),
            segment("modified", "Modified", modified),
            segment("standby", "Standby", standby),
            segment("free", "Free", free),
        ];
        snap
    }

    pub fn areas() -> Vec<MemoryArea> {
        let privileged = MemoryArea {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            supported: true,
            needs_privileges: true,
            // Windows refuses without elevation rather than prompting, so an unattended
            // run is never interactive.
            prompts_for_credentials: false,
            background_safe: true,
        };
        vec![
            MemoryArea {
                id: AREA_APP_WORKING_SET.into(),
                name: "App working set".into(),
                description: "Returns this app's own allocator caches to the system.".into(),
                supported: true,
                needs_privileges: false,
                prompts_for_credentials: false,
                background_safe: true,
            },
            MemoryArea {
                id: AREA_WORKING_SETS.into(),
                name: "Processes working set".into(),
                description: "Trims every process's working set so unused pages become reusable."
                    .into(),
                ..privileged.clone()
            },
            MemoryArea {
                id: AREA_MODIFIED_PAGE_LIST.into(),
                name: "Modified page list".into(),
                description: "Writes modified pages out so the kernel can reuse them.".into(),
                ..privileged.clone()
            },
            MemoryArea {
                id: AREA_STANDBY_LIST.into(),
                name: "Standby list".into(),
                description: "Drops cached pages the system is holding for future reads.".into(),
                ..privileged.clone()
            },
            MemoryArea {
                id: AREA_STANDBY_LIST_LOW.into(),
                name: "Standby list (low priority)".into(),
                description: "Drops only the low-priority part of the standby list.".into(),
                ..privileged.clone()
            },
            MemoryArea {
                id: AREA_COMBINED_PAGE_LIST.into(),
                name: "Combined page list".into(),
                description: "Merges identical pages. Frees the most, but loads the CPU for a \
                              while, so it stays out of unattended runs."
                    .into(),
                background_safe: false,
                ..privileged
            },
        ]
    }

    fn memory_list_command(command: i32) -> Result<(), String> {
        enable_privilege("SeProfileSingleProcessPrivilege")?;
        let mut value = command;
        let status = unsafe {
            NtSetSystemInformation(
                SYSTEM_MEMORY_LIST_INFORMATION,
                (&raw mut value).cast::<c_void>(),
                std::mem::size_of::<i32>() as u32,
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!("The kernel refused the request (status 0x{status:08X})"))
        }
    }

    pub fn run_area(id: &str, _allow_prompt: bool) -> Result<String, String> {
        match id {
            AREA_APP_WORKING_SET => {
                let freed = crate::metrics::trim_memory_cache();
                Ok(format!(
                    "Allocator returned {} KB to the system",
                    freed / 1024
                ))
            }
            AREA_WORKING_SETS => {
                memory_list_command(MEMORY_EMPTY_WORKING_SETS)?;
                Ok("Working sets emptied".into())
            }
            AREA_MODIFIED_PAGE_LIST => {
                memory_list_command(MEMORY_FLUSH_MODIFIED_LIST)?;
                Ok("Modified page list flushed".into())
            }
            AREA_STANDBY_LIST => {
                memory_list_command(MEMORY_PURGE_STANDBY_LIST)?;
                Ok("Standby list purged".into())
            }
            AREA_STANDBY_LIST_LOW => {
                memory_list_command(MEMORY_PURGE_LOW_PRIORITY_STANDBY_LIST)?;
                Ok("Low-priority standby list purged".into())
            }
            AREA_COMBINED_PAGE_LIST => {
                enable_privilege("SeProfileSingleProcessPrivilege")?;
                let mut info = MemoryCombineInformationEx::default();
                let status = unsafe {
                    NtSetSystemInformation(
                        SYSTEM_COMBINE_PHYSICAL_MEMORY_INFORMATION,
                        (&raw mut info).cast::<c_void>(),
                        std::mem::size_of::<MemoryCombineInformationEx>() as u32,
                    )
                };
                if status == 0 {
                    Ok(format!(
                        "{} pages combined",
                        info.pages_combined
                    ))
                } else {
                    Err(format!(
                        "The kernel refused to combine pages (status 0x{status:08X})"
                    ))
                }
            }
            _ => Err("Unknown memory area".into()),
        }
    }
}

// ============================================================================
// Linux
// ============================================================================

#[cfg(target_os = "linux")]
mod imp {
    use super::*;

    unsafe extern "C" {
        fn malloc_trim(pad: usize) -> i32;
    }

    fn meminfo_kb(key: &str) -> Option<u64> {
        let text = std::fs::read_to_string("/proc/meminfo").ok()?;
        text.lines()
            .find(|line| line.starts_with(key) && line[key.len()..].starts_with(':'))
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|value| value.parse::<u64>().ok())
    }

    pub fn snapshot() -> MemorySnapshot {
        let mut snap = base_snapshot();
        let cached = meminfo_kb("Cached").unwrap_or(0) * 1024;
        let buffers = meminfo_kb("Buffers").unwrap_or(0) * 1024;
        let reclaimable = meminfo_kb("SReclaimable").unwrap_or(0) * 1024;
        let free = meminfo_kb("MemFree").unwrap_or(0) * 1024;

        snap.reclaimable_bytes = cached.saturating_add(buffers).saturating_add(reclaimable);
        snap.segments = vec![
            segment(
                "in_use",
                "In use",
                snap.total_bytes
                    .saturating_sub(snap.reclaimable_bytes)
                    .saturating_sub(free),
            ),
            segment("buffers", "Buffers", buffers),
            segment("cached", "Page cache", cached),
            segment("slab", "Reclaimable slab", reclaimable),
            segment("free", "Free", free),
        ];
        snap
    }

    pub fn areas() -> Vec<MemoryArea> {
        vec![
            MemoryArea {
                id: AREA_APP_WORKING_SET.into(),
                name: "App working set".into(),
                description: "Returns this app's own allocator caches to the system.".into(),
                supported: true,
                needs_privileges: false,
                prompts_for_credentials: false,
                background_safe: true,
            },
            MemoryArea {
                id: AREA_FILE_CACHE.into(),
                name: "Page cache".into(),
                description: "Writes /proc/sys/vm/drop_caches, which needs root.".into(),
                supported: true,
                needs_privileges: true,
                prompts_for_credentials: false,
                background_safe: true,
            },
        ]
    }

    pub fn run_area(id: &str, _allow_prompt: bool) -> Result<String, String> {
        match id {
            AREA_APP_WORKING_SET => {
                let trimmed = unsafe { malloc_trim(0) };
                Ok(if trimmed == 1 {
                    "Allocator released memory back to the system".into()
                } else {
                    "Allocator had nothing to release".into()
                })
            }
            AREA_FILE_CACHE => {
                let _ = std::fs::write("/proc/sys/vm/drop_caches", "3")
                    .map_err(|e| format!("drop_caches needs root: {e}"))?;
                Ok("Page cache dropped".into())
            }
            _ => Err("Unknown memory area".into()),
        }
    }
}

// ============================================================================
// Anything else
// ============================================================================

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod imp {
    use super::*;

    pub fn snapshot() -> MemorySnapshot {
        base_snapshot()
    }

    pub fn areas() -> Vec<MemoryArea> {
        vec![MemoryArea {
            id: AREA_APP_WORKING_SET.into(),
            name: "App working set".into(),
            description: "Not available on this platform.".into(),
            supported: false,
            needs_privileges: false,
            prompts_for_credentials: false,
            background_safe: false,
        }]
    }

    pub fn run_area(_id: &str, _allow_prompt: bool) -> Result<String, String> {
        Err("This platform exposes no memory reclamation".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot_at(used_percent: f64) -> MemorySnapshot {
        MemorySnapshot {
            total_bytes: 16 * 1024 * 1024 * 1024,
            used_percent,
            ..Default::default()
        }
    }

    fn policy() -> AutoCleanPolicy {
        AutoCleanPolicy {
            enabled: true,
            areas: vec![AREA_APP_WORKING_SET.into()],
            every_minutes: None,
            when_used_percent_above: None,
            cooldown_minutes: 10,
        }
    }

    #[test]
    fn a_disabled_or_unconfigured_policy_explains_itself_instead_of_running() {
        let idle_reason = |p: &AutoCleanPolicy, s, last| match decide(p, &s, last) {
            AutoCleanDecision::Idle { reason } => reason,
            other => panic!("expected idle, got {other:?}"),
        };

        let mut p = policy();
        p.enabled = false;
        assert_eq!(idle_reason(&p, snapshot_at(99.0), None), "Auto clean is off");

        let mut p = policy();
        p.areas.clear();
        assert_eq!(
            idle_reason(&p, snapshot_at(99.0), None),
            "No memory area is selected"
        );

        // Enabled with neither trigger is a switch that does nothing; say so rather than
        // leaving the user watching a toggle that never fires.
        let p = policy();
        assert_eq!(
            idle_reason(&p, snapshot_at(99.0), None),
            "No trigger is configured"
        );
    }

    #[test]
    fn the_usage_threshold_fires_once_and_then_waits_out_the_cooldown() {
        let mut p = policy();
        p.when_used_percent_above = Some(85.0);

        assert_eq!(decide(&p, &snapshot_at(84.9), None), idle_at_limits());
        assert_eq!(
            decide(&p, &snapshot_at(85.0), None),
            AutoCleanDecision::Run {
                trigger: AutoCleanTrigger::UsageAbove { used_percent: 85.0 }
            },
            "the threshold is inclusive"
        );

        // Still over the limit right after a run: without the cooldown the scheduler would
        // reclaim on every single poll.
        let just_ran = decide(&p, &snapshot_at(97.0), Some(Duration::from_secs(60)));
        match just_ran {
            AutoCleanDecision::Idle { reason } => assert!(reason.contains("Cooling down"), "{reason}"),
            other => panic!("expected a cooldown, got {other:?}"),
        }
        assert!(
            decide(&p, &snapshot_at(97.0), Some(Duration::from_secs(10 * 60)))
                .should_run(),
            "the cooldown must end exactly when it elapses"
        );
    }

    #[test]
    fn the_interval_arms_on_first_run_and_yields_to_the_threshold() {
        let mut p = policy();
        p.every_minutes = Some(30);
        p.cooldown_minutes = 1;

        assert_eq!(
            decide(&p, &snapshot_at(10.0), None),
            AutoCleanDecision::Run {
                trigger: AutoCleanTrigger::Interval
            },
            "a session that never ran is due"
        );
        assert_eq!(
            decide(&p, &snapshot_at(10.0), Some(Duration::from_secs(29 * 60))),
            idle_at_limits()
        );
        assert!(
            decide(&p, &snapshot_at(10.0), Some(Duration::from_secs(30 * 60))).should_run()
        );

        // When both could fire, the report must name the threshold: that is the reason
        // the run happened, and the UI shows it.
        p.when_used_percent_above = Some(80.0);
        assert_eq!(
            decide(&p, &snapshot_at(90.0), Some(Duration::from_secs(30 * 60))),
            AutoCleanDecision::Run {
                trigger: AutoCleanTrigger::UsageAbove { used_percent: 90.0 }
            }
        );
    }

    fn idle_at_limits() -> AutoCleanDecision {
        AutoCleanDecision::Idle {
            reason: "Memory is within the configured limits".into(),
        }
    }

    #[test]
    fn sanitizing_drops_what_the_scheduler_must_never_run_unattended() {
        let interactive: Vec<String> = areas()
            .into_iter()
            .filter(|a| !a.background_safe || !a.supported)
            .map(|a| a.id)
            .collect();

        let dirty = AutoCleanPolicy {
            enabled: true,
            areas: [
                vec![AREA_APP_WORKING_SET.to_string(), "not_a_real_area".into()],
                interactive.clone(),
            ]
            .concat(),
            every_minutes: Some(0),
            when_used_percent_above: Some(0.0),
            cooldown_minutes: 0,
        };
        let clean = dirty.sanitized();

        assert!(clean.areas.contains(&AREA_APP_WORKING_SET.to_string()));
        assert!(!clean.areas.contains(&"not_a_real_area".to_string()));
        for id in interactive {
            assert!(
                !clean.areas.contains(&id),
                "{id} may prompt or is unsupported, so it cannot run unattended"
            );
        }
        assert_eq!(clean.every_minutes, Some(1), "a zero-minute cadence is a busy loop");
        assert_eq!(clean.cooldown_minutes, 1, "a zero cooldown lets it thrash");
        assert_eq!(clean.when_used_percent_above, Some(1.0));

        let nan = AutoCleanPolicy {
            when_used_percent_above: Some(f64::NAN),
            ..AutoCleanPolicy::default()
        };
        assert_eq!(nan.sanitized().when_used_percent_above, None);
    }

    #[test]
    fn every_area_this_platform_lists_is_runnable_and_reports_back() {
        let catalog = areas();
        assert!(!catalog.is_empty());
        assert!(
            catalog.iter().any(|a| a.id == AREA_APP_WORKING_SET && a.supported),
            "every supported platform can at least trim its own allocator"
        );

        // The unattended default must never include something that opens a dialog.
        for id in default_background_areas() {
            let area = catalog.iter().find(|a| a.id == id).expect("listed area");
            assert!(area.supported && area.background_safe && !area.prompts_for_credentials);
        }

        // Running the safe areas must produce one outcome each, and never panic.
        let report = clean(&default_background_areas(), false);
        assert_eq!(report.outcomes.len(), default_background_areas().len());
        assert!(report.before.total_bytes > 0, "the snapshot must see real memory");

        // An unknown id is reported, not silently dropped.
        let unknown = clean(&["nope".to_string()], false);
        assert_eq!(unknown.outcomes.len(), 1);
        assert!(!unknown.outcomes[0].ok);
        assert_eq!(unknown.outcomes[0].detail, "Unknown memory area");
    }

    #[test]
    fn a_prompting_area_is_skipped_with_a_reason_when_prompting_is_off() {
        let prompting: Vec<String> = areas()
            .into_iter()
            .filter(|a| a.supported && a.prompts_for_credentials)
            .map(|a| a.id)
            .collect();
        if prompting.is_empty() {
            return; // Only macOS has one today.
        }
        let report = clean(&prompting, false);
        for outcome in report.outcomes {
            assert!(!outcome.ok);
            assert!(outcome.detail.contains("administrator password"), "{outcome:?}");
        }
    }

    #[test]
    fn the_snapshot_reports_a_consistent_picture() {
        let snap = snapshot();
        assert!(snap.total_bytes > 0);
        assert!(snap.used_bytes <= snap.total_bytes);
        assert!(snap.used_percent >= 0.0 && snap.used_percent <= 100.0);
        assert!(snap.captured_at_secs > 0);
        let listed: u64 = snap.segments.iter().map(|s| s.bytes).sum();
        assert!(
            listed <= snap.total_bytes.saturating_mul(2),
            "segments must describe this machine, not an unrelated number"
        );
    }
}
