<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { PawPrint, Hash, MessageSquare, List, Columns2, Play, Maximize2 } from "@lucide/svelte";
  import { readPetPreferences, subscribePetPreferences, writePetPreference } from "@/lib/petPreferences";
  import { setDesktopPetVisible } from "@/lib/petVisibility";
  import { toastState } from "@/lib/toast.svelte";
  import { updatePetTrayCount } from "@/lib/petTray";

  let prefs = $state(readPetPreferences());
  let showPet = $state(false);
  let busy = $state(false);
  $effect(() => subscribePetPreferences(() => { prefs = readPetPreferences(); }));
  $effect(() => {
    if (!isTauri()) return;
    let active = true;
    const poll = () => invoke<boolean>("is_pet_overlay_open")
      .then(value => { if (active) showPet = value; }).catch(() => {});
    poll();
    const timer = setInterval(poll, 1500);
    return () => { active = false; clearInterval(timer); };
  });

  async function toggleVisibility() {
    if (busy) return;
    busy = true;
    try {
      if (!isTauri()) throw new Error("Desktop app required");
      showPet = await setDesktopPetVisible(!showPet);
      toastState.info(showPet ? "Desktop companion shown" : "Desktop companion hidden");
    } catch (error) {
      toastState.error(`Could not change desktop companion visibility: ${String(error)}`);
    } finally { busy = false; }
  }

  async function save(key: "animate" | "fps" | "size" | "count" | "chat" | "bubble" | "split", value: boolean | number) {
    try {
      writePetPreference(key, value);
      if (key === "count" && isTauri()) await updatePetTrayCount();
      const labels: Record<string, string> = {
        count: "Menu bar count updated",
        chat: value ? "Menu bar chatter on" : "Menu bar chatter off",
        bubble: value ? "Menu bar bubble on" : "Menu bar bubble off",
        split: value ? "Split pet enabled" : "Split pet disabled",
        animate: value ? "Pet animation enabled" : "Pet animation paused",
        fps: `Frame rate: ${value} FPS`,
        size: `Pet size: ${value}px`,
      };
      toastState.info(labels[key] || "AgentPet preferences saved");
    } catch (error) {
      prefs = readPetPreferences();
      toastState.error(`Could not save AgentPet preferences: ${String(error)}`);
    }
  }
</script>

