<script lang="ts">
  import {
    Cpu,
    Activity,
    Zap,
    HardDrive,
    RefreshCw,
    RotateCcw,
    Trash2,
    ShieldCheck,
  } from "@lucide/svelte";
  import { performanceDiagnosticsState } from "@/lib/performanceDiagnostics.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import Modal from "@/components/ui/Modal.svelte";

  interface Props {
    showToast?: (type: "success" | "error" | "info", message: string) => void;
    class?: string;
  }

  let { showToast, class: className = "" }: Props = $props();

  let isPurgeModalOpen = $state(false);

  const MEMORY_SAFE_CEILING_MB = 500;

  function notify(type: "success" | "error" | "info", msg: string) {
    if (showToast) {
      showToast(type, msg);
    } else if (type === "success") {
      toastState.success(msg);
    } else if (type === "error") {
      toastState.error(msg);
    } else {
      toastState.info(msg);
    }
  }

  // Derived metrics
  const physicalMb = $derived(
    performanceDiagnosticsState.metrics.phys_footprint_mb &&
      performanceDiagnosticsState.metrics.phys_footprint_mb > 0
      ? performanceDiagnosticsState.metrics.phys_footprint_mb
      : performanceDiagnosticsState.metrics.resident_size_mb
  );

  const peakMb = $derived(
    performanceDiagnosticsState.metrics.peak_phys_footprint_mb &&
      performanceDiagnosticsState.metrics.peak_phys_footprint_mb > 0
      ? performanceDiagnosticsState.metrics.peak_phys_footprint_mb
      : Math.max(physicalMb, performanceDiagnosticsState.metrics.resident_size_mb)
  );

  const memoryStatus = $derived(
    physicalMb < 120
      ? { label: "OPTIMAL", class: "badge-ok" }
      : physicalMb < 250
      ? { label: "HEALTHY", class: "" }
      : { label: "ELEVATED", class: "badge-warn" }
  );

  const memoryPercentage = $derived(
    Math.min(100, Math.max(4, Math.round((physicalMb / MEMORY_SAFE_CEILING_MB) * 100)))
  );

  async function handleBenchmark() {
    try {
      const res = await performanceDiagnosticsState.runBenchmark();
      notify(
        "info",
        `Benchmark complete: ${res.avgLatencyMs.toFixed(1)}ms avg latency (min ${res.minLatencyMs}ms, max ${res.maxLatencyMs}ms), ${res.fps} FPS`
      );
    } catch {
      notify("error", "IPC benchmark failed");
    }
  }

  async function handleConfirmPurgeMemory() {
    isPurgeModalOpen = false;
    try {
      const res = await performanceDiagnosticsState.trimMemory();
      const reclaimedMb = (res.bytes_reclaimed / (1024 * 1024)).toFixed(1);
      notify(
        "success",
        `Memory purged! Reclaimed ~${reclaimedMb} MB (Current footprint: ${res.phys_footprint_mb.toFixed(1)} MB)`
      );
    } catch {
      notify("error", "Memory purge failed");
    }
  }

  async function handleManualRefresh() {
    try {
      await performanceDiagnosticsState.refreshMetrics();
      notify("info", "Diagnostics metrics refreshed");
    } catch {
      notify("error", "Failed to refresh metrics");
    }
  }
</script>

