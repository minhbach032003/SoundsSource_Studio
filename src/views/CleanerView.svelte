<script lang="ts">
  import {
    Sparkles,
    Trash2,
    HardDrive,
    Cpu,
    RefreshCw,
    Layers,
    Search,
    ShieldCheck,
    Zap,
    Activity,
    Clock,
    RotateCcw,
    ChevronDown,
    ChevronRight,
    AppWindow,
    FileText,
    MemoryStick,
    TriangleAlert,
    Ban,
    CircleCheck,
    CircleX,
  } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import MemoryPanel from "@/components/cleaner/MemoryPanel.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import {
    scanSystemClean,
    executeClean,
    scanInstalledApps,
    uninstallApp,
    runOptimizationTask,
    getHardwareMetrics,
    getPlatformInfo,
    getScanProgress,
    cancelScan,
    safeCategoryIds,
    formatBytes,
    type CleanScanProgress,
    type CleanExecutionResult,
    type CleanScanResult,
    type InstalledAppInfo,
    type SystemHardwareMetrics,
    type PlatformInfo,
  } from "@/lib/cleaner";

  type ActiveCleanerTab = "clean" | "memory" | "uninstall" | "optimize" | "status";

  let activeTab = $state<ActiveCleanerTab>("clean");

  // Platform detection state
  let platformInfo = $state<PlatformInfo | null>(null);

  // Deep Clean state
  let isScanningClean = $state(false);
  let isCleaning = $state(false);
  let scanResult = $state<CleanScanResult | null>(null);
  let selectedCategoryIds = $state<Set<string>>(new Set());
  let expandedCategoryIds = $state<Set<string>>(new Set());
  let isCleanModalOpen = $state(false);
  let cleanFilterGroup = $state<"all" | "system" | "developer" | "browser" | "user">("all");
  let scanProgress = $state<CleanScanProgress | null>(null);
  let lastCleanResult = $state<CleanExecutionResult | null>(null);
  /// Ticking a "review" category is a separate, deliberate act, so the confirm step asks
  /// for it again rather than treating the checkbox as consent.
  let reviewAcknowledged = $state(false);

  // App Uninstaller state
  let isScanningApps = $state(false);
  let installedApps = $state<InstalledAppInfo[]>([]);
  let appSearchQuery = $state("");
  let selectedAppForUninstall = $state<InstalledAppInfo | null>(null);
  let isUninstallModalOpen = $state(false);
  let expandedAppIds = $state<Set<string>>(new Set());

  // Optimizer state
  let activeOptimizingTasks = $state<Set<string>>(new Set());

  // Hardware status state
  let hardwareMetrics = $state<SystemHardwareMetrics | null>(null);

  // Initial load. Scanning is not part of it: walking the whole disk because a tab was
  // opened is the slowest thing this view can do, and nobody asked for it.
  $effect(() => {
    getPlatformInfo().then((info) => {
      platformInfo = info;
    });
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  });

  /// Polls the backend's own counters while a scan runs, so "Scanning..." can say which
  /// part of the system it is in and how much it has seen.
  $effect(() => {
    if (!isScanningClean) {
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const progress = await getScanProgress();
        if (alive) scanProgress = progress;
      } catch {
        /* the scan result itself is the source of truth */
      }
    };
    void poll();
    const timer = setInterval(poll, 250);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  });

  // 1. Deep Clean Handlers
  async function handleScanClean() {
    isScanningClean = true;
    lastCleanResult = null;
    reviewAcknowledged = false;
    try {
      const res = await scanSystemClean();
      scanResult = res;
      // Only what regenerates itself is ticked. The Trash and the Downloads folder hold
      // files the user chose to keep, and a one-click clean must not take them.
      selectedCategoryIds = safeCategoryIds(res);
      const reviewCount = res.categories.filter((c) => c.risk === "review").length;
      if (res.cancelled) {
        toastState.info(
          `Scan stopped early. ${res.categories.length} categories found so far (${formatBytes(res.total_size_bytes)}).`
        );
      } else {
        toastState.info(
          `Found ${formatBytes(res.total_size_bytes)} across ${res.categories.length} categories` +
            (reviewCount > 0 ? `; ${reviewCount} need a look before deleting` : "")
        );
      }
    } catch (err) {
      toastState.error(`System scan failed: ${String(err)}`);
    } finally {
      isScanningClean = false;
      scanProgress = null;
    }
  }

  async function handleCancelScan() {
    try {
      await cancelScan();
      toastState.info("Stopping the scan; you will get what was found so far");
    } catch (err) {
      toastState.error(`Could not stop the scan: ${String(err)}`);
    }
  }

  function toggleCategorySelect(id: string) {
    const updated = new Set(selectedCategoryIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    selectedCategoryIds = updated;
  }

  function toggleCategoryExpand(id: string) {
    const updated = new Set(expandedCategoryIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    expandedCategoryIds = updated;
  }

  const selectedTotalBytes = $derived.by(() => {
    if (!scanResult) return 0;
    return scanResult.categories
      .filter((c) => selectedCategoryIds.has(c.id))
      .reduce((sum, c) => sum + c.size_bytes, 0);
  });

  const selectedReviewCategories = $derived.by(() => {
    if (!scanResult) return [];
    return scanResult.categories.filter(
      (c) => c.risk === "review" && selectedCategoryIds.has(c.id)
    );
  });

  const canConfirmClean = $derived(
    selectedCategoryIds.size > 0 &&
      (selectedReviewCategories.length === 0 || reviewAcknowledged)
  );

  const filteredCategories = $derived.by(() => {
    if (!scanResult) return [];
    if (cleanFilterGroup === "all") return scanResult.categories;
    return scanResult.categories.filter((c) => c.group === cleanFilterGroup);
  });

  async function handleConfirmClean() {
    if (!canConfirmClean) {
      toastState.info("Confirm the categories that hold your own files first");
      return;
    }
    isCleanModalOpen = false;
    isCleaning = true;
    try {
      const res = await executeClean(Array.from(selectedCategoryIds));
      lastCleanResult = res;
      // A clean that half worked used to report one number and look like a small disk.
      const failed = res.categories.filter((c) => c.errors.length > 0);
      if (failed.length === 0 && res.skipped.length === 0) {
        toastState.success(
          `Reclaimed ${formatBytes(res.bytes_reclaimed)} across ${res.categories.length} categories (${res.items_removed} items)`
        );
      } else {
        toastState.info(
          `Reclaimed ${formatBytes(res.bytes_reclaimed)}; ${failed.length + res.skipped.length} of ${selectedCategoryIds.size} categories did not fully run`
        );
      }
      // The list the user reviewed is now stale, so refresh it rather than leaving sizes
      // on screen for files that no longer exist.
      await handleScanClean();
    } catch (err) {
      toastState.error(`Clean failed: ${String(err)}`);
    } finally {
      isCleaning = false;
    }
  }

  // 2. Uninstaller Handlers
  async function handleScanApps() {
    isScanningApps = true;
    try {
      installedApps = await scanInstalledApps();
      toastState.info(`Found ${installedApps.length} installed applications`);
    } catch (err) {
      toastState.error(`App scan failed: ${String(err)}`);
    } finally {
      isScanningApps = false;
    }
  }

  function toggleAppExpand(id: string) {
    const updated = new Set(expandedAppIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    expandedAppIds = updated;
  }

  const filteredApps = $derived.by(() => {
    const q = appSearchQuery.trim().toLowerCase();
    if (!q) return installedApps;
    return installedApps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.bundle_id.toLowerCase().includes(q)
    );
  });

  async function handleConfirmUninstall() {
    if (!selectedAppForUninstall) return;
    const app = selectedAppForUninstall;
    isUninstallModalOpen = false;
    try {
      const leftoverPaths = app.leftovers.map((l) => l.path);
      const res = await uninstallApp(app.path, leftoverPaths);
      if (res.bundle_removed) {
        toastState.success(`Uninstalled ${app.name} (${formatBytes(res.bytes_reclaimed)} reclaimed)`);
        await handleScanApps();
      } else {
        toastState.error(`Failed to completely remove ${app.name}`);
      }
    } catch (err) {
      toastState.error(`Uninstall failed: ${String(err)}`);
    } finally {
      selectedAppForUninstall = null;
    }
  }

  // 3. Optimizer Handlers
  async function handleRunOptimization(taskId: string) {
    const updated = new Set(activeOptimizingTasks);
    updated.add(taskId);
    activeOptimizingTasks = updated;

    try {
      const res = await runOptimizationTask(taskId);
      if (res.success) {
        toastState.success(`${res.task_name}: ${res.message}`);
      } else {
        toastState.error(`${res.task_name}: ${res.message}`);
      }
      fetchMetrics();
    } catch (err) {
      toastState.error(`Task failed: ${String(err)}`);
    } finally {
      const next = new Set(activeOptimizingTasks);
      next.delete(taskId);
      activeOptimizingTasks = next;
    }
  }

  // 4. Hardware Metrics
  async function fetchMetrics() {
    try {
      hardwareMetrics = await getHardwareMetrics();
    } catch {}
  }
</script>

<div class="w-full space-y-5 pb-8 animate-in fade-in duration-200 select-none">
  <!-- Top Header Banner -->
  <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-(--line)">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text) shadow-xs">
        <Sparkles size={16} />
      </div>
      <div>
        <h2 class="text-sm font-bold text-(--ink) m-0">
          {platformInfo?.is_windows ? "Windows System Studio & Cleaner" : "macOS System Studio & Cleaner"}
        </h2>
        <p class="text-[11px] text-(--muted) m-0">
          {platformInfo?.is_windows
            ? "Mole-grade Windows deep cleaning, app uninstallation, and system maintenance"
            : "Mole-grade deep cleaning, app uninstallation, and system optimization"}
        </p>
      </div>
    </div>

    <!-- Quick Status Pill -->
    <div class="flex items-center gap-2">
      {#if hardwareMetrics}
        <div class="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono bg-(--paper) border border-(--line) text-(--ink) shadow-xs">
          <span class="flex items-center gap-1">
            <Cpu size={12} class="text-(--accent-text)" />
            <span>{hardwareMetrics.cpu_usage_percent.toFixed(1)}%</span>
          </span>
          <span class="text-(--muted)">•</span>
          <span class="flex items-center gap-1">
            <Layers size={12} class="text-(--success)" />
            <span>{hardwareMetrics.memory_used_percent.toFixed(0)}% RAM</span>
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Persistent status strip. The numbers that decide whether to clean anything were
       only on the Hardware Status tab, which meant leaving the page to find out. -->
  {#if hardwareMetrics}
    {@const disk = hardwareMetrics.disk_used_percent}
    {@const ram = hardwareMetrics.memory_used_percent}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) shadow-xs">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block">
          Disk free
        </span>
        <span
          class="text-sm font-bold font-mono {disk >= 90
            ? 'text-(--error)'
            : disk >= 75
              ? 'text-(--warning)'
              : 'text-(--ink)'}"
        >
          {formatBytes(hardwareMetrics.disk_available_bytes)}
        </span>
        <span class="text-[10px] text-(--muted) font-mono block">{disk.toFixed(0)}% used</span>
      </div>

      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) shadow-xs">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block">
          Memory
        </span>
        <span
          class="text-sm font-bold font-mono {ram >= 90
            ? 'text-(--error)'
            : ram >= 75
              ? 'text-(--warning)'
              : 'text-(--ink)'}"
        >
          {ram.toFixed(0)}%
        </span>
        <span class="text-[10px] text-(--muted) font-mono block">
          {formatBytes(hardwareMetrics.memory_free_bytes)} free
        </span>
      </div>

      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) shadow-xs">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block">
          Swap in use
        </span>
        <span class="text-sm font-bold font-mono text-(--ink)">
          {formatBytes(hardwareMetrics.swap_used_bytes)}
        </span>
        <span class="text-[10px] text-(--muted) font-mono block">
          of {formatBytes(hardwareMetrics.swap_total_bytes)}
        </span>
      </div>

      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) shadow-xs">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block">
          Found on disk
        </span>
        <span class="text-sm font-bold font-mono text-(--accent-text)">
          {scanResult ? formatBytes(scanResult.total_size_bytes) : "—"}
        </span>
        <span class="text-[10px] text-(--muted) font-mono block">
          {scanResult ? `${scanResult.categories.length} categories` : "not scanned yet"}
        </span>
      </div>
    </div>
  {/if}

  <!-- Navigation Tabs -->
  <div class="flex items-center gap-1 p-1 rounded-xl bg-(--paper) border border-(--line) shrink-0 overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "clean")}
      class="flex-1 min-w-32 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'clean'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Trash2 size={14} class="text-(--accent-text)" />
      <span>Deep Clean</span>
      {#if scanResult && scanResult.total_size_bytes > 0}
        <span class="text-[10px] font-mono px-1.5 py-0 rounded bg-(--paper) border border-(--line) text-(--muted)">
          {formatBytes(scanResult.total_size_bytes)}
        </span>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "memory")}
      class="flex-1 min-w-32 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'memory'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <MemoryStick size={14} class="text-(--accent-text)" />
      <span>Memory</span>
      {#if hardwareMetrics}
        <span class="text-[10px] font-mono px-1.5 py-0 rounded bg-(--paper) border border-(--line) text-(--muted)">
          {Math.round(hardwareMetrics.memory_used_percent)}%
        </span>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => {
        activeTab = "uninstall";
        if (installedApps.length === 0) handleScanApps();
      }}
      class="flex-1 min-w-32 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'uninstall'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <AppWindow size={14} class="text-amber-400" />
      <span>App Uninstaller</span>
      {#if installedApps.length > 0}
        <span class="text-[10px] font-mono px-1.5 py-0 rounded bg-(--paper) border border-(--line) text-(--muted)">
          {installedApps.length}
        </span>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "optimize")}
      class="flex-1 min-w-32 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'optimize'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Zap size={14} class="text-(--success)" />
      <span>System Optimizer</span>
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "status")}
      class="flex-1 min-w-32 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'status'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Activity size={14} class="text-cyan-400" />
      <span>Hardware Status</span>
    </button>
  </div>

  <!-- TAB 1: DEEP CLEAN -->
  {#if activeTab === "clean"}
    <div class="space-y-4">
      <!-- Toolbar & Action Card -->
      <div class="panel p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-(--ink)">Selected:</span>
            <span class="text-base font-extrabold text-(--accent-text) font-mono">
              {formatBytes(selectedTotalBytes)}
            </span>
            <span class="text-[11px] text-(--muted) font-mono">
              ({selectedCategoryIds.size} / {scanResult ? scanResult.categories.length : 0} categories)
            </span>
            {#if scanResult?.cancelled}
              <span class="text-[10px] text-(--warning) font-semibold">partial scan</span>
            {/if}
          </div>
          <p class="text-[11px] text-(--muted) m-0">
            {#if selectedReviewCategories.length > 0}
              {selectedReviewCategories.length} selected category(s) hold files you chose to keep.
              You will be asked to confirm them separately.
            {:else}
              Only self-regenerating caches are ticked by default. Anything holding your own
              files stays unticked until you tick it.
            {/if}
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          {#if isScanningClean}
            <button
              type="button"
              onclick={handleCancelScan}
              disabled={scanProgress?.cancelled}
              class="btn btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-(--line)"
            >
              <Ban size={13} />
              <span>{scanProgress?.cancelled ? "Stopping…" : "Cancel"}</span>
            </button>
          {:else}
            <button
              type="button"
              onclick={handleScanClean}
              disabled={isCleaning}
              class="btn btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-(--line)"
            >
              <RefreshCw size={13} />
              <span>{scanResult ? "Re-Scan" : "Scan"}</span>
            </button>
          {/if}

          <button
            type="button"
            onclick={() => {
              reviewAcknowledged = false;
              isCleanModalOpen = true;
            }}
            disabled={isCleaning || isScanningClean || selectedTotalBytes === 0}
            class="btn btn-primary text-xs flex items-center gap-1.5 px-3.5 py-1.5 shadow-xs font-semibold"
          >
            <Trash2 size={13} class="text-(--accent-ink)" />
            <span>{isCleaning ? "Cleaning…" : `Clean Selected (${formatBytes(selectedTotalBytes)})`}</span>
          </button>
        </div>
      </div>

      <!-- Filter Group Tabs -->
      <div class="flex items-center gap-1 p-1 rounded-xl bg-(--paper) border border-(--line) w-fit">
        {#each (["all", "system", "developer", "browser", "user"] as const) as grp}
          <button
            type="button"
            onclick={() => (cleanFilterGroup = grp)}
            class="px-2.5 py-1 text-[11px] font-semibold rounded-lg capitalize transition-all cursor-pointer {cleanFilterGroup === grp
              ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
              : 'text-(--muted) hover:text-(--ink)'}"
          >
            {grp}
          </button>
        {/each}
      </div>

      <!-- Live scan progress: the walk reports its own stage and running totals, so
           "Scanning..." is never the only thing on screen. -->
      {#if isScanningClean}
        <div class="panel p-4 shadow-xs flex items-center gap-3">
          <RefreshCw size={18} class="animate-spin text-(--accent-text) shrink-0" />
          <div class="min-w-0 flex-1">
            <span class="text-xs font-bold text-(--ink) block">
              {scanProgress?.cancelled ? "Stopping the scan…" : scanProgress?.stage || "Starting…"}
            </span>
            <span class="text-[10px] text-(--muted) font-mono">
              {formatBytes(scanProgress?.bytes_seen ?? 0)} across
              {(scanProgress?.files_seen ?? 0).toLocaleString()} files so far
            </span>
          </div>
        </div>
      {/if}

      <!-- Per-category results, so a partial clean is legible rather than one number -->
      {#if lastCleanResult && !isCleaning}
        <div class="panel p-4 shadow-xs space-y-1.5">
          <div class="flex items-center justify-between gap-3 pb-2 border-b border-(--line)">
            <span class="text-xs font-bold text-(--ink)">Last clean</span>
            <span class="text-xs font-mono text-(--success)">
              {formatBytes(lastCleanResult.bytes_reclaimed)} · {lastCleanResult.items_removed} items
            </span>
          </div>
          {#each lastCleanResult.categories as outcome (outcome.id)}
            <div class="flex items-start gap-2 text-[11px]">
              {#if outcome.errors.length === 0}
                <CircleCheck size={12} class="text-(--success) shrink-0 mt-0.5" />
              {:else}
                <CircleX size={12} class="text-(--error) shrink-0 mt-0.5" />
              {/if}
              <span class="min-w-0 flex-1">
                <span class="text-(--ink)">{outcome.name}</span>
                <span class="text-(--muted) font-mono"> — {formatBytes(outcome.bytes_reclaimed)}, {outcome.items_removed} items</span>
                {#each outcome.errors.slice(0, 3) as error (error)}
                  <span class="block text-(--error) break-all">{error}</span>
                {/each}
                {#if outcome.errors.length > 3}
                  <span class="block text-(--muted)">and {outcome.errors.length - 3} more error(s)</span>
                {/if}
              </span>
            </div>
          {/each}
          {#each lastCleanResult.skipped as id (id)}
            <div class="flex items-start gap-2 text-[11px]">
              <TriangleAlert size={12} class="text-(--warning) shrink-0 mt-0.5" />
              <span class="text-(--muted)">
                <span class="text-(--ink)">{id}</span> — no longer in the reviewed scan, so it was skipped
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Categories List -->
      {#if !scanResult && !isScanningClean}
        <div class="py-12 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <Search size={28} class="mb-2 text-(--accent-text)" />
          <span class="text-xs font-bold text-(--ink)">Nothing scanned yet</span>
          <span class="text-[10px] text-(--muted) mt-0.5 max-w-80">
            A scan walks your caches, build artifacts, logs and installers. It reads only; nothing
            is deleted until you pick categories and confirm.
          </span>
          <button
            type="button"
            onclick={handleScanClean}
            class="btn btn-primary text-xs flex items-center gap-1.5 px-3.5 py-1.5 mt-3 font-semibold"
          >
            <Search size={13} />
            <span>Scan now</span>
          </button>
        </div>
      {:else if filteredCategories.length === 0}
        <div class="py-12 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <ShieldCheck size={28} class="mb-2 text-emerald-400" />
          <span class="text-xs font-bold text-(--ink)">No Cleanable Artifacts Found</span>
          <span class="text-[10px] text-(--muted) mt-0.5">Your Mac system caches and logs are clean!</span>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-2.5">
          {#each filteredCategories as cat (cat.id)}
            {@const isSelected = selectedCategoryIds.has(cat.id)}
            {@const isExpanded = expandedCategoryIds.has(cat.id)}
            <div class="p-3.5 rounded-2xl bg-(--paper) border border-(--line) space-y-2 transition-all hover:border-(--focus)">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onchange={() => toggleCategorySelect(cat.id)}
                    class="w-4 h-4 rounded text-(--accent) accent-(--accent) cursor-pointer"
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-xs text-(--ink) truncate">{cat.name}</span>
                      <span class="badge text-[9px] px-1.5 py-0 uppercase">{cat.group}</span>
                      {#if cat.risk === "review"}
                        <span
                          class="text-[9px] px-1.5 py-0 rounded uppercase font-semibold border border-(--error)/40 bg-(--error)/10 text-(--error) flex items-center gap-1"
                        >
                          <TriangleAlert size={9} /> review
                        </span>
                      {/if}
                    </div>
                    <p class="text-[11px] text-(--muted) m-0 truncate">{cat.description}</p>
                    {#if cat.risk_note}
                      <p class="text-[10px] text-(--warning) m-0">{cat.risk_note}</p>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <div class="text-right">
                    <span class="font-bold text-xs text-(--ink) font-mono block">
                      {formatBytes(cat.size_bytes)}
                    </span>
                    <span class="text-[10px] text-(--muted) font-mono">
                      {cat.item_count} items
                    </span>
                  </div>

                  <button
                    type="button"
                    onclick={() => toggleCategoryExpand(cat.id)}
                    class="btn btn-ghost p-1 text-(--muted) hover:text-(--ink)"
                    title="View paths"
                  >
                    {#if isExpanded}
                      <ChevronDown size={14} />
                    {:else}
                      <ChevronRight size={14} />
                    {/if}
                  </button>
                </div>
              </div>

              {#if isExpanded}
                <div class="pt-2 border-t border-(--line) space-y-1 max-h-36 overflow-y-auto pr-1">
                  {#each cat.paths as p}
                    <div class="text-[10px] font-mono text-(--muted) bg-(--surface) p-1.5 rounded border border-(--line) truncate">
                      {p}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 2: APP UNINSTALLER -->
  {:else if activeTab === "memory"}
    <MemoryPanel />

  {:else if activeTab === "uninstall"}
    <div class="space-y-4">
      <!-- Search & Header Bar -->
      <div class="panel p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="relative flex-1 w-full sm:max-w-md">
          <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted) pointer-events-none" />
          <input
            type="text"
            bind:value={appSearchQuery}
            placeholder="Search installed applications…"
            class="field text-xs h-8.5 pr-3 rounded-xl w-full"
            style="padding-left: 2.25rem;"
          />
        </div>

        <button
          type="button"
          onclick={handleScanApps}
          disabled={isScanningApps}
          class="btn btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-(--line)"
        >
          <RefreshCw size={13} class={isScanningApps ? "animate-spin" : ""} />
          <span>{isScanningApps ? "Scanning Apps…" : "Refresh Apps"}</span>
        </button>
      </div>

      <!-- Installed Apps Grid -->
      {#if isScanningApps && installedApps.length === 0}
        <div class="py-16 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <RefreshCw size={28} class="animate-spin mb-2 text-amber-400" />
          <span class="text-xs font-bold text-(--ink)">Scanning Installed Applications & Leftovers…</span>
          <span class="text-[10px] text-(--muted) mt-0.5">Searching /Applications, Application Support, Containers, and Caches</span>
        </div>
      {:else if filteredApps.length === 0}
        <div class="py-12 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <AppWindow size={28} class="mb-2 text-(--muted)" />
          <span class="text-xs font-bold text-(--ink)">No Applications Found</span>
          <span class="text-[10px] text-(--muted) mt-0.5">No apps matched your search filter.</span>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-2.5">
          {#each filteredApps as app (app.id)}
            {@const isExpanded = expandedAppIds.has(app.id)}
            <div class="p-3.5 rounded-2xl bg-(--paper) border border-(--line) space-y-2 transition-all hover:border-(--focus)">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text) font-bold text-xs shrink-0 shadow-xs">
                    {app.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-xs text-(--ink) truncate">{app.name}</span>
                      <span class="badge text-[9px] px-1.5 py-0 font-mono">v{app.version}</span>
                    </div>
                    <span class="text-[10px] text-(--muted) font-mono block truncate">{app.bundle_id || app.path}</span>
                  </div>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <div class="text-right">
                    <span class="font-bold text-xs text-(--ink) font-mono block">
                      {formatBytes(app.total_size_bytes)}
                    </span>
                    <span class="text-[10px] text-(--muted) font-mono">
                      Bundle: {formatBytes(app.bundle_size_bytes)} · {app.leftovers.length} leftovers
                    </span>
                  </div>

                  <button
                    type="button"
                    onclick={() => toggleAppExpand(app.id)}
                    class="btn btn-ghost p-1 text-(--muted) hover:text-(--ink)"
                    title="Inspect remnants"
                  >
                    {#if isExpanded}
                      <ChevronDown size={14} />
                    {:else}
                      <ChevronRight size={14} />
                    {/if}
                  </button>

                  <button
                    type="button"
                    onclick={() => {
                      selectedAppForUninstall = app;
                      isUninstallModalOpen = true;
                    }}
                    class="btn btn-ghost text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 px-2.5 py-1"
                  >
                    Uninstall
                  </button>
                </div>
              </div>

              {#if isExpanded}
                <div class="pt-2 border-t border-(--line) space-y-1.5">
                  <span class="text-[10px] font-bold text-(--muted) uppercase tracking-wide block">Discovered Leftover Files:</span>
                  {#if app.leftovers.length === 0}
                    <span class="text-[11px] text-(--muted)">No residual files found outside application bundle.</span>
                  {:else}
                    <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {#each app.leftovers as left}
                        <div class="flex items-center justify-between p-1.5 rounded bg-(--surface) border border-(--line) text-[10px]">
                          <span class="font-mono text-(--ink) truncate max-w-md">{left.path}</span>
                          <div class="flex items-center gap-1.5 shrink-0 ml-2">
                            <span class="badge text-[8px] px-1 py-0">{left.category}</span>
                            <span class="font-mono text-(--muted)">{formatBytes(left.size_bytes)}</span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 3: SYSTEM OPTIMIZER -->
  {:else if activeTab === "optimize"}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Task 1: DNS Flush -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-(--ink)">
              {platformInfo?.is_windows ? "Windows DNS Resolver Cache Flush" : "DNS & mDNS Cache Flush"}
            </span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">Safe</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            {platformInfo?.is_windows
              ? "Runs ipconfig /flushdns to clear Windows DNS resolver cache and solve connection drops."
              : "Flushes stale domain name resolution caches and restarts mDNSResponder to fix network timeout and routing issues."}
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("dns_flush")}
          disabled={activeOptimizingTasks.has("dns_flush")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <RefreshCw size={12} class={activeOptimizingTasks.has("dns_flush") ? "animate-spin" : "text-(--accent-text)"} />
          <span>{activeOptimizingTasks.has("dns_flush") ? "Flushing DNS…" : (platformInfo?.is_windows ? "Run ipconfig /flushdns" : "Flush DNS Cache")}</span>
        </button>
      </div>

      <!-- Task 2: QuickLook Reset -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-(--ink)">
              {platformInfo?.is_windows ? "Windows Icon & Explorer Cache Reset" : "QuickLook & Thumbnail Refresh"}
            </span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">Safe</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            {platformInfo?.is_windows
              ? "Resets IconCache.db database in %LOCALAPPDATA% to fix blank or corrupted desktop icons."
              : "Resets corrupt thumbnail caches and restarts icon services for Finder and QuickLook preview windows."}
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("quicklook_reset")}
          disabled={activeOptimizingTasks.has("quicklook_reset")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <RotateCcw size={12} class={activeOptimizingTasks.has("quicklook_reset") ? "animate-spin" : "text-amber-400"} />
          <span>{activeOptimizingTasks.has("quicklook_reset") ? "Resetting…" : (platformInfo?.is_windows ? "Reset Icon Cache" : "Reset QuickLook Caches")}</span>
        </button>
      </div>

      <!-- Task 3: Memory Purge -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-(--ink)">RAM Memory Purge</span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">Fast</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            Relieves inactive and purgeable volatile RAM pages via macOS Mach kernel memory pressure relief.
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("memory_purge")}
          disabled={activeOptimizingTasks.has("memory_purge")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <Zap size={12} class={activeOptimizingTasks.has("memory_purge") ? "animate-spin" : "text-(--success)"} />
          <span>{activeOptimizingTasks.has("memory_purge") ? "Relieving RAM…" : "Purge RAM Caches"}</span>
        </button>
      </div>

      <!-- Task 4: LaunchServices Rebuild -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-(--ink)">LaunchServices Database Rebuild</span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">System</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            Reconstructs macOS application associations, "Open With" menu registries, and duplicate app entries.
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("launch_services_rebuild")}
          disabled={activeOptimizingTasks.has("launch_services_rebuild")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <FileText size={12} class={activeOptimizingTasks.has("launch_services_rebuild") ? "animate-spin" : "text-purple-400"} />
          <span>{activeOptimizingTasks.has("launch_services_rebuild") ? "Rebuilding…" : "Rebuild LaunchServices"}</span>
        </button>
      </div>
    </div>

  <!-- TAB 4: SYSTEM STATUS & HARDWARE METRICS -->
  {:else if activeTab === "status"}
    <div class="space-y-4">
      {#if hardwareMetrics}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- CPU Card -->
          <div class="p-4 rounded-2xl bg-(--surface) border border-(--line) shadow-xs space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-(--muted) flex items-center gap-1.5 font-medium">
                <Cpu size={14} class="text-(--accent-text)" />
                CPU Usage
              </span>
              <span class="font-bold text-(--ink) font-mono">{hardwareMetrics.cpu_usage_percent.toFixed(1)}%</span>
            </div>
            <div class="w-full h-2 bg-(--surface) rounded-full overflow-hidden border border-(--line)">
              <div
                class="h-full bg-linear-to-r from-emerald-500 to-amber-500 rounded-full transition-all duration-300"
                style="width: {Math.min(100, hardwareMetrics.cpu_usage_percent)}%;"
              ></div>
            </div>
            <span class="text-[10px] text-(--muted) font-mono block">
              {hardwareMetrics.cpu_core_count} Cores Active
            </span>
          </div>

          <!-- Memory Card -->
          <div class="p-4 rounded-2xl bg-(--surface) border border-(--line) shadow-xs space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-(--muted) flex items-center gap-1.5 font-medium">
                <Layers size={14} class="text-(--success)" />
                Memory Usage
              </span>
              <span class="font-bold text-(--ink) font-mono">{hardwareMetrics.memory_used_percent.toFixed(1)}%</span>
            </div>
            <div class="w-full h-2 bg-(--surface) rounded-full overflow-hidden border border-(--line)">
              <div
                class="h-full bg-linear-to-r from-emerald-500 to-rose-500 rounded-full transition-all duration-300"
                style="width: {hardwareMetrics.memory_used_percent}%;"
              ></div>
            </div>
            <span class="text-[10px] text-(--muted) font-mono block">
              {formatBytes(hardwareMetrics.memory_used_bytes)} / {formatBytes(hardwareMetrics.memory_total_bytes)}
            </span>
          </div>

          <!-- Disk Card -->
          <div class="p-4 rounded-2xl bg-(--surface) border border-(--line) shadow-xs space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-(--muted) flex items-center gap-1.5 font-medium">
                <HardDrive size={14} class="text-amber-400" />
                {platformInfo?.default_disk_label ?? "System Drive"}
              </span>
              <span class="font-bold text-(--ink) font-mono">{hardwareMetrics.disk_used_percent.toFixed(1)}%</span>
            </div>
            <div class="w-full h-2 bg-(--surface) rounded-full overflow-hidden border border-(--line)">
              <div
                class="h-full bg-amber-400 rounded-full transition-all duration-300"
                style="width: {hardwareMetrics.disk_used_percent}%;"
              ></div>
            </div>
            <span class="text-[10px] text-(--muted) font-mono block">
              {formatBytes(hardwareMetrics.disk_available_bytes)} Free of {formatBytes(hardwareMetrics.disk_total_bytes)}
            </span>
          </div>

          <!-- Uptime Card -->
          <div class="p-4 rounded-2xl bg-(--surface) border border-(--line) shadow-xs space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-(--muted) flex items-center gap-1.5 font-medium">
                <Clock size={14} class="text-indigo-400" />
                System Uptime
              </span>
            </div>
            <span class="text-lg font-bold text-(--ink) font-mono block">
              {Math.floor(hardwareMetrics.uptime_seconds / 86400)}d {Math.floor((hardwareMetrics.uptime_seconds % 86400) / 3600)}h
            </span>
            <span class="text-[10px] text-(--muted) font-mono block">
              Swap: {formatBytes(hardwareMetrics.swap_used_bytes)} used
            </span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Deletion Confirmation Modal -->
<Modal
  open={isCleanModalOpen}
  title="Confirm Deep Cleanup"
  description={`Delete ${selectedCategoryIds.size} selected categories and reclaim about ${formatBytes(selectedTotalBytes)}? This cannot be undone.`}
  confirmText={canConfirmClean ? "Clean Selected" : "Tick the box above first"}
  confirmVariant={selectedReviewCategories.length > 0 ? "destructive" : "primary"}
  onClose={() => (isCleanModalOpen = false)}
  onConfirm={handleConfirmClean}
>
  {#if selectedReviewCategories.length > 0}
    <!-- The checkbox in the list selects; this confirms. Emptying the Trash is not the
         same decision as rebuilding a cache, so it is not covered by the same tick. -->
    <div class="rounded-xl border border-(--error)/40 bg-(--error)/10 p-3 space-y-2">
      <div class="flex items-center gap-2">
        <TriangleAlert size={14} class="text-(--error) shrink-0" />
        <span class="text-xs font-bold text-(--ink)">These hold files you chose to keep</span>
      </div>
      {#each selectedReviewCategories as cat (cat.id)}
        <div class="text-[11px]">
          <span class="text-(--ink) font-semibold">{cat.name}</span>
          <span class="text-(--muted) font-mono"> · {formatBytes(cat.size_bytes)}, {cat.item_count} items</span>
          {#if cat.risk_note}
            <span class="block text-(--muted)">{cat.risk_note}</span>
          {/if}
        </div>
      {/each}
      <label class="flex items-start gap-2 pt-1 cursor-pointer">
        <input
          type="checkbox"
          class="mt-0.5 shrink-0 accent-(--accent)"
          bind:checked={reviewAcknowledged}
        />
        <span class="text-[11px] text-(--ink)">
          I have reviewed these and want them deleted permanently.
        </span>
      </label>
    </div>
  {:else}
    <p class="text-[11px] text-(--muted) m-0">
      Every selected category regenerates itself. The only cost is a slower first run
      afterwards.
    </p>
  {/if}
</Modal>

<!-- App Uninstall Confirmation Modal -->
<Modal
  open={isUninstallModalOpen}
  title="Confirm Application Uninstall"
  description={`Permanently remove ${selectedAppForUninstall?.name ?? "this application"} and its ${selectedAppForUninstall?.leftovers.length ?? 0} associated leftover files? Total reclaimed space: ~${formatBytes(selectedAppForUninstall?.total_size_bytes ?? 0)}.`}
  confirmText="Uninstall App"
  onClose={() => {
    isUninstallModalOpen = false;
    selectedAppForUninstall = null;
  }}
  onConfirm={handleConfirmUninstall}
/>
