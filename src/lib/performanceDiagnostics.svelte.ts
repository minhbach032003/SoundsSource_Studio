import { invoke, isTauri } from "@tauri-apps/api/core";

export interface PerformanceMetrics {
  resident_size_bytes: number;
  resident_size_mb: number;
  virtual_size_bytes: number;
  virtual_size_mb: number;
  phys_footprint_bytes?: number;
  phys_footprint_mb?: number;
  peak_phys_footprint_bytes?: number;
  peak_phys_footprint_mb?: number;
  uptime_seconds: number;
  background_mode_active: boolean;
}

export interface BenchmarkResult {
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  fps: number;
  iterations: number;
}

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTauri() ||
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

const DEFAULT_METRICS: PerformanceMetrics = {
  resident_size_bytes: 52 * 1024 * 1024,
  resident_size_mb: 52.4,
  virtual_size_bytes: 512 * 1024 * 1024,
  virtual_size_mb: 512.0,
  phys_footprint_bytes: 48 * 1024 * 1024,
  phys_footprint_mb: 48.2,
  peak_phys_footprint_bytes: 64 * 1024 * 1024,
  peak_phys_footprint_mb: 64.0,
  uptime_seconds: 120,
  background_mode_active: false,
};

export class PerformanceDiagnosticsState {
  metrics = $state<PerformanceMetrics>(DEFAULT_METRICS);
  fps = $state(60);
  latencyMs = $state(0.8);
  backgroundRamSaver = $state(true);
  isBackground = $state(false);
  isBenchmarking = $state(false);
  isTrimming = $state(false);

  private isDesktop = isRunningInTauri();

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rust_sound_bg_ram_saver");
      this.backgroundRamSaver = saved !== null ? saved === "true" : true;
    }

    this.initFpsLoop();
    this.initPolling();
    this.initLifecycle();
  }

  private initFpsLoop() {
    if (typeof document === "undefined") return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number | null = null;

    const loop = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        this.fps = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
      }
      if (!document.hidden) {
        animId = requestAnimationFrame(loop);
      }
    };

    if (!document.hidden) {
      animId = requestAnimationFrame(loop);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (animId !== null) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } else {
        lastTime = performance.now();
        frameCount = 0;
        animId = requestAnimationFrame(loop);
      }
    });
  }

  private initPolling() {
    this.refreshMetrics();
    setInterval(() => {
      this.refreshMetrics();
    }, 3000);
  }

  private initLifecycle() {
    if (typeof document === "undefined") return;

    document.addEventListener("visibilitychange", async () => {
      const hidden = document.hidden;
      this.isBackground = hidden;

      if (this.isDesktop) {
        try {
          await invoke("set_background_mode", { enabled: hidden });
          if (hidden && this.backgroundRamSaver) {
            await invoke("trim_memory");
          }
        } catch {
          // ignore
        }
      }
    });
  }

  async refreshMetrics() {
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.isDesktop) {
      try {
        const res = await invoke<PerformanceMetrics>("get_performance_metrics");
        this.metrics = res;
      } catch {
        // Fallback
      }
    } else {
      const prev = this.metrics;
      const simFootprint = Number((48.0 + Math.sin(Date.now() / 8000) * 2.0).toFixed(1));
      const simRss = Number((simFootprint + 8.5).toFixed(1));
      const simPeak = Math.max(prev.peak_phys_footprint_mb ?? 60.0, simFootprint + 4.0);
      this.metrics = {
        ...prev,
        uptime_seconds: prev.uptime_seconds + 3,
        resident_size_mb: simRss,
        resident_size_bytes: Math.round(simRss * 1024 * 1024),
        phys_footprint_mb: simFootprint,
        phys_footprint_bytes: Math.round(simFootprint * 1024 * 1024),
        peak_phys_footprint_mb: simPeak,
        peak_phys_footprint_bytes: Math.round(simPeak * 1024 * 1024),
      };
    }
  }

  toggleBackgroundRamSaver(enabled: boolean) {
    this.backgroundRamSaver = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem("rust_sound_bg_ram_saver", String(enabled));
    }
  }

  async runBenchmark(): Promise<BenchmarkResult> {
    this.isBenchmarking = true;
    const iterations = 10;
    const latencies: number[] = [];

    try {
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        if (this.isDesktop) {
          await invoke("benchmark_ipc_latency", { clientTimestampMs: start });
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
        const rtt = performance.now() - start;
        latencies.push(rtt);
      }

      const sum = latencies.reduce((a, b) => a + b, 0);
      const avg = Number((sum / iterations).toFixed(2));
      const min = Number(Math.min(...latencies).toFixed(2));
      const max = Number(Math.max(...latencies).toFixed(2));
      this.latencyMs = avg;
      await this.refreshMetrics();

      return {
        avgLatencyMs: avg,
        minLatencyMs: min,
        maxLatencyMs: max,
        fps: this.fps,
        iterations,
      };
    } finally {
      this.isBenchmarking = false;
    }
  }

  async trimMemory(): Promise<{
    resident_size_mb: number;
    phys_footprint_mb: number;
    bytes_reclaimed: number;
  }> {
    this.isTrimming = true;
    try {
      if (this.isDesktop) {
        const res = await invoke<{
          bytes_reclaimed_hint: number;
          metrics_after: PerformanceMetrics;
        }>("trim_memory");
        this.metrics = res.metrics_after;
        return {
          resident_size_mb: res.metrics_after.resident_size_mb,
          phys_footprint_mb: res.metrics_after.phys_footprint_mb ?? res.metrics_after.resident_size_mb,
          bytes_reclaimed: res.bytes_reclaimed_hint,
        };
      } else {
        await new Promise((r) => setTimeout(r, 400));
        const currentRss = this.metrics.resident_size_mb;
        const currentFootprint = this.metrics.phys_footprint_mb ?? 48.0;
        const updated = {
          ...this.metrics,
          resident_size_mb: Number((currentRss * 0.92).toFixed(1)),
          phys_footprint_mb: Number((currentFootprint * 0.90).toFixed(1)),
        };
        this.metrics = updated;
        return {
          resident_size_mb: updated.resident_size_mb,
          phys_footprint_mb: updated.phys_footprint_mb,
          bytes_reclaimed: 1024 * 1024 * 4,
        };
      }
    } finally {
      this.isTrimming = false;
    }
  }
}

export const performanceDiagnosticsState = new PerformanceDiagnosticsState();
