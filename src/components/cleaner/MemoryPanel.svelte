<script lang="ts">
  import {
    MemoryStick,
    Gauge,
    Play,
    TimerReset,
    ShieldAlert,
    Lock,
    CircleCheck,
    CircleX,
    History,
    Info,
  } from "@lucide/svelte";
  import { toastState } from "@/lib/toast.svelte";
  import { formatBytes } from "@/lib/cleaner";
  import {
    getMemorySnapshot,
    getMemoryAreas,
    cleanMemory,
    getAutoStatus,
    setAutoPolicy,
    formatSignedBytes,
    describeDecision,
    type MemorySnapshot,
    type MemoryArea,
    type MemoryAutoStatus,
    type MemoryCleanReport,
    type AutoCleanPolicy,
  } from "@/lib/memory";

  let snapshot = $state<MemorySnapshot | null>(null);
  let areas = $state<MemoryArea[]>([]);
  let autoStatus = $state<MemoryAutoStatus | null>(null);
  let selected = $state<Set<string>>(new Set());
  let isCleaning = $state(false);
  let lastReport = $state<MemoryCleanReport | null>(null);

  /// Nothing is pre-ticked beyond what runs without asking for anything: a memory
  /// cleaner that arrives with a password prompt pre-selected is a trap.
  function defaultSelection(list: MemoryArea[]): Set<string> {
    return new Set(
      list.filter((a) => a.supported && !a.prompts_for_credentials).map((a) => a.id)
    );
  }

  $effect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [snap, list, status] = await Promise.all([
          getMemorySnapshot(),
          getMemoryAreas(),
          getAutoStatus(),
        ]);
        if (!alive) return;
        snapshot = snap;
        if (areas.length === 0) selected = defaultSelection(list);
        areas = list;
        autoStatus = status;
      } catch (err) {
        if (alive) toastState.error(`Could not read memory state: ${String(err)}`);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!isCleaning) void load();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  });

  const policy = $derived<AutoCleanPolicy>(
    autoStatus?.policy ?? {
      enabled: false,
      areas: [],
      every_minutes: null,
      when_used_percent_above: 85,
      cooldown_minutes: 10,
    }
  );

  const backgroundAreas = $derived(areas.filter((a) => a.supported && a.background_safe));
  const pressure = $derived(snapshot?.used_percent ?? 0);
  const pressureTone = $derived(
    pressure >= 90 ? "text-(--error)" : pressure >= 75 ? "text-(--warning)" : "text-(--success)"
  );

  function toggleArea(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  async function savePolicy(patch: Partial<AutoCleanPolicy>) {
    const next = { ...policy, ...patch };
    try {
      const stored = await setAutoPolicy(next);
      if (autoStatus) autoStatus = { ...autoStatus, policy: stored };
      // The backend clamps and drops what cannot run unattended, so say when the saved
      // policy differs from what was asked for instead of showing a lie.
      const droppedArea = next.areas.length !== stored.areas.length;
      if (droppedArea) {
        toastState.info("Saved. Areas that need a password were left out of unattended runs.");
      } else {
        toastState.success("Auto clean settings saved");
      }
    } catch (err) {
      toastState.error(`Could not save auto clean settings: ${String(err)}`);
    }
  }

  async function runClean() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toastState.info("Pick at least one memory area first");
      return;
    }
    const needsPrompt = areas.some((a) => selected.has(a.id) && a.prompts_for_credentials);
    isCleaning = true;
    try {
      const report = await cleanMemory(ids, needsPrompt);
      lastReport = report;
      snapshot = report.after;
      const failed = report.outcomes.filter((o) => !o.ok);
      if (failed.length === 0) {
        toastState.success(
          `Reclaimed ${formatSignedBytes(report.freed_bytes)} in ${report.duration_ms} ms`
        );
      } else {
        toastState.info(
          `${formatSignedBytes(report.freed_bytes)} reclaimed; ${failed.length} of ${report.outcomes.length} area(s) could not run`
        );
      }
      autoStatus = await getAutoStatus();
    } catch (err) {
      toastState.error(`Memory clean failed: ${String(err)}`);
    } finally {
      isCleaning = false;
    }
  }

  function relativeTime(seconds: number): string {
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  }

  const triggerLabel: Record<string, string> = {
    manual: "Manual",
    interval: "Scheduled",
    usage: "Pressure",
  };
</script>