<div class="panel p-4 {className}">
  <!-- Card Header -->
  <div class="flex items-center justify-between pb-3 mb-3 border-b border-(--line)">
    <div class="flex items-center gap-2">
      <Cpu class="w-4 h-4 text-(--accent-text)" />
      <div>
        <h3 class="text-xs font-bold text-(--ink) tracking-tight m-0">
          Performance & Memory Diagnostics
        </h3>
        <p class="text-[10px] text-(--muted) m-0">
          Native macOS Mach task info & low-overhead background resource management
        </p>
      </div>
    </div>
  </div>

  <div class="space-y-3.5">
    <!-- Telemetry Metrics Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <!-- Stat 1: Physical Footprint / App RAM -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5 transition-colors">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <HardDrive class="w-3.5 h-3.5 text-(--accent-text)" />
            App Memory
          </span>
          <span class="badge {memoryStatus.class} text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
            {memoryStatus.label}
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-xl font-bold font-mono text-(--ink) tracking-tight">
            {physicalMb.toFixed(1)} <span class="text-xs font-normal text-(--muted)">MB</span>
          </span>
          <span class="text-[10px] text-(--muted) flex items-center gap-1">
            Mach Phys Footprint · RSS {performanceDiagnosticsState.metrics.resident_size_mb.toFixed(1)}M
          </span>
        </div>
      </div>

      <!-- Stat 2: Peak Memory Footprint (HWM) -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5 transition-colors">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <Zap class="w-3.5 h-3.5 text-(--accent-text)" />
            Peak Memory
          </span>
          <span class="badge text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
            HWM
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-xl font-bold font-mono text-(--ink) tracking-tight">
            {peakMb.toFixed(1)} <span class="text-xs font-normal text-(--muted)">MB</span>
          </span>
          <span class="text-[10px] text-(--muted)">
            Session High-Water Mark
          </span>
        </div>
      </div>

      <!-- Stat 3: Render Rate -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5 transition-colors">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <Activity class="w-3.5 h-3.5 text-(--success)" />
            Render Rate
          </span>
          <span class="badge badge-ok text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
            VSYNC
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-xl font-bold font-mono text-(--ink) tracking-tight">
            {performanceDiagnosticsState.fps} <span class="text-xs font-normal text-(--muted)">FPS</span>
          </span>
          <span class="text-[10px] text-(--muted)">
            Adaptive UI Refresh
          </span>
        </div>
      </div>

      <!-- Stat 4: IPC Round-Trip Latency -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5 transition-colors">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <RefreshCw class="w-3.5 h-3.5 text-(--warning)" />
            IPC Latency
          </span>
          <span class="badge text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
            RTT
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-xl font-bold font-mono text-(--ink) tracking-tight">
            {performanceDiagnosticsState.latencyMs.toFixed(1)} <span class="text-xs font-normal text-(--muted)">ms</span>
          </span>
          <span class="text-[10px] text-(--muted)">
            Sub-millisecond Bridge
          </span>
        </div>
      </div>
    </div>

    <!-- Memory Capacity Health Visualizer -->
    <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="flex items-center gap-1.5 font-medium text-(--ink)">
          <ShieldCheck class="w-3.5 h-3.5 text-(--success)" />
          Memory Footprint vs Studio Budget
        </span>
        <span class="font-mono text-[11px] text-(--muted)">
          <span class="font-semibold text-(--ink)">{physicalMb.toFixed(1)} MB</span> / {MEMORY_SAFE_CEILING_MB} MB ({memoryPercentage}%)
        </span>
      </div>
      <div class="w-full h-2 rounded-full bg-(--surface) overflow-hidden border border-(--line)">
        <div
          class="h-full rounded-full transition-all duration-500 ease-out {memoryStatus.label === 'OPTIMAL'
            ? 'bg-(--success)'
            : memoryStatus.label === 'HEALTHY'
            ? 'bg-(--accent)'
            : 'bg-(--error)'}"
          style="width: {memoryPercentage}%"
        ></div>
      </div>
      <div class="flex items-center justify-between text-[10px] text-(--muted)">
        <span>CoreAudio DSP + WebKit Runtime</span>
        <span class="text-(--success) font-medium">
          {physicalMb < 150 ? "Lean & Efficient Overhead" : "Operating within Normal Bounds"}
        </span>
      </div>
    </div>

    <!-- Resource Controls & Actions Strip -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-(--paper) border border-(--line)">
      <div class="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={performanceDiagnosticsState.backgroundRamSaver}
          aria-label="Toggle Background Eco & RAM Saver"
          onclick={() => {
            const next = !performanceDiagnosticsState.backgroundRamSaver;
            performanceDiagnosticsState.toggleBackgroundRamSaver(next);
            notify("info", `Background RAM Saver ${next ? "enabled" : "disabled"}`);
          }}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {performanceDiagnosticsState.backgroundRamSaver
            ? 'bg-(--success)'
            : 'bg-(--input-line)'}"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-(--paper) shadow-sm transition duration-200 ease-in-out {performanceDiagnosticsState.backgroundRamSaver
              ? 'translate-x-4'
              : 'translate-x-0'}"
          ></span>
        </button>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-(--ink)">
              Background Eco & RAM Saver
            </span>
            <span
              class="badge {performanceDiagnosticsState.backgroundRamSaver
                ? 'badge-ok'
                : ''} text-[9px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
            >
              <span
                class="w-1.5 h-1.5 rounded-full {performanceDiagnosticsState.backgroundRamSaver
                  ? 'bg-(--success)'
                  : 'bg-(--muted)'}"
              ></span>
              {performanceDiagnosticsState.backgroundRamSaver ? "Active" : "Standby"}
            </span>
          </div>
          <span class="text-[11px] text-(--muted) block">
            Auto-throttles visualizers and trims inactive memory heap when minimized
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onclick={handleManualRefresh}
          class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>

        <button
          type="button"
          onclick={handleBenchmark}
          disabled={performanceDiagnosticsState.isBenchmarking}
          class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw
            class="w-3.5 h-3.5 {performanceDiagnosticsState.isBenchmarking ? 'animate-spin' : ''}"
          />
          <span>{performanceDiagnosticsState.isBenchmarking ? "Testing…" : "Benchmark IPC"}</span>
        </button>

        <button
          type="button"
          onclick={() => (isPurgeModalOpen = true)}
          disabled={performanceDiagnosticsState.isTrimming}
          class="btn border border-(--error) bg-(--paper) text-(--error) hover:bg-(--surface) text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Purge RAM</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Modal Confirmation for Purging Memory Cache -->
<Modal
  open={isPurgeModalOpen}
  onClose={() => (isPurgeModalOpen = false)}
  title="Purge Inactive Memory Cache?"
  description="This will trigger native macOS memory pressure relief (malloc_zone_pressure_relief) to release idle heap blocks and audio ringbuffers. Audio processing will remain active."
  confirmText="Purge Memory"
  cancelText="Cancel"
  confirmVariant="destructive"
  onConfirm={handleConfirmPurgeMemory}
/>
