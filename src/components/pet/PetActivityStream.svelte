<script lang="ts">
  import type { PetEvent } from "./types";
  import {
    Terminal,
    Volume2,
    Heart,
    Cpu,
    Activity,
    Send,
    Search,
    Clock,
    Zap,
  } from "@lucide/svelte";

  interface Props {
    events: PetEvent[];
    onSimulatePing?: () => void;
  }

  let { events = [], onSimulatePing }: Props = $props();

  let filter = $state<"all" | "coding" | "audio" | "vitals" | "system">("all");
  let searchQuery = $state("");

  const filteredEvents = $derived(
    events.filter((e) => {
      const matchCat = filter === "all" || e.category === filter;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        e.source.toLowerCase().includes(q) ||
        e.event.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q);
      return matchCat && matchQuery;
    })
  );

  const filterCounts = $derived({
    all: events.length,
    coding: events.filter((e) => e.category === "coding").length,
    audio: events.filter((e) => e.category === "audio").length,
    vitals: events.filter((e) => e.category === "vitals").length,
    system: events.filter((e) => e.category === "system").length,
  });

  const recentCodingCount = $derived(
    events.filter((e) => e.category === "coding").length
  );
  const activeSources = $derived(
    Array.from(new Set(events.map((e) => e.source))).filter(Boolean)
  );
</script>

<div class="w-full space-y-4 select-none pb-6">
  <!-- Top Stats Strip -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">Total Events</span>
        <span class="text-lg font-bold text-(--ink) font-mono">{events.length}</span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-(--accent-text)">
        <Activity size={16} />
      </div>
    </div>

    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">Coding Pulses</span>
        <span class="text-lg font-bold text-(--success) font-mono">{recentCodingCount}</span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-(--success)">
        <Terminal size={16} />
      </div>
    </div>

    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">Active Agents</span>
        <span class="text-lg font-bold text-amber-400 font-mono">{activeSources.length}</span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-amber-400">
        <Zap size={16} />
      </div>
    </div>

    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">IPC Telemetry</span>
        <span class="text-xs font-semibold text-emerald-400 font-mono mt-1 block">Live Unix Sock</span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-emerald-400">
        <Clock size={16} />
      </div>
    </div>
  </div>

  <!-- Main Activity Container -->
  <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
    <!-- Header with Search & Simulate Trigger -->
    <div class="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-(--line)">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text)">
          <Terminal size={15} />
        </div>
        <div>
          <h3 class="text-xs font-bold text-(--ink) m-0">Live Activity Stream</h3>
          <p class="text-[10px] text-(--muted) m-0">Real-time pulses from Pi, Claude Code, Codex & Sound Engine</p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-1 justify-end max-w-md">
        <!-- Search Bar -->
        <div class="relative flex-1 min-w-40">
          <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--muted) pointer-events-none" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search events, tools, prompts…"
            class="field text-xs h-8 pl-8 pr-3 rounded-xl w-full"
          />
        </div>

        {#if onSimulatePing}
          <button
            type="button"
            onclick={onSimulatePing}
            class="btn btn-ghost h-8 text-[11px] px-3 text-(--accent-text) border border-(--line) shrink-0"
            title="Send test pulse event"
          >
            <Send size={12} class="text-(--accent-text)" />
            <span>Simulate Pulse</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- Category Filter Tabs -->
    <div class="flex items-center gap-1.5 p-1 rounded-xl bg-(--paper) border border-(--line) overflow-x-auto no-scrollbar">
      {#each (["all", "coding", "audio", "vitals", "system"] as const) as cat}
        <button
          type="button"
          onclick={() => (filter = cat)}
          class="flex-1 min-w-[70px] py-1.5 text-xs font-semibold rounded-lg transition-all capitalize cursor-pointer flex items-center justify-center gap-1.5 {filter === cat
            ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
            : 'text-(--muted) hover:text-(--ink)'}"
        >
          <span>{cat}</span>
          <span class="text-[10px] font-mono opacity-70">({filterCounts[cat]})</span>
        </button>
      {/each}
    </div>

    <!-- Events Stream List -->
    <div class="space-y-2 min-h-80 max-h-[580px] overflow-y-auto pr-1">
      {#if filteredEvents.length === 0}
        <div class="py-16 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-2xl border border-dashed border-(--line)">
          <Terminal size={32} class="mb-2 opacity-25 text-(--accent-text)" />
          <span class="text-xs font-bold text-(--ink)">No matching events</span>
          <span class="text-[11px] text-(--muted) mt-1 max-w-sm">
            {searchQuery ? `No logs match "${searchQuery}". Clear your search query.` : "Run prompts in Pi or Claude to stream live agent activity."}
          </span>
        </div>
      {:else}
        {#each filteredEvents as evt (evt.id)}
          <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-start justify-between gap-3 text-xs transition-colors hover:border-(--focus)">
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <div class="mt-0.5 shrink-0">
                {#if evt.category === "coding"}
                  <div class="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Terminal size={12} />
                  </div>
                {:else if evt.category === "audio"}
                  <div class="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Volume2 size={12} />
                  </div>
                {:else if evt.category === "vitals"}
                  <div class="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <Heart size={12} />
                  </div>
                {:else}
                  <div class="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Cpu size={12} />
                  </div>
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="font-bold text-(--ink) font-mono text-[11px]">{evt.source}</span>
                  <span class="badge text-[9px] px-1.5 py-0 uppercase font-semibold {evt.category === 'coding' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}">
                    {evt.event}
                  </span>
                  <span class="text-[10px] text-(--muted) uppercase tracking-wide">
                    {evt.category}
                  </span>
                </div>
                <p class="text-[11px] text-(--ink) font-mono m-0 leading-relaxed break-all bg-(--surface) p-2 rounded-lg border border-(--line)">
                  {evt.message}
                </p>
              </div>
            </div>

            <span class="font-mono text-[10px] text-(--muted) shrink-0 mt-0.5 flex items-center gap-1">
              <Clock size={10} />
              {evt.time}
            </span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