<div class="space-y-4">
  <!-- Live pressure -->
  <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-2.5">
        <MemoryStick size={18} class="text-(--accent-text)" />
        <div>
          <h3 class="text-sm font-bold text-(--ink) m-0">Physical memory</h3>
          <p class="text-[11px] text-(--muted) m-0">
            {#if snapshot}
              {formatBytes(snapshot.used_bytes)} of {formatBytes(snapshot.total_bytes)} in use ·
              {formatBytes(snapshot.reclaimable_bytes)} looks reclaimable
            {:else}
              Reading memory state...
            {/if}
          </p>
        </div>
      </div>
      <div class="text-right">
        <span class="text-2xl font-bold font-mono {pressureTone}">{pressure.toFixed(1)}%</span>
        {#if snapshot && snapshot.swap_total_bytes > 0}
          <span class="block text-[10px] text-(--muted) font-mono">
            swap {formatBytes(snapshot.swap_used_bytes)} / {formatBytes(snapshot.swap_total_bytes)}
          </span>
        {/if}
      </div>
    </div>

    {#if snapshot && snapshot.segments.length > 0}
      <div class="flex h-2.5 rounded-full overflow-hidden bg-(--paper) border border-(--line)">
        {#each snapshot.segments as seg (seg.id)}
          {@const share = snapshot.total_bytes > 0 ? (seg.bytes / snapshot.total_bytes) * 100 : 0}
          {#if share > 0.3}
            <div
              class="h-full {seg.id === 'free'
                ? 'bg-(--line)'
                : seg.id === 'file_cache' || seg.id === 'cached' || seg.id === 'standby'
                  ? 'bg-(--accent)/45'
                  : seg.id === 'purgeable' || seg.id === 'buffers' || seg.id === 'modified'
                    ? 'bg-(--accent)/25'
                    : 'bg-(--accent)'}"
              style="width: {share}%"
              title="{seg.label}: {formatBytes(seg.bytes)}"
            ></div>
          {/if}
        {/each}
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        {#each snapshot.segments as seg (seg.id)}
          <span class="text-[10px] text-(--muted) font-mono">
            {seg.label} <span class="text-(--ink)">{formatBytes(seg.bytes)}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Areas + manual run -->
  <div class="panel p-4 sm:p-5 shadow-xs space-y-3">
    <div class="flex items-center justify-between gap-3 pb-3 border-b border-(--line)">
      <div class="flex items-center gap-2">
        <Gauge size={16} class="text-(--accent-text)" />
        <h3 class="text-xs font-bold text-(--ink) m-0">What to reclaim</h3>
      </div>
      <button
        type="button"
        class="btn btn-primary h-8 text-xs px-3"
        disabled={isCleaning || selected.size === 0}
        onclick={runClean}
      >
        <Play size={13} />
        {isCleaning ? "Reclaiming..." : "Clean now"}
      </button>
    </div>

    {#each areas as area (area.id)}
      <label
        class="flex items-start gap-3 p-3 rounded-xl bg-(--paper) border border-(--line) {area.supported
          ? 'cursor-pointer'
          : 'opacity-55 cursor-not-allowed'}"
      >
        <input
          type="checkbox"
          class="mt-0.5 shrink-0 accent-(--accent)"
          checked={selected.has(area.id)}
          disabled={!area.supported || isCleaning}
          onchange={() => toggleArea(area.id)}
        />
        <span class="min-w-0">
          <span class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-(--ink)">{area.name}</span>
            {#if !area.supported}
              <span class="badge-chip">not available here</span>
            {/if}
            {#if area.prompts_for_credentials}
              <span class="badge-chip flex items-center gap-1">
                <Lock size={10} /> asks for password
              </span>
            {/if}
            {#if area.needs_privileges && !area.prompts_for_credentials}
              <span class="badge-chip flex items-center gap-1">
                <ShieldAlert size={10} /> needs admin
              </span>
            {/if}
            {#if !area.background_safe && area.supported}
              <span class="badge-chip">manual only</span>
            {/if}
          </span>
          <span class="block text-[11px] text-(--muted) mt-0.5">{area.description}</span>
        </span>
      </label>
    {/each}

    {#if lastReport}
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-(--ink)">Last run</span>
          <span class="font-mono {lastReport.freed_bytes >= 0 ? 'text-(--success)' : 'text-(--warning)'}">
            {formatSignedBytes(lastReport.freed_bytes)} available · {lastReport.duration_ms} ms
          </span>
        </div>
        {#each lastReport.outcomes as outcome (outcome.id)}
          <div class="flex items-start gap-1.5 text-[11px]">
            {#if outcome.ok}
              <CircleCheck size={12} class="text-(--success) shrink-0 mt-px" />
            {:else}
              <CircleX size={12} class="text-(--error) shrink-0 mt-px" />
            {/if}
            <span class="text-(--muted)"><span class="text-(--ink)">{outcome.name}</span> — {outcome.detail}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Auto clean -->
  <div class="panel p-4 sm:p-5 shadow-xs space-y-3">
    <div class="flex items-center justify-between gap-3 pb-3 border-b border-(--line)">
      <div class="flex items-center gap-2">
        <TimerReset size={16} class="text-(--success)" />
        <h3 class="text-xs font-bold text-(--ink) m-0">Auto clean</h3>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={policy.enabled}
        aria-label="Enable automatic memory cleaning"
        class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {policy.enabled
          ? 'bg-(--accent)'
          : 'bg-(--input-line)'}"
        onclick={() => savePolicy({ enabled: !policy.enabled })}
      >
        <span
          class="w-4 h-4 rounded-full bg-white transition-transform block shadow-xs absolute top-0.75 {policy.enabled
            ? 'left-5.25'
            : 'left-0.75'}"
        ></span>
      </button>
    </div>

    <div class="flex items-start gap-1.5 text-[11px] text-(--muted)">
      <Info size={12} class="shrink-0 mt-px text-(--accent-text)" />
      <span>{describeDecision(autoStatus?.decision)}</span>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label class="block">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block mb-1">
          When memory use passes
        </span>
        <span class="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="99"
            class="w-full h-8 bg-(--surface) border border-(--line) rounded-lg px-2.5 font-mono text-xs text-(--ink)"
            value={policy.when_used_percent_above ?? ""}
            placeholder="off"
            onchange={(event) => {
              const raw = (event.currentTarget as HTMLInputElement).value.trim();
              const parsed = raw === "" ? null : Number(raw);
              savePolicy({
                when_used_percent_above:
                  parsed === null || !Number.isFinite(parsed) ? null : parsed,
              });
            }}
          />
          <span class="text-xs text-(--muted)">%</span>
        </span>
      </label>

      <label class="block">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block mb-1">
          Or every
        </span>
        <span class="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="10080"
            class="w-full h-8 bg-(--surface) border border-(--line) rounded-lg px-2.5 font-mono text-xs text-(--ink)"
            value={policy.every_minutes ?? ""}
            placeholder="off"
            onchange={(event) => {
              const raw = (event.currentTarget as HTMLInputElement).value.trim();
              const parsed = raw === "" ? null : Number(raw);
              savePolicy({
                every_minutes: parsed === null || !Number.isFinite(parsed) ? null : parsed,
              });
            }}
          />
          <span class="text-xs text-(--muted)">min</span>
        </span>
      </label>

      <label class="block">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block mb-1">
          Wait at least
        </span>
        <span class="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="1440"
            class="w-full h-8 bg-(--surface) border border-(--line) rounded-lg px-2.5 font-mono text-xs text-(--ink)"
            value={policy.cooldown_minutes}
            onchange={(event) => {
              const parsed = Number((event.currentTarget as HTMLInputElement).value);
              if (Number.isFinite(parsed)) savePolicy({ cooldown_minutes: parsed });
            }}
          />
          <span class="text-xs text-(--muted)">min</span>
        </span>
      </label>
    </div>

    <div class="space-y-1.5">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-(--muted) block">
        Unattended runs may use
      </span>
      {#if backgroundAreas.length === 0}
        <p class="text-[11px] text-(--muted) m-0">
          Nothing on this system can be reclaimed without asking for a password, so auto clean has
          nothing to run.
        </p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each backgroundAreas as area (area.id)}
            {@const on = policy.areas.includes(area.id)}
            <button
              type="button"
              aria-pressed={on}
              class="text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer transition-colors {on
                ? 'border-(--accent) bg-(--soft) text-(--ink)'
                : 'border-(--line) bg-(--paper) text-(--muted)'}"
              onclick={() =>
                savePolicy({
                  areas: on
                    ? policy.areas.filter((id) => id !== area.id)
                    : [...policy.areas, area.id],
                })}
            >
              {area.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Run log -->
  <div class="panel p-4 sm:p-5 shadow-xs space-y-2">
    <div class="flex items-center gap-2 pb-3 border-b border-(--line)">
      <History size={16} class="text-(--accent-text)" />
      <h3 class="text-xs font-bold text-(--ink) m-0">Run history</h3>
    </div>
    {#if !autoStatus || autoStatus.history.length === 0}
      <p class="text-[11px] text-(--muted) m-0">No memory cleans recorded yet.</p>
    {:else}
      {#each autoStatus.history.slice(0, 12) as record (record.at_secs + record.trigger)}
        <div class="flex items-start justify-between gap-3 py-1.5 border-b border-(--line) last:border-0">
          <span class="min-w-0">
            <span class="text-[11px] font-semibold text-(--ink)">
              {triggerLabel[record.trigger] ?? record.trigger}
            </span>
            <span class="text-[10px] text-(--muted)"> · {relativeTime(record.at_secs)}</span>
            <span class="block text-[10px] text-(--muted) font-mono">
              {record.used_percent_before.toFixed(1)}% → {record.used_percent_after.toFixed(1)}%
            </span>
            {#each record.notes as note (note)}
              <span class="block text-[10px] text-(--warning)">{note}</span>
            {/each}
          </span>
          <span
            class="text-[11px] font-mono shrink-0 {record.freed_bytes >= 0
              ? 'text-(--success)'
              : 'text-(--warning)'}"
          >
            {formatSignedBytes(record.freed_bytes)}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .badge-chip {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    white-space: nowrap;
  }
</style>
