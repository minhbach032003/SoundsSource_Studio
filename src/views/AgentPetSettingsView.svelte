<script lang="ts">
  import {
    ArrowLeft,
    Sparkles,
    Sliders,
    Zap,
    Monitor,
    Volume2,
    Laptop,
    MousePointer,
  } from "@lucide/svelte";
  import PetAlertSettings from "@/components/pet/PetAlertSettings.svelte";
  import PetDisplaySettings from "@/components/pet/PetDisplaySettings.svelte";
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import { navigateTo } from "@/lib/navigation";
  import { readPetPreferences, subscribePetPreferences } from "@/lib/petPreferences";
  import { INSTALLED_PETS, type PetMood } from "@/components/pet/types";
  import { toastState } from "@/lib/toast.svelte";
  import { playPetSound } from "@/lib/petAudio";

  // Reactive preferences for live preview
  let prefs = $state(readPetPreferences());
  let selectedPet = $state(
    (typeof localStorage !== "undefined" && localStorage.getItem("rust_sound_pet_slug")) || "work-blue-cat"
  );
  let testMood = $state<PetMood>("working");
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

  function selectCompanion(slug: string) {
    selectedPet = slug;
    try {
      localStorage.setItem("rust_sound_pet_slug", slug);
      window.dispatchEvent(new StorageEvent("storage", { key: "rust_sound_pet_slug" }));
    } catch {}
    toastState.info(`Preview companion set to ${slug}`);
  }

  async function testAlertAudio(kind: "done" | "waiting") {
    isTestingAudio = true;
    try {
      await playPetSound(kind, true);
      testMood = kind === "done" ? "celebrate" : "waiting";
      toastState.info(`Playing ${kind} chime preview`);
      setTimeout(() => {
        if (testMood === "celebrate" || testMood === "waiting") {
          testMood = "working";
        }
        isTestingAudio = false;
      }, 2400);
    } catch (err) {
      toastState.error(`Could not play test sound: ${String(err)}`);
      isTestingAudio = false;
    }
  }

  // Calculate live preview display scale based on prefs.size (clamped for comfortable preview card presentation)
  const previewSize = $derived(
    Math.min(Math.max(prefs.size, 110), 240)
  );
</script>

