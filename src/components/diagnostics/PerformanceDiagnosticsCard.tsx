import { useState, type FC } from "react";
import {
  CardComponent,
  ButtonComponent,
  BadgeComponent,
  ModalComponent,
} from "@/shared/ui";
import {
  Cpu,
  Activity,
  Zap,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { usePerformanceDiagnostics } from "@/shared/lib/usePerformanceDiagnostics";
import { cn } from "@/lib/utils";

export interface PerformanceDiagnosticsCardProps {
  showToast?: (type: "success" | "error" | "info", message: string) => void;
  className?: string;
}

const MEMORY_SAFE_CEILING_MB = 500;

export const PerformanceDiagnosticsCard: FC<PerformanceDiagnosticsCardProps> = ({
  showToast,
  className,
}) => {
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);

  const {
    metrics,
    fps,
    latencyMs,
    backgroundRamSaver,
    isBenchmarking,
    isTrimming,
    toggleBackgroundRamSaver,
    runBenchmark,
    trimMemory,
    refreshMetrics,
  } = usePerformanceDiagnostics();

  // Prefer physical footprint (Activity Monitor metric), fallback to resident size
  const physicalMb = metrics.phys_footprint_mb && metrics.phys_footprint_mb > 0
    ? metrics.phys_footprint_mb
    : metrics.resident_size_mb;

  const peakMb = metrics.peak_phys_footprint_mb && metrics.peak_phys_footprint_mb > 0
    ? metrics.peak_phys_footprint_mb
    : Math.max(physicalMb, metrics.resident_size_mb);

  // Realistic thresholds for desktop WebKit + CoreAudio app
  const memoryStatus: { label: string; variant: "emerald" | "default" | "coral" } =
    physicalMb < 120
      ? { label: "OPTIMAL", variant: "emerald" }
      : physicalMb < 250
      ? { label: "HEALTHY", variant: "default" }
      : { label: "ELEVATED", variant: "coral" };

  const memoryPercentage = Math.min(
    100,
    Math.max(4, Math.round((physicalMb / MEMORY_SAFE_CEILING_MB) * 100))
  );

  const handleBenchmark = async () => {
    try {
      const res = await runBenchmark();
      showToast?.(
        "info",
        `Benchmark complete: ${res.avgLatencyMs.toFixed(1)}ms avg latency (min ${res.minLatencyMs}ms, max ${res.maxLatencyMs}ms), ${res.fps} FPS`
      );
    } catch {
      showToast?.("error", "IPC benchmark failed");
    }
  };

  const handleConfirmPurgeMemory = async () => {
    setIsPurgeModalOpen(false);
    try {
      const res = await trimMemory();
      const reclaimedMb = (res.bytes_reclaimed / (1024 * 1024)).toFixed(1);
      showToast?.(
        "success",
        `Memory purged! Reclaimed ~${reclaimedMb} MB (Current footprint: ${res.phys_footprint_mb.toFixed(1)} MB)`
      );
    } catch {
      showToast?.("error", "Memory purge failed");
    }
  };

  const handleManualRefresh = async () => {
    try {
      await refreshMetrics();
      showToast?.("info", "Diagnostics metrics refreshed");
    } catch {
      showToast?.("error", "Failed to refresh metrics");
    }
  };

  return (
    <>
      <div className={className}>
        <CardComponent
          title="Performance & Memory Diagnostics"
          subtitle="Native macOS Mach task info & low-overhead background resource management"
          extra={<Cpu className="w-4 h-4 text-[var(--accent-text)]" />}
        >
          <div className="space-y-4">
            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Stat 1: Physical Footprint / App RAM */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1.5 transition-colors hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <HardDrive className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                    App Memory
                  </span>
                  <BadgeComponent
                    variant={memoryStatus.variant}
                    className="text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider"
                  >
                    {memoryStatus.label}
                  </BadgeComponent>
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold font-mono text-[var(--ink)] tracking-tight">
                    {physicalMb.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">MB</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                    Mach Phys Footprint · RSS {metrics.resident_size_mb.toFixed(1)}M
                  </span>
                </div>
              </div>

              {/* Stat 2: Peak Memory Footprint (High Water Mark) */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1.5 transition-colors hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Zap className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                    Peak Memory
                  </span>
                  <BadgeComponent
                    variant="default"
                    className="text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider"
                  >
                    HWM
                  </BadgeComponent>
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold font-mono text-[var(--ink)] tracking-tight">
                    {peakMb.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">MB</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    Session High-Water Mark
                  </span>
                </div>
              </div>

              {/* Stat 3: Render Rate */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1.5 transition-colors hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Activity className="w-3.5 h-3.5 text-[var(--success)]" />
                    Render Rate
                  </span>
                  <BadgeComponent variant="emerald" className="text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
                    VSYNC
                  </BadgeComponent>
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold font-mono text-[var(--ink)] tracking-tight">
                    {fps}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">FPS</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    Adaptive UI Refresh
                  </span>
                </div>
              </div>

              {/* Stat 4: IPC Round-Trip Latency */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1.5 transition-colors hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 text-[var(--warning)]" />
                    IPC Latency
                  </span>
                  <BadgeComponent variant="default" className="text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider">
                    RTT
                  </BadgeComponent>
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold font-mono text-[var(--ink)] tracking-tight">
                    {latencyMs.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">ms</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    Sub-millisecond Bridge
                  </span>
                </div>
              </div>
            </div>

            {/* Memory Capacity Health Visualizer */}
            <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[var(--ink)]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Memory Footprint vs Studio Budget
                </span>
                <span className="font-mono text-[11px] text-[var(--muted)]">
                  <span className="font-semibold text-[var(--ink)]">{physicalMb.toFixed(1)} MB</span> / {MEMORY_SAFE_CEILING_MB} MB ({memoryPercentage}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden border border-[var(--line)]/60">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    memoryStatus.variant === "emerald"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : memoryStatus.variant === "default"
                      ? "bg-gradient-to-r from-[var(--accent)] to-blue-400"
                      : "bg-gradient-to-r from-amber-500 to-rose-500"
                  )}
                  style={{ width: `${memoryPercentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                <span>CoreAudio DSP + WebKit Runtime</span>
                <span className="text-emerald-500 font-medium">
                  {physicalMb < 150 ? "Lean & Efficient Overhead" : "Operating within Normal Bounds"}
                </span>
              </div>
            </div>

            {/* Resource Controls & Actions Strip */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={backgroundRamSaver}
                  onClick={() => {
                    const next = !backgroundRamSaver;
                    toggleBackgroundRamSaver(next);
                    showToast?.(
                      "info",
                      `Background RAM Saver ${next ? "enabled" : "disabled"}`
                    );
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50",
                    backgroundRamSaver ? "bg-emerald-500" : "bg-[var(--input-line)]"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                      backgroundRamSaver ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--ink)]">
                      Background Eco & RAM Saver
                    </span>
                    <span
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1",
                        backgroundRamSaver
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)]"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          backgroundRamSaver ? "bg-emerald-500" : "bg-[var(--muted)]"
                        )}
                      />
                      {backgroundRamSaver ? "Active" : "Standby"}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--muted)] block">
                    Auto-throttles 60FPS visualizers and trims inactive memory heap when minimized
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ButtonComponent
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Refresh
                </ButtonComponent>

                <ButtonComponent
                  variant="outline"
                  size="sm"
                  onClick={handleBenchmark}
                  disabled={isBenchmarking}
                  leftIcon={<RefreshCw className={cn("w-3.5 h-3.5", isBenchmarking && "animate-spin")} />}
                  className="text-xs"
                >
                  {isBenchmarking ? "Testing…" : "Benchmark IPC"}
                </ButtonComponent>

                <ButtonComponent
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsPurgeModalOpen(true)}
                  disabled={isTrimming}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Purge RAM
                </ButtonComponent>
              </div>
            </div>
          </div>
        </CardComponent>
      </div>

      {/* Confirmation Modal for Purging Memory Cache */}
      <ModalComponent
        open={isPurgeModalOpen}
        onClose={() => setIsPurgeModalOpen(false)}
        title="Purge Inactive Memory Cache?"
        description="This will trigger native macOS memory pressure relief (malloc_zone_pressure_relief) to release idle heap blocks and audio ringbuffers. Audio processing will remain active."
        confirmText="Purge Memory"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<Trash2 className="w-5 h-5 text-[var(--warning)]" />}
        onConfirm={handleConfirmPurgeMemory}
      />
    </>
  );
};
