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
  } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import {
    scanSystemClean,
    executeClean,
    scanInstalledApps,
    uninstallApp,
    runOptimizationTask,
    getHardwareMetrics,
    formatBytes,
    type CleanScanResult,
    type InstalledAppInfo,
    type SystemHardwareMetrics,
  } from "@/lib/cleaner";

  type ActiveCleanerTab = "clean" | "uninstall" | "optimize" | "status";

  let activeTab = $state<ActiveCleanerTab>("clean");

  // Deep Clean state
  let isScanningClean = $state(false);
  let isCleaning = $state(false);
  let scanResult = $state<CleanScanResult | null>(null);
  let selectedCategoryIds = $state<Set<string>>(new Set());
  let expandedCategoryIds = $state<Set<string>>(new Set());
  let isCleanModalOpen = $state(false);
  let cleanFilterGroup = $state<"all" | "system" | "developer" | "browser" | "user">("all");

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

  // Initial load
  $effect(() => {
    handleScanClean();
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  });

  // 1. Deep Clean Handlers
  async function handleScanClean() {
    isScanningClean = true;
    try {
      const res = await scanSystemClean();
      scanResult = res;
      // Pre-select all categories by default
      selectedCategoryIds = new Set(res.categories.map((c) => c.id));
      toastState.info(`Scanned ${res.categories.length} cleanup categories (${formatBytes(res.total_size_bytes)})`);
    } catch (err) {
      toastState.error(`System scan failed: ${String(err)}`);
    } finally {
      isScanningClean = false;
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

  const filteredCategories = $derived.by(() => {
    if (!scanResult) return [];
    if (cleanFilterGroup === "all") return scanResult.categories;
    return scanResult.categories.filter((c) => c.group === cleanFilterGroup);
  });

  async function handleConfirmClean() {
    isCleanModalOpen = false;
    isCleaning = true;
    try {
      const res = await executeClean(Array.from(selectedCategoryIds));
      toastState.success(`Cleaned ${formatBytes(res.bytes_reclaimed)} (${res.items_removed} items removed)`);
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
        <h2 class="text-sm font-bold text-(--ink) m-0">macOS System Studio & Cleaner</h2>
        <p class="text-[11px] text-(--muted) m-0">Mole-grade deep cleaning, app uninstallation, and system optimization</p>
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
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-(--ink)">Reclaimable Space:</span>
            <span class="text-base font-extrabold text-(--accent-text) font-mono">
              {formatBytes(selectedTotalBytes)}
            </span>
            <span class="text-[11px] text-(--muted) font-mono">
              ({selectedCategoryIds.size} / {scanResult ? scanResult.categories.length : 0} categories)
            </span>
          </div>
          <p class="text-[11px] text-(--muted) m-0">
            Preview is safe and dry-run verified. Only selected categories will be removed upon confirmation.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={handleScanClean}
            disabled={isScanningClean || isCleaning}
            class="btn btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-(--line)"
          >
            <RefreshCw size={13} class={isScanningClean ? "animate-spin" : ""} />
            <span>{isScanningClean ? "Scanning…" : "Re-Scan"}</span>
          </button>

          <button
            type="button"
            onclick={() => (isCleanModalOpen = true)}
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

      <!-- Categories List -->
      {#if isScanningClean && !scanResult}
        <div class="py-16 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <RefreshCw size={28} class="animate-spin mb-2 text-(--accent-text)" />
          <span class="text-xs font-bold text-(--ink)">Scanning macOS File System…</span>
          <span class="text-[10px] text-(--muted) mt-0.5">Inspecting Caches, Developer DerivedData, Logs, and Leftovers</span>
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
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-xs text-(--ink) truncate">{cat.name}</span>
                      <span class="badge text-[9px] px-1.5 py-0 uppercase">{cat.group}</span>
                    </div>
                    <p class="text-[11px] text-(--muted) m-0 truncate">{cat.description}</p>
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
            <span class="text-xs font-bold text-(--ink)">DNS & mDNS Cache Flush</span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">Safe</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            Flushes stale domain name resolution caches and restarts mDNSResponder to fix network timeout and routing issues.
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("dns_flush")}
          disabled={activeOptimizingTasks.has("dns_flush")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <RefreshCw size={12} class={activeOptimizingTasks.has("dns_flush") ? "animate-spin" : "text-(--accent-text)"} />
          <span>{activeOptimizingTasks.has("dns_flush") ? "Flushing DNS…" : "Flush DNS Cache"}</span>
        </button>
      </div>

      <!-- Task 2: QuickLook Reset -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-(--ink)">QuickLook & Thumbnail Refresh</span>
            <span class="badge badge-ok text-[9px] px-1.5 py-0">Safe</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            Resets corrupt thumbnail caches and restarts icon services for Finder and QuickLook preview windows.
          </p>
        </div>

        <button
          type="button"
          onclick={() => handleRunOptimization("quicklook_reset")}
          disabled={activeOptimizingTasks.has("quicklook_reset")}
          class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) w-full hover:border-(--focus)"
        >
          <RotateCcw size={12} class={activeOptimizingTasks.has("quicklook_reset") ? "animate-spin" : "text-amber-400"} />
          <span>{activeOptimizingTasks.has("quicklook_reset") ? "Resetting…" : "Reset QuickLook Caches"}</span>
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
                Macintosh HD
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
  description={`Permanently clean ${selectedCategoryIds.size} selected categories and reclaim ~${formatBytes(selectedTotalBytes)} of disk space?`}
  confirmText="Clean Selected"
  onClose={() => (isCleanModalOpen = false)}
  onConfirm={handleConfirmClean}
/>

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