<div class="w-full space-y-4.5 pb-8 animate-in fade-in duration-200">
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
        <span class="w-1.5 h-1.5 rounded-full bg-(--success)"></span>
        <span>{prefs.split ? "Multi-Agent Cluster" : "Single Companion"}</span>
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-(--paper) border border-(--line) text-(--muted) shadow-xs">
        <span class="text-(--ink) font-semibold">{prefs.size}px</span>
        <span>•</span>
        <span>{prefs.animate ? `${prefs.fps} FPS` : "Static"}</span>
      </div>
    </div>
  </div>

  <!-- Full-Width 3-Column Studio Grid (Zero Empty Space) -->
  <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-5 items-start">
    <!-- COLUMN 1: Display & Overlay Configuration (xl:col-span-4) -->
    <div class="xl:col-span-4 space-y-4 flex flex-col">
      <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
        <div class="border-b border-(--line) pb-3">
          <div class="flex items-center gap-2 text-xs font-bold text-(--ink)">
            <Monitor size={15} class="text-(--accent-text)" />
            <h2 class="text-sm font-bold text-(--ink) m-0">Display & Animation</h2>
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
          When active, the menu bar icon displays real-time agent session count, recent model prompts, and tool execution status without cluttering your desktop.
        </p>
      </div>
    </div>

    <!-- COLUMN 2: Audio & Notification Alerts Studio (xl:col-span-4) -->
    <div class="xl:col-span-4 space-y-4 flex flex-col">
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
      </div>

      <!-- Companion Gestures & Controls Info Card -->
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2.5 shadow-xs">
        <div class="flex items-center gap-1.5 font-semibold text-(--ink)">
          <MousePointer size={14} class="text-(--accent-text)" />
          <span>Desktop Companion Gestures</span>
        </div>
        <ul class="text-(--muted) space-y-1.5 list-disc list-inside text-[11px] leading-relaxed m-0">
          <li><strong>Right-click companion</strong> to open the quick Care menu (Feed, Pet, Sleep).</li>
          <li><strong>Click & drag</strong> to move companion anywhere across multi-monitor setups.</li>
          <li><strong>Smart Power Capping:</strong> Idle and sleeping animations run at 2 FPS to preserve MacBook battery.</li>
        </ul>
      </div>
    </div>

    <!-- COLUMN 3: Live Companion Sandbox & Interactive Stage (xl:col-span-4, fills right screen) -->
    <div class="lg:col-span-2 xl:col-span-4 space-y-4 flex flex-col">
      <div class="panel p-4 sm:p-5 shadow-xs relative overflow-hidden space-y-4 border-(--line)">
        <!-- Dynamic Ambient Aura -->
        <div
          class="absolute inset-0 rounded-full blur-3xl pointer-events-none opacity-25 {testMood === 'working'
            ? 'bg-linear-to-tr from-amber-500/25 via-orange-500/15 to-emerald-500/20'
            : testMood === 'celebrate'
            ? 'bg-linear-to-tr from-pink-500/25 via-purple-500/20 to-amber-500/20'
            : 'bg-indigo-500/15'}"
        ></div>

        <!-- Stage Header & Skin Switcher -->
        <div class="flex items-center justify-between gap-2 relative z-10 pb-3 border-b border-(--line)">
          <div class="flex items-center gap-1.5">
            <Sparkles size={15} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Live Companion Stage</h3>
          </div>

          <select
            bind:value={selectedPet}
            onchange={() => selectCompanion(selectedPet)}
            class="field text-xs h-7.5 rounded-lg max-w-44 text-[11px]"
            title="Switch companion skin for preview"
          >
            {#each INSTALLED_PETS as pet}
              <option value={pet.id}>{pet.name}</option>
            {/each}
          </select>
        </div>

        <!-- Dynamic Visual Stage Area -->
        <div class="relative w-full min-h-72 rounded-2xl bg-(--paper) border border-(--line) flex flex-col items-center justify-center p-5 relative z-10 overflow-hidden shadow-inner">
          <!-- Warm Floor Illumination Glow -->
          <div class="absolute bottom-6 w-4/5 h-10 bg-amber-500/20 rounded-full blur-xl pointer-events-none"></div>

          <!-- Active State Badge -->
          <div class="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-(--surface) border border-(--line) text-(--ink) shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full {testMood === 'working' ? 'bg-(--success)' : testMood === 'waiting' ? 'bg-(--warning)' : 'bg-(--accent)'}"></span>
            <span class="capitalize">{testMood}</span>
            <span class="text-(--muted)">•</span>
            <span class="text-(--muted)">{prefs.size}px</span>
          </div>

          <!-- Live Sprites Display (Split vs Single) -->
          <div class="flex items-center justify-center gap-4 flex-wrap select-none my-3">
            {#if prefs.split}
              <!-- Multi-Companion Display in Split Mode -->
              <div class="flex items-center justify-center gap-3">
                <button
                  type="button"
                  class="relative flex flex-col items-center group transition-transform hover:scale-105 cursor-pointer bg-transparent border-0 p-0"
                  onclick={() => testMood = testMood === 'working' ? 'celebrate' : 'working'}
                  aria-label="Toggle agent 1 mood"
                >
                  <AgentPetSprite
                    slug={selectedPet}
                    mood={testMood}
                    size={Math.min(previewSize, 140)}
                  />
                  <span class="text-[9px] font-mono text-(--muted) mt-1">Agent #1</span>
                </button>
                <button
                  type="button"
                  class="relative flex flex-col items-center group transition-transform hover:scale-105 cursor-pointer bg-transparent border-0 p-0"
                  onclick={() => testMood = testMood === 'working' ? 'waiting' : 'working'}
                  aria-label="Toggle agent 2 mood"
                >
                  <AgentPetSprite
                    slug={selectedPet}
                    mood={testMood === "celebrate" ? "celebrate" : "working"}
                    size={Math.min(previewSize, 140)}
                  />
                  <span class="text-[9px] font-mono text-(--muted) mt-1">Agent #2</span>
                </button>
              </div>
            {:else}
              <!-- Single Companion Display -->
              <button
                type="button"
                class="relative flex flex-col items-center group transition-transform hover:scale-105 cursor-pointer bg-transparent border-0 p-0"
                onclick={() => testMood = testMood === 'working' ? 'celebrate' : 'working'}
                aria-label="Toggle companion mood"
              >
                <AgentPetSprite
                  slug={selectedPet}
                  mood={testMood}
                  size={previewSize}
                />
              </button>
            {/if}
          </div>

          <p class="text-[10px] text-(--muted) mt-2 m-0 text-center font-medium">
            {prefs.split ? "Split Cluster: Spawns extra companions per active agent" : "Solo Companion: Follows primary active coding session"}
          </p>
        </div>

        <!-- Mood State Simulation Controls -->
        <div class="space-y-1.5 relative z-10">
          <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted) block">Simulate Mood State</span>
          <div class="grid grid-cols-5 gap-1.5">
            {#each (["working", "waiting", "celebrate", "sleepy", "idle"] as PetMood[]) as m}
              <button
                type="button"
                onclick={() => (testMood = m)}
                class="px-2 py-1.5 rounded-lg text-[10px] font-semibold capitalize border transition-all cursor-pointer flex items-center justify-center {testMood === m
                  ? 'bg-(--accent) text-(--accent-ink) border-(--accent) shadow-xs'
                  : 'bg-(--paper) text-(--muted) border-(--line) hover:text-(--ink)'}"
              >
                {m === "sleepy" ? "Sleep" : m}
              </button>
            {/each}
          </div>
        </div>

        <!-- Live Audio Chime Test Station -->
        <div class="space-y-2 pt-3 border-t border-(--line) relative z-10">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted)">Audio & Alert Test Station</span>
            <span class="text-[10px] font-mono text-(--muted)">Hardware Chime</span>
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

      <!-- Live Telemetry Card -->
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-(--ink) flex items-center gap-1.5">
            <Sliders size={13} class="text-(--accent-text)" />
            <span>Companion Performance Profile</span>
          </span>
          <span class="text-[10px] font-mono text-emerald-400 font-bold">Ultra-Low Power</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-[10px] pt-1">
          <div>
            <span class="text-(--muted) block">Target Size</span>
            <span class="font-mono font-semibold text-(--ink)">{prefs.size}px</span>
          </div>
          <div>
            <span class="text-(--muted) block">Render FPS</span>
            <span class="font-mono font-semibold text-(--ink)">{prefs.animate ? `${prefs.fps} FPS` : "Off"}</span>
          </div>
          <div>
            <span class="text-(--muted) block">Audio Engine</span>
            <span class="font-mono font-semibold text-(--ink)">{prefs.doneSound || prefs.waitingSound ? "Active" : "Muted"}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
