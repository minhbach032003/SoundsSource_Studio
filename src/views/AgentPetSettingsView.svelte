<script lang="ts">
  import {
    ArrowLeft,
    Sparkles,
    Sliders,
    Zap,
    Info,
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
    Math.min(Math.max(prefs.size, 100), 220)
  );
</script>

<div class="w-full max-w-6xl mx-auto space-y-5 pb-8 animate-in fade-in duration-200">
  <!-- Top Navigation & Breadcrumb Header -->
  <div class="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-(--line)">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="btn btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5 border border-(--line) hover:border-(--focus)"
        onclick={() => navigateTo("pet")}
      >
        <ArrowLeft size={14} class="text-(--muted)" />
        <span>Back to AgentPet</span>
      </button>

      <div class="hidden sm:flex items-center gap-1.5 text-xs text-(--muted)">
        <span>Companion Cockpit</span>
        <span>/</span>
        <span class="text-(--ink) font-semibold">Display & Audio Preferences</span>
      </div>
    </div>

    <!-- Quick Telemetry Badges -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-(--paper) border border-(--line) text-(--ink)">
        <span class="w-1.5 h-1.5 rounded-full bg-(--success)"></span>
        <span>{prefs.split ? "Multi-Agent Split" : "Single Companion"}</span>
      </div>
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-(--paper) border border-(--line) text-(--muted)">
        <span>{prefs.size}px</span>
        <span>•</span>
        <span>{prefs.animate ? `${prefs.fps} FPS` : "Static"}</span>
      </div>
    </div>
  </div>

  <!-- Main 2-Column Studio Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    <!-- Left Column (Settings Controls): lg:col-span-7 -->
    <div class="lg:col-span-7 space-y-4">
      <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <h2 class="text-base font-bold text-(--ink) m-0 flex items-center gap-2">
            <Sliders size={16} class="text-(--accent-text)" />
            AgentPet Settings
          </h2>
          <p class="text-xs text-(--muted) mt-1.5 mb-2 leading-relaxed">
            General preferences for display, animation, sounds and notifications. Idle and sleepy animations are capped at 2 FPS for whisper-quiet CPU efficiency.
          </p>
        </div>

        <div class="pt-2 border-t border-(--line)">
          <PetDisplaySettings />
        </div>

        <div class="pt-2 border-t border-(--line)">
          <PetAlertSettings />
        </div>
      </div>

      <!-- Quick Tips Card -->
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2">
        <div class="flex items-center gap-1.5 font-semibold text-(--ink)">
          <Info size={14} class="text-(--accent-text)" />
          <span>Desktop Companion Quick Gestures</span>
        </div>
        <ul class="text-(--muted) space-y-1 list-disc list-inside text-[11px] leading-relaxed">
          <li><strong>Right-click desktop companion</strong> to open the Care menu (Feed, Pet, Sleep).</li>
          <li><strong>Click & drag</strong> to reposition anywhere across single or multi-monitor setups.</li>
          <li><strong>Split Mode:</strong> Automatically spawns an extra companion when multiple agents (Pi, Claude, Codex) run concurrent tasks.</li>
        </ul>
      </div>
    </div>

    <!-- Right Column (Live Interactive Companion Sandbox): lg:col-span-5 -->
    <div class="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
      <!-- Live Preview Card -->
      <div class="panel p-4 sm:p-5 shadow-xs relative overflow-hidden space-y-4 border-(--line)">
        <!-- Subtle Glow Backdrop matching active state -->
        <div
          class="absolute inset-0 rounded-full blur-3xl pointer-events-none opacity-25 {testMood === 'working'
            ? 'bg-linear-to-tr from-amber-500/20 via-orange-500/15 to-emerald-500/15'
            : testMood === 'celebrate'
            ? 'bg-linear-to-tr from-pink-500/25 via-purple-500/20 to-amber-500/20'
            : 'bg-indigo-500/15'}"
        ></div>

        <!-- Preview Header & Companion Skin Selector -->
        <div class="flex items-center justify-between gap-2 relative z-10 pb-2 border-b border-(--line)">
          <div class="flex items-center gap-1.5">
            <Sparkles size={15} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Live Sandbox Preview</h3>
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

        <!-- Companion Stage & Live Sprites -->
        <div class="relative w-full min-h-64 rounded-xl bg-(--paper) border border-(--line) flex flex-col items-center justify-center p-4 relative z-10 overflow-hidden shadow-inner">
          <!-- Warm Floor Glow / Desk Illumination -->
          <div class="absolute bottom-6 w-3/4 h-8 bg-amber-500/15 rounded-full blur-xl pointer-events-none"></div>

          <!-- Active State Badge -->
          <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-(--surface) border border-(--line) text-(--ink) shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full {testMood === 'working' ? 'bg-(--success)' : testMood === 'waiting' ? 'bg-(--warning)' : 'bg-(--accent)'}"></span>
            <span class="capitalize">{testMood}</span>
            <span class="text-(--muted)">•</span>
            <span class="text-(--muted)">{prefs.size}px</span>
          </div>

          <!-- Live Interactive Sprites: Split vs Single -->
          <div class="flex items-center justify-center gap-4 flex-wrap select-none my-2">
            {#if prefs.split}
              <!-- Dual Companion Display in Split Mode -->
              <div class="flex items-center justify-center gap-3">
                <button
                  type="button"
                  class="relative flex flex-col items-center group transition-transform hover:scale-102 cursor-pointer bg-transparent border-0 p-0"
                  onclick={() => testMood = testMood === 'working' ? 'celebrate' : 'working'}
                  aria-label="Toggle agent 1 mood"
                >
                  <AgentPetSprite
                    slug={selectedPet}
                    mood={testMood}
                    size={Math.min(previewSize, 150)}
                  />
                  <span class="text-[9px] font-mono text-(--muted) mt-1">Agent #1</span>
                </button>
                <button
                  type="button"
                  class="relative flex flex-col items-center group transition-transform hover:scale-102 cursor-pointer bg-transparent border-0 p-0"
                  onclick={() => testMood = testMood === 'working' ? 'waiting' : 'working'}
                  aria-label="Toggle agent 2 mood"
                >
                  <AgentPetSprite
                    slug={selectedPet}
                    mood={testMood === "celebrate" ? "celebrate" : "working"}
                    size={Math.min(previewSize, 150)}
                  />
                  <span class="text-[9px] font-mono text-(--muted) mt-1">Agent #2</span>
                </button>
              </div>
            {:else}
              <!-- Single Focused Companion -->
              <button
                type="button"
                class="relative flex flex-col items-center group transition-transform hover:scale-102 cursor-pointer bg-transparent border-0 p-0"
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
            {prefs.split ? "Split mode enabled: shows multi-agent cluster" : "Single companion mode active"}
          </p>
        </div>

        <!-- Mood Simulation Switcher -->
        <div class="space-y-1.5 relative z-10">
          <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted) block">Simulate Mood State</span>
          <div class="grid grid-cols-5 gap-1">
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

        <!-- Sound & Alert Simulation Station -->
        <div class="space-y-2 pt-2 border-t border-(--line) relative z-10">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-(--muted)">Audio & Alert Test Station</span>
            <span class="text-[10px] font-mono text-(--muted)">Live Chime</span>
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
    </div>
  </div>
</div>
