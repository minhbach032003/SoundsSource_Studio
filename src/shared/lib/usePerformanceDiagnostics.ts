import { useState, useEffect, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface PerformanceMetrics {
  resident_size_bytes: number;
  resident_size_mb: number;
  virtual_size_bytes: number;
  virtual_size_mb: number;
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
  resident_size_bytes: 42 * 1024 * 1024,
  resident_size_mb: 42.5,
  virtual_size_bytes: 512 * 1024 * 1024,
  virtual_size_mb: 512.0,
  uptime_seconds: 120,
  background_mode_active: false,
};

export function usePerformanceDiagnostics() {
  const isDesktop = isRunningInTauri();
  const [metrics, setMetrics] = useState<PerformanceMetrics>(DEFAULT_METRICS);
  const [fps, setFps] = useState<number>(60);
  const [latencyMs, setLatencyMs] = useState<number>(0.8);
  const [backgroundRamSaver, setBackgroundRamSaver] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rust_sound_bg_ram_saver");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [isBackground, setIsBackground] = useState<boolean>(false);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [isTrimming, setIsTrimming] = useState<boolean>(false);

  // FPS calculation
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number | null = null;
    let isMounted = true;

    const loop = (now: number) => {
      if (!isMounted) return;
      frameCount++;
      if (now - lastTime >= 1000) {
        const measuredFps = Math.round((frameCount * 1000) / (now - lastTime));
        setFps(measuredFps);
        frameCount = 0;
        lastTime = now;
      }
      if (typeof document !== "undefined" && !document.hidden) {
        animId = requestAnimationFrame(loop);
      }
    };

    if (typeof document !== "undefined" && !document.hidden) {
      animId = requestAnimationFrame(loop);
    }

    const handleVisibility = () => {
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
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      isMounted = false;
      if (animId !== null) cancelAnimationFrame(animId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, []);

  // Poll metrics periodically
  const fetchMetrics = useCallback(async () => {
    if (isDesktop) {
      try {
        const res = await invoke<PerformanceMetrics>("get_performance_metrics");
        setMetrics(res);
      } catch {
        // Fallback
      }
    } else {
      // Browser preview simulated telemetry
      setMetrics((prev) => ({
        ...prev,
        uptime_seconds: prev.uptime_seconds + 3,
        resident_size_mb: Number((42.0 + Math.sin(Date.now() / 10000) * 2.5).toFixed(1)),
      }));
    }
  }, [isDesktop]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Window background / foreground lifecycle
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      setIsBackground(hidden);

      if (isDesktop) {
        try {
          await invoke("set_background_mode", { enabled: hidden });
          if (hidden && backgroundRamSaver) {
            await invoke("trim_memory");
          }
        } catch {
          // ignore
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [isDesktop, backgroundRamSaver]);

  // Toggle Background RAM Saver
  const toggleBackgroundRamSaver = useCallback((enabled: boolean) => {
    setBackgroundRamSaver(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("rust_sound_bg_ram_saver", String(enabled));
    }
  }, []);

  // Run Benchmark
  const runBenchmark = useCallback(async (): Promise<BenchmarkResult> => {
    setIsBenchmarking(true);
    const iterations = 10;
    const latencies: number[] = [];

    try {
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        if (isDesktop) {
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
      setLatencyMs(avg);
      await fetchMetrics();

      return {
        avgLatencyMs: avg,
        minLatencyMs: min,
        maxLatencyMs: max,
        fps,
        iterations,
      };
    } finally {
      setIsBenchmarking(false);
    }
  }, [isDesktop, fps, fetchMetrics]);

  // Trim Memory
  const trimMemory = useCallback(async (): Promise<{ resident_size_mb: number; bytes_reclaimed: number }> => {
    setIsTrimming(true);
    try {
      if (isDesktop) {
        const res = await invoke<{
          bytes_reclaimed_hint: number;
          metrics_after: PerformanceMetrics;
        }>("trim_memory");
        setMetrics(res.metrics_after);
        return {
          resident_size_mb: res.metrics_after.resident_size_mb,
          bytes_reclaimed: res.bytes_reclaimed_hint,
        };
      } else {
        await new Promise((r) => setTimeout(r, 400));
        const updated = {
          ...metrics,
          resident_size_mb: Number((metrics.resident_size_mb * 0.92).toFixed(1)),
        };
        setMetrics(updated);
        return {
          resident_size_mb: updated.resident_size_mb,
          bytes_reclaimed: 1024 * 1024 * 3,
        };
      }
    } finally {
      setIsTrimming(false);
    }
  }, [isDesktop, metrics]);

  return {
    metrics,
    fps,
    latencyMs,
    backgroundRamSaver,
    isBackground,
    isBenchmarking,
    isTrimming,
    toggleBackgroundRamSaver,
    runBenchmark,
    trimMemory,
    refreshMetrics: fetchMetrics,
  };
}
