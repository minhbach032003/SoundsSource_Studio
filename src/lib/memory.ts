import { invoke, isTauri } from "@tauri-apps/api/core";

export interface MemorySegment {
  id: string;
  label: string;
  bytes: number;
}

export interface MemorySnapshot {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  used_percent: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  reclaimable_bytes: number;
  segments: MemorySegment[];
  captured_at_secs: number;
}

export interface MemoryArea {
  id: string;
  name: string;
  description: string;
  supported: boolean;
  needs_privileges: boolean;
  prompts_for_credentials: boolean;
  background_safe: boolean;
}

export interface MemoryAreaOutcome {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
}

export interface MemoryCleanReport {
  before: MemorySnapshot;
  after: MemorySnapshot;
  freed_bytes: number;
  outcomes: MemoryAreaOutcome[];
  duration_ms: number;
}

export interface AutoCleanPolicy {
  enabled: boolean;
  areas: string[];
  every_minutes: number | null;
  when_used_percent_above: number | null;
  cooldown_minutes: number;
}

export type AutoCleanDecision =
  | { state: "idle"; reason: string }
  | { state: "run"; trigger: { kind: "interval" } | { kind: "usage_above"; used_percent: number } };

export interface MemoryRunRecord {
  at_secs: number;
  trigger: string;
  freed_bytes: number;
  used_percent_before: number;
  used_percent_after: number;
  areas_run: number;
  areas_failed: number;
  notes: string[];
}

export interface MemoryAutoStatus {
  policy: AutoCleanPolicy;
  decision: AutoCleanDecision;
  seconds_since_last_run: number | null;
  history: MemoryRunRecord[];
}

/** Signed: a clean can legitimately end with less free memory than it started. */
export function formatSignedBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : bytes > 0 ? "+" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = abs / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${sign}${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Plain-language reason the scheduler is or is not about to act. */
export function describeDecision(decision: AutoCleanDecision | undefined): string {
  if (!decision) return "Checking...";
  if (decision.state === "idle") return decision.reason;
  return decision.trigger.kind === "interval"
    ? "Due now: the scheduled interval came round"
    : `Due now: memory use is at ${decision.trigger.used_percent.toFixed(1)}%`;
}

const MOCK_SNAPSHOT: MemorySnapshot = {
  total_bytes: 16 * 1024 ** 3,
  available_bytes: 5.4 * 1024 ** 3,
  used_bytes: 10.6 * 1024 ** 3,
  used_percent: 66.3,
  swap_total_bytes: 2 * 1024 ** 3,
  swap_used_bytes: 310 * 1024 ** 2,
  reclaimable_bytes: 3.1 * 1024 ** 3,
  segments: [
    { id: "app", label: "App memory", bytes: 6.2 * 1024 ** 3 },
    { id: "wired", label: "Wired", bytes: 2.1 * 1024 ** 3 },
    { id: "compressed", label: "Compressed", bytes: 1.2 * 1024 ** 3 },
    { id: "file_cache", label: "Cached files", bytes: 2.8 * 1024 ** 3 },
    { id: "purgeable", label: "Purgeable", bytes: 0.3 * 1024 ** 3 },
    { id: "free", label: "Free", bytes: 3.4 * 1024 ** 3 },
  ],
  captured_at_secs: Math.floor(Date.now() / 1000),
};

export async function getMemorySnapshot(): Promise<MemorySnapshot> {
  if (!isTauri()) return { ...MOCK_SNAPSHOT, captured_at_secs: Math.floor(Date.now() / 1000) };
  return invoke<MemorySnapshot>("memory_snapshot");
}

export async function getMemoryAreas(): Promise<MemoryArea[]> {
  if (!isTauri()) {
    return [
      {
        id: "app_working_set",
        name: "App working set",
        description: "Returns this app's own allocator caches to the system.",
        supported: true,
        needs_privileges: false,
        prompts_for_credentials: false,
        background_safe: true,
      },
      {
        id: "file_cache",
        name: "Cached files & purgeable pages",
        description: "Runs the system purge, which drops the disk cache.",
        supported: true,
        needs_privileges: true,
        prompts_for_credentials: true,
        background_safe: false,
      },
    ];
  }
  return invoke<MemoryArea[]>("memory_areas");
}

export async function cleanMemory(
  areaIds: string[],
  allowPrompt: boolean
): Promise<MemoryCleanReport> {
  if (!isTauri()) {
    const after = { ...MOCK_SNAPSHOT, available_bytes: MOCK_SNAPSHOT.available_bytes + 1024 ** 3 };
    return {
      before: MOCK_SNAPSHOT,
      after,
      freed_bytes: 1024 ** 3,
      outcomes: areaIds.map((id) => ({
        id,
        name: id,
        ok: true,
        detail: "Mock run completed",
      })),
      duration_ms: 120,
    };
  }
  return invoke<MemoryCleanReport>("memory_clean", { areaIds, allowPrompt });
}

export async function getAutoStatus(): Promise<MemoryAutoStatus> {
  if (!isTauri()) {
    return {
      policy: {
        enabled: false,
        areas: ["app_working_set"],
        every_minutes: null,
        when_used_percent_above: 85,
        cooldown_minutes: 10,
      },
      decision: { state: "idle", reason: "Auto clean is off" },
      seconds_since_last_run: null,
      history: [],
    };
  }
  return invoke<MemoryAutoStatus>("memory_auto_status");
}

export async function setAutoPolicy(policy: AutoCleanPolicy): Promise<AutoCleanPolicy> {
  if (!isTauri()) return policy;
  return invoke<AutoCleanPolicy>("memory_set_auto_policy", { policy });
}
