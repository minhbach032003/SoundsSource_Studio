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
  const unavailableReason = "Chưa bật được: tính năng này chưa làm xong.";
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

  async function save(key: "animate" | "fps" | "size" | "count", value: boolean | number) {
    try {
      writePetPreference(key, value);
      if (key === "count" && isTauri()) await updatePetTrayCount();
      toastState.info("AgentPet preferences saved");
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
    <!-- Ba hàng dưới tắt có chủ ý: tính năng chưa có. Một công tắc xám trông y hệt một
         công tắc đang tắt, nên mỗi hàng tự mang nhãn và lời giải thích khi rê chuột. -->
    <label class="setting-row unavailable-row" for="show-chat" title={unavailableReason}>
      <span class="setting-label"><MessageSquare size={14} />Show chat on menu bar</span>
      <span class="soon badge">Sắp có</span>
      <input id="show-chat" class="pet-switch" type="checkbox" role="switch" checked={prefs.chat} disabled aria-describedby="menu-unavailable" />
    </label>
    <label class="setting-row unavailable-row" for="show-bubble" title={unavailableReason}>
      <span class="setting-label"><List size={14} />Show bubble on menu bar</span>
      <span class="soon badge">Sắp có</span>
      <input id="show-bubble" class="pet-switch" type="checkbox" role="switch" checked={prefs.bubble} disabled aria-describedby="menu-unavailable" />
    </label>
    <label class="setting-row unavailable-row" for="split-pet" title={unavailableReason}>
      <span class="setting-label"><Columns2 size={14} />Split pet</span>
      <span class="soon badge">Sắp có</span>
      <input id="split-pet" class="pet-switch" type="checkbox" role="switch" checked={prefs.split} disabled aria-describedby="menu-unavailable" />
    </label>
    <p id="menu-unavailable" class="unavailable">Chat, bong bóng trên thanh menu và tách đôi pet chưa làm xong, nên ba mục trên chưa bật được.</p>
    <div class="setting-row slider-row">
      <label class="setting-label" for="pet-size"><Maximize2 size={14} />Pet size</label>
      <div class="slider-control">
        <input id="pet-size" type="range" min="80" max="300" value={prefs.size}
          onchange={event => save("size", Number(event.currentTarget.value))} />
        <output for="pet-size">{prefs.size}<span class="sr-only"> pixels</span></output>
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
            onchange={event => save("fps", Number(event.currentTarget.value))} />
          <output for="animation-fps">{prefs.fps}<span class="sr-only"> frames per second</span></output>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .preferences { padding-top: 8px; }
  h2 { margin: 0 0 5px 2px; color: var(--muted); font-family: inherit; font-size: 10px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
  .settings-group { border: 1px solid var(--line); border-radius: 9px; background: var(--paper); padding: 0 8px; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  .setting-row + .setting-row { border-top: 1px solid var(--line); }
  label.setting-row { cursor: pointer; }
  .setting-label { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 11px; }
  .setting-label :global(svg) { flex-shrink: 0; color: var(--muted); }
  .pet-switch { appearance: none; position: relative; width: 30px; height: 18px; flex-shrink: 0; margin: 0; border: 1px solid var(--input-line); border-radius: 10px; background: var(--track); cursor: pointer; }
  .pet-switch::after { content: ""; position: absolute; width: 12px; height: 12px; left: 2px; top: 2px; border-radius: 50%; background: var(--muted); transition: transform 120ms ease; }
  .pet-switch:checked { border-color: var(--strong); background: var(--strong); }
  .pet-switch:checked::after { transform: translateX(12px); background: var(--on-strong); }
  .pet-switch:disabled { cursor: not-allowed; }
  /* Mờ cả hàng, không chỉ cái công tắc: tắt-vì-chưa-có phải khác tắt-do-người-dùng. */
  .unavailable-row { cursor: not-allowed; }
  .unavailable-row .setting-label { opacity: .55; }
  .unavailable-row .pet-switch { opacity: .45; }
  .soon { margin-left: auto; margin-right: 6px; flex-shrink: 0; font-size: 9px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .slider-label { padding-left: 21px; }
  .slider-control { display: flex; align-items: center; gap: 7px; }
  input[type="range"] { width: 90px; height: 18px; margin: 0; cursor: pointer; accent-color: var(--strong); }
  output { min-width: 23px; color: var(--muted); font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
  /* Lời giải thích duy nhất cho ba hàng bị khoá: 10px màu mờ là quá nhẹ để đọc. */
  .unavailable { margin: 4px 0 6px; color: var(--ink); opacity: .72; font-size: 11px; line-height: 1.35; }
  input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .pet-switch::after { transition: none; } }
</style>