<section class="preferences" aria-labelledby="display-heading">
  <h2 id="display-heading">Display</h2>
  <div class="settings-group">
    <label class="setting-row" for="show-pet">
      <span class="setting-label"><PawPrint size={14} />Show pet</span>
      <input id="show-pet" class="pet-switch" type="checkbox" role="switch" checked={showPet} disabled={busy}
        onclick={event => { event.preventDefault(); toggleVisibility(); }} />
    </label>
    <label class="setting-row" for="show-count">
      <span class="setting-label"><Hash size={14} />Show count on menu bar</span>
      <input id="show-count" class="pet-switch" type="checkbox" role="switch" checked={prefs.count}
        onchange={event => save("count", event.currentTarget.checked)} />
    </label>
    <label class="setting-row" for="show-chat">
      <span class="setting-label"><MessageSquare size={14} />Show chat on menu bar</span>
      <input id="show-chat" class="pet-switch" type="checkbox" role="switch" checked={prefs.chat}
        onchange={event => save("chat", event.currentTarget.checked)} />
    </label>
    <label class="setting-row" for="show-bubble">
      <span class="setting-label"><List size={14} />Show bubble on menu bar</span>
      <input id="show-bubble" class="pet-switch" type="checkbox" role="switch" checked={prefs.bubble}
        onchange={event => save("bubble", event.currentTarget.checked)} />
    </label>
    <label class="setting-row" for="split-pet">
      <span class="setting-label"><Columns2 size={14} />Split pet</span>
      <input id="split-pet" class="pet-switch" type="checkbox" role="switch" checked={prefs.split}
        onchange={event => save("split", event.currentTarget.checked)} />
    </label>
    <div class="setting-row slider-row flex-col sm:flex-row items-stretch sm:items-center py-1.5 gap-2">
      <div class="flex items-center justify-between w-full sm:w-auto">
        <label class="setting-label" for="pet-size"><Maximize2 size={14} />Pet size</label>
        <span class="sm:hidden text-xs font-mono font-semibold text-(--ink)">{prefs.size}px</span>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 justify-end">
        <div class="slider-control">
          <input id="pet-size" type="range" min="80" max="300" value={prefs.size}
            oninput={event => { prefs.size = Number(event.currentTarget.value); }}
            onchange={event => save("size", Number(event.currentTarget.value))} />
          <output for="pet-size">{prefs.size}<span class="sr-only"> pixels</span></output>
        </div>
        <div class="flex items-center gap-1">
          {#each [100, 160, 220, 300] as s}
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer {prefs.size === s ? 'bg-(--accent) text-(--accent-ink) border-(--accent)' : 'bg-(--surface) text-(--muted) border-(--line) hover:text-(--ink)'}"
              onclick={() => { prefs.size = s; save("size", s); }}
            >
              {s}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
<section class="preferences" aria-labelledby="animation-heading">
  <h2 id="animation-heading">Animation</h2>
  <div class="settings-group">
    <label class="setting-row" for="animate-pets">
      <span class="setting-label"><Play size={14} />Animate pets</span>
      <input id="animate-pets" class="pet-switch" type="checkbox" role="switch" checked={prefs.animate}
        onchange={event => save("animate", event.currentTarget.checked)} />
    </label>
    {#if prefs.animate}
      <div class="setting-row slider-row">
        <label for="animation-fps" class="setting-label slider-label">Frame rate</label>
        <div class="slider-control">
          <input id="animation-fps" type="range" min="1" max="12" value={prefs.fps}
            oninput={event => { prefs.fps = Number(event.currentTarget.value); }}
            onchange={event => save("fps", Number(event.currentTarget.value))} />
          <output for="animation-fps">{prefs.fps}<span class="sr-only"> frames per second</span></output>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .preferences { padding-top: 8px; }
  h2 { margin: 0 0 5px 2px; color: var(--muted); font-family: inherit; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .settings-group {
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--paper);
    padding: 0 8px;
  }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 29px; }
  .setting-row + .setting-row { border-top: 1px solid var(--line); }
  label.setting-row { cursor: pointer; }
  .setting-label { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 11px; font-weight: 500; }
  .setting-label :global(svg) { flex-shrink: 0; color: var(--muted); }
  .pet-switch {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    width: 30px;
    height: 18px;
    flex-shrink: 0;
    margin: 0;
    border: 1px solid var(--input-line);
    border-radius: 10px;
    background: var(--track);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }
  .pet-switch::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 12px;
    left: 2px;
    top: 2px;
    border-radius: 50%;
    background: var(--muted);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 150ms cubic-bezier(.34, 1.56, .64, 1), background 150ms ease;
  }
  .pet-switch:checked { border-color: var(--strong); background: var(--strong); }
  .pet-switch:checked::after { transform: translateX(12px); background: var(--on-strong); }
  .pet-switch:disabled { cursor: not-allowed; opacity: 0.6; }
  .slider-label { padding-left: 21px; }
  .slider-control { display: flex; align-items: center; gap: 7px; }
  input[type="range"] {
    appearance: none;
    -webkit-appearance: none;
    width: 86px;
    height: 4px;
    margin: 0;
    border-radius: 2px;
    background: var(--track);
    cursor: pointer;
    outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--strong);
    border: 1.5px solid var(--on-strong);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    transition: transform 120ms ease;
  }
  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  output { min-width: 24px; color: var(--muted); font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .pet-switch::after, input[type="range"]::-webkit-slider-thumb { transition: none; }
  }
</style>
