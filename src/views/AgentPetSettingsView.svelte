<script lang="ts">
  import {
    ArrowLeft,
    Sparkles,
    Zap,
    Monitor,
    Volume2,
    Laptop,
    MousePointer,
    Bot,
    Radio,
  } from "@lucide/svelte";
  import PetAlertSettings from "@/components/pet/PetAlertSettings.svelte";
  import PetDisplaySettings from "@/components/pet/PetDisplaySettings.svelte";
  import { navigateTo } from "@/lib/navigation";
  import { readPetPreferences, subscribePetPreferences } from "@/lib/petPreferences";
  import { INSTALLED_PETS, type AgentSessionDto } from "@/components/pet/types";
  import { getPetForSession, getProjectName, setProjectPetBinding, getPetArchetype } from "@/lib/petMapping";
  import { toastState } from "@/lib/toast.svelte";
  import { playPetSound } from "@/lib/petAudio";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { SPLIT_PET_MAX } from "@/lib/petMood";

  // Reactive preferences for live preview
  let prefs = $state(readPetPreferences());
  let selectedPet = $state(
    (typeof localStorage !== "undefined" && localStorage.getItem("rust_sound_pet_slug")) || "work-blue-cat"
  );
  let sessions = $state<AgentSessionDto[]>([]);
  let isTestingAudio = $state(false);

  $effect(() => {
    return subscribePetPreferences(() => {
      prefs = readPetPreferences();
      const savedSlug = localStorage.getItem("rust_sound_pet_slug");
      if (savedSlug && savedSlug !== selectedPet) {
        selectedPet = savedSlug;
      }
    });
  });

  $effect(() => {
    if (!isTauri()) return;
    let active = true;
    const fetchSessions = async () => {
      try {
        const list = await invoke<AgentSessionDto[]>("get_agent_sessions");
        if (active) sessions = list || [];
      } catch {}
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });

  const activeSessions = $derived(
    sessions.filter((s) => s.state === "working" || s.state === "waiting")
  );
  const activeClusterCount = $derived(
    prefs.split ? Math.min(Math.max(1, activeSessions.length), SPLIT_PET_MAX) : 1
  );

  const currentPetMeta = $derived(
    INSTALLED_PETS.find((p) => p.id === selectedPet) || INSTALLED_PETS[3] || INSTALLED_PETS[0]!
  );

  function selectCompanion(slug: string) {
    selectedPet = slug;
    try {
      localStorage.setItem("rust_sound_pet_slug", slug);
      window.dispatchEvent(new StorageEvent("storage", { key: "rust_sound_pet_slug" }));
    } catch {}
    toastState.info(`Active companion skin set to ${slug}`);
  }

  async function testAlertAudio(kind: "done" | "waiting") {
    isTestingAudio = true;
    try {
      await playPetSound(kind, true);
      toastState.info(`Playing ${kind} chime preview`);
      setTimeout(() => {
        isTestingAudio = false;
      }, 2000);
    } catch (err) {
      toastState.error(`Could not play test sound: ${String(err)}`);
      isTestingAudio = false;
    }
  }
</script>

<div class="w-full space-y-4 pb-8 animate-in fade-in duration-200">
  <!-- Top Navigation & Breadcrumb Header (Full Width) -->
  <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-(--line)">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="btn btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-(--line) hover:border-(--focus)"
        onclick={() => navigateTo("pet")}
      >
        <ArrowLeft size={14} class="text-(--muted)" />
        <span>Back to AgentPet</span>
      </button>

      <div class="hidden sm:flex items-center gap-2 text-xs text-(--muted)">
        <span>Companion Cockpit</span>
        <span>/</span>
        <span class="text-(--ink) font-semibold">Display & Audio Studio</span>
      </div>
    </div>

    <!-- Quick Status Badges -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-(--paper) border border-(--line) text-(--ink) shadow-xs">
        <span class="w-1.5 h-1.5 rounded-full {prefs.split ? 'bg-(--accent)' : 'bg-(--success)'}"></span>
        <span>{prefs.split ? `Split Mode (${activeClusterCount} on desktop)` : "Single Companion"}</span>
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-(--paper) border border-(--line) text-(--muted) shadow-xs">
        <span class="text-(--ink) font-semibold">{prefs.size}px</span>
        <span>•</span>
        <span>{prefs.animate ? `${prefs.fps} FPS` : "Static"}</span>
      </div>
    </div>
  </div>

  <!-- Full-Width 2-Column Studio Grid (Zero Empty Space, Zero Duplicate Sprites) -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
    <!-- COLUMN 1: Display, Animation & Desktop Preferences (lg:col-span-1) -->
    <div class="space-y-4 flex flex-col">
      <!-- Main Display & Animation Controls -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
        <div class="border-b border-(--line) pb-3">
          <div class="flex items-center gap-2 text-xs font-bold text-(--ink)">
            <Monitor size={15} class="text-(--accent-text)" />
            <h2 class="text-sm font-bold text-(--ink) m-0">AgentPet Settings</h2>
          </div>
          <p class="text-[11px] text-(--muted) mt-1 mb-0 leading-relaxed">
            Configure desktop companion size, multi-agent split behavior, and macOS menu bar badges.
          </p>
        </div>

        <PetDisplaySettings />
      </div>

      <!-- Menu Bar Integration Info Card -->
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2.5 shadow-xs">
        <div class="flex items-center justify-between text-xs font-semibold text-(--ink)">
          <div class="flex items-center gap-1.5">
            <Laptop size={14} class="text-(--accent-text)" />
            <span>macOS Menu Bar Integrations</span>
          </div>
          <span class="text-[10px] font-mono text-(--muted)">Live Tray</span>
        </div>
        <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
          When enabled, the menu bar icon displays real-time agent task counts, model prompts, and active tool summaries without cluttering your desktop.
        </p>
      </div>

      <!-- Desktop Companion Gestures & Shortcuts -->
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2.5 shadow-xs">
        <div class="flex items-center gap-1.5 font-semibold text-(--ink)">
          <MousePointer size={14} class="text-(--accent-text)" />
          <span>Desktop Companion Gestures</span>
        </div>
        <ul class="text-(--muted) space-y-1.5 list-disc list-inside text-[11px] leading-relaxed m-0">
          <li><strong>Right-click companion</strong> to open the quick Care menu (Feed, Pet, Sleep).</li>
          <li><strong>Click & drag</strong> to move companion anywhere across single or multi-monitor setups.</li>
          <li><strong>Smart Power Capping:</strong> Idle and sleeping animations automatically drop to 2 FPS to preserve MacBook battery life.</li>
        </ul>
      </div>
    </div>

    <!-- COLUMN 2: Sound, Multi-Agent Cluster Telemetry & Active Skin (lg:col-span-1) -->
    <div class="space-y-4 flex flex-col">
      <!-- Main Sound & Alert Studio -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
        <div class="border-b border-(--line) pb-3">
          <div class="flex items-center gap-2 text-xs font-bold text-(--ink)">
            <Volume2 size={15} class="text-(--accent-text)" />
            <h2 class="text-sm font-bold text-(--ink) m-0">Sound & Alert Studio</h2>
          </div>
          <p class="text-[11px] text-(--muted) mt-1 mb-0 leading-relaxed">
            Customize audio cues for agent milestones and enable native macOS push alerts.
          </p>
        </div>

        <PetAlertSettings />

        <!-- Live Audio Chime Test Station -->
        <div class="space-y-2 pt-3 border-t border-(--line)">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted)">Hardware Chime Preview</span>
            <span class="text-[10px] font-mono text-(--muted)">Test Output</span>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) hover:border-(--focus)"
              disabled={isTestingAudio}
              onclick={() => testAlertAudio("done")}
            >
              <Sparkles size={13} class="text-(--success)" />
              <span>Test "Done"</span>
            </button>

            <button
              type="button"
              class="btn btn-ghost text-xs flex items-center justify-center gap-1.5 py-1.5 border border-(--line) hover:border-(--focus)"
              disabled={isTestingAudio}
              onclick={() => testAlertAudio("waiting")}
            >
              <Zap size={13} class="text-(--warning)" />
              <span>Test "Waiting"</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Real-Time Multi-Agent Cluster Monitor (Clarifies why N pets are spawned!) -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3.5">
        <div class="flex items-center justify-between border-b border-(--line) pb-2.5">
          <div class="flex items-center gap-2">
            <Radio size={15} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Multi-Agent Cluster Telemetry</h3>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold {prefs.split ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-(--surface) text-(--muted) border border-(--line)'}">
            {prefs.split ? `Cluster Active (${activeSessions.length} sessions)` : "Split Disabled"}
          </span>
        </div>

        <div class="p-3 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-(--muted)">Desktop Companion Spawns</span>
            <span class="font-mono font-bold text-(--ink)">{activeClusterCount} / {SPLIT_PET_MAX} Max</span>
          </div>
          <p class="text-[11px] text-(--muted) m-0 leading-relaxed">
            {#if prefs.split}
              Split mode is <strong>enabled</strong>: Spawns 1 separate desktop pet per active coding agent (Pi, Claude, Codex), up to a maximum of 3 to prevent screen clutter.
            {:else}
              Split mode is <strong>disabled</strong>: Exactly 1 companion displays on your desktop representing the primary active agent.
            {/if}
          </p>
        </div>

        {#if activeSessions.length > 0}
          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted) block">Active Connected Sessions ({activeSessions.length})</span>
            <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {#each activeSessions as session, idx (session.id)}
                {@const sessionPet = getPetForSession(session, idx, selectedPet)}
                {@const projName = getProjectName(session.project)}
                <div class="p-2 rounded-lg bg-(--paper) border border-(--line) flex items-center justify-between gap-2 text-xs">
                  <div class="flex items-center gap-2 min-w-0">
                    <img
                      src={sessionPet.avatarUrl}
                      alt={sessionPet.name}
                      class="w-6 h-6 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs"
                      title="{sessionPet.name} · {sessionPet.tagline}"
                    />
                    <div class="truncate min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full {session.state === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'} shrink-0"></span>
                        <span class="font-bold text-(--ink) text-xs">{projName}</span>
                        <span class="badge text-[9px] px-1 py-0 uppercase {session.agent_kind === 'subagent' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : ''}">{session.agent_kind}</span>
                      </div>
                      <span class="text-[10px] text-(--accent-text) font-semibold block truncate">
                        {session.message && session.agent_kind === 'subagent' ? session.message : sessionPet.name}
                      </span>
                    </div>
                  </div>

                  <select
                    value={sessionPet.id}
                    onchange={(e) => {
                      setProjectPetBinding(projName, e.currentTarget.value);
                      toastState.info(`Assigned ${getPetArchetype(e.currentTarget.value).name} to ${projName}`);
                    }}
                    class="field text-[10px] h-6 px-1.5 py-0 rounded max-w-28 text-(--muted) hover:text-(--ink) shrink-0"
                    title="Assign companion to {projName}"
                  >
                    {#each INSTALLED_PETS as p}
                      <option value={p.id}>{p.name}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="p-3 rounded-lg bg-(--paper) border border-dashed border-(--line) text-center text-[11px] text-(--muted)">
            No active agent tasks detected. Run a prompt in Pi, Claude Code, or Codex to see companions typing along.
          </div>
        {/if}
      </div>

      <!-- Active Companion Skin Selector & Details -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3">
        <div class="flex items-center justify-between border-b border-(--line) pb-2.5">
          <div class="flex items-center gap-2">
            <Bot size={15} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Equipped Companion Skin</h3>
          </div>
          <span class="text-[10px] font-semibold text-(--accent-text)">Level {currentPetMeta.unlockLevel} Unlocked</span>
        </div>

        <div class="flex items-center justify-between gap-3">
          <img
            src={currentPetMeta.avatarUrl}
            alt={currentPetMeta.name}
            class="w-10 h-10 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-xs text-(--ink) block truncate">{currentPetMeta.name}</span>
              <span class="badge text-[9px] px-1.5 py-0">{currentPetMeta.tag}</span>
            </div>
            <span class="text-[10px] text-(--accent-text) block truncate font-medium">{currentPetMeta.tagline}</span>
            <span class="text-[11px] text-(--muted) line-clamp-2 mt-0.5">{currentPetMeta.description}</span>
          </div>

          <select
            bind:value={selectedPet}
            onchange={() => selectCompanion(selectedPet)}
            class="field text-xs h-8 rounded-lg max-w-44 text-[11px] shrink-0"
            title="Switch companion skin"
          >
            {#each INSTALLED_PETS as pet}
              <option value={pet.id}>{pet.name}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
  </div>
</div>
