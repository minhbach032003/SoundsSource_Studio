<script lang="ts">
  import type { PetEvent } from "./types";
  import {
    Terminal,
    Volume2,
    Heart,
    Cpu,
    Activity,
    Send,
  } from "@lucide/svelte";

  interface Props {
    events: PetEvent[];
    onSimulatePing?: () => void;
  }

  let { events = [], onSimulatePing }: Props = $props();

  let filter = $state<"all" | "coding" | "audio" | "vitals" | "system">("all");

  const filteredEvents = $derived(
    filter === "all" ? events : events.filter((e) => e.category === filter)
  );

  const filterCounts = $derived({
    all: events.length,
    coding: events.filter((e) => e.category === "coding").length,
    audio: events.filter((e) => e.category === "audio").length,
    vitals: events.filter((e) => e.category === "vitals").length,
    system: events.filter((e) => e.category === "system").length,
  });
</script>

<div class="panel p-4 sm:p-5 shadow-sm space-y-3.5 select-none flex flex-col h-full min-h-90">
  <!-- Header Toolbar -->
  <div class="flex items-center justify-between pb-2.5 border-b border-(--line) gap-2 flex-wrap shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text)">
        <Activity class="w-4 h-4" />
      </div>
      <div>
        <h4 class="text-xs font-bold text-(--ink) tracking-tight m-0">
          Live Activity Stream
        </h4>
        <p class="text-[10px] text-(--muted) m-0">
          Real-time coding pulses, audio ducking, and vitals sync
        </p>
      </div>
    </div>

    {#if onSimulatePing}
      <button
        type="button"
        onclick={onSimulatePing}
        class="btn btn-ghost h-7 text-[11px] px-2.5 text-(--accent-text) border border-(--line)"
        title="Send mock coding event"
      >
        <Send class="w-3 h-3 text-(--accent-text)" />
        Simulate Event
      </button>
    {/if}
  </div>

  <!-- Category Filter Pills -->
  <div class="flex items-center gap-1 p-1 rounded-xl bg-(--paper) border border-(--line) shrink-0 overflow-x-auto no-scrollbar">
    {#each (["all", "coding", "audio", "vitals", "system"] as const) as cat}
      <button
        type="button"
        onclick={() => (filter = cat)}
        class="flex-1 min-w-[50px] py-1 text-[10px] font-semibold rounded-lg transition-all capitalize cursor-pointer flex items-center justify-center gap-1 {filter === cat
          ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
          : 'text-(--muted) hover:text-(--ink)'}"
      >
        <span>{cat}</span>
        <span class="text-[9px] opacity-60">({filterCounts[cat]})</span>
      </button>
    {/each}
  </div>

  <!-- Event List -->
  <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-40">
    {#if filteredEvents.length === 0}
      <div class="h-full flex flex-col items-center justify-center p-6 text-center text-(--muted) bg-(--paper) rounded-xl border border-(--line)">
        <Terminal class="w-8 h-8 mb-2 opacity-30 text-(--accent-text)" />
        <span class="text-xs font-semibold text-(--ink)">No events in this category</span>
        <span class="text-[10px] text-(--muted) mt-0.5">
          Trigger actions or test pulses to populate the live stream
        </span>
      </div>
    {:else}
      {#each filteredEvents as evt (evt.id)}
        <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-(--focus)">
          <div class="flex items-start gap-2.5 min-w-0">
            <div class="mt-0.5 shrink-0">
              {#if evt.category === "coding"}
                <Terminal class="w-3.5 h-3.5 text-(--success)" />
              {:else if evt.category === "audio"}
                <Volume2 class="w-3.5 h-3.5 text-(--accent-text)" />
              {:else if evt.category === "vitals"}
                <Heart class="w-3.5 h-3.5 text-(--accent-text)" />
              {:else}
                <Cpu class="w-3.5 h-3.5 text-(--warning)" />
              {/if}
            </div>

            <div class="min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5">
                <span class="font-semibold text-(--ink) text-[11px] truncate">
                  {evt.source}
                </span>
                <span class="badge {evt.category === 'coding' ? 'badge-ok' : evt.category === 'vitals' ? 'badge-warn' : ''} text-[9px] uppercase tracking-wider py-0 px-1.5 font-bold">
                  {evt.event}
                </span>
              </div>
              <p class="text-(--muted) text-[11px] m-0 line-clamp-2 leading-relaxed">
                {evt.message}
              </p>
            </div>
          </div>

          <span class="text-[10px] text-(--muted) whitespace-nowrap tabular-nums">
            {evt.time}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>
