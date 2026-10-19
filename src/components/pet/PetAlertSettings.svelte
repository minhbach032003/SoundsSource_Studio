<script lang="ts">
  import { untrack } from "svelte";
  import { Play, Upload, RotateCcw } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { readPetPreferences, subscribePetPreferences, writePetPreference } from "@/lib/petPreferences";
  import { petNotificationPermission, petSoundName, playPetSound, uploadPetSound, resetPetSound, type PetSoundKind, type PetNotificationPermission } from "@/lib/petAudio";
  import { toastState } from "@/lib/toast.svelte";

  let prefs = $state(readPetPreferences());
  let names = $state({ done: petSoundName("done"), waiting: petSoundName("waiting") });
  let permission = $state<PetNotificationPermission | "checking" | "error">("checking");
  let error = $state("");
  let permissionBusy = $state(false);
  let busy = $state({ done: false, waiting: false });
  let reset = $state<PetSoundKind | null>(null);
  let alive = true;
  $effect(() => {
    alive = true;
    const unsubscribe = subscribePetPreferences(() => {
      prefs = readPetPreferences();
      names = { done: petSoundName("done"), waiting: petSoundName("waiting") };
    });
    untrack(() => refreshPermission());
    const focus = () => refreshPermission();
    window.addEventListener("focus", focus);
    return () => { alive = false; unsubscribe(); window.removeEventListener("focus", focus); };
  });
  function failure(cause: unknown) {
    if (!alive) return;
    error = String(cause);
    toastState.error(error);
  }
  async function refreshPermission(request = false) {
    if (permissionBusy) return;
    permissionBusy = true;
    try {
      const state = await petNotificationPermission(request);
      if (!alive) return;
      permission = state;
      if (request) toastState.info(state === "granted" || state === "provisional" ? "Notification permission enabled" : "Notification permission not enabled; check System Settings > Notifications");
    } catch (cause) { if (alive) permission = "error"; failure(cause); }
    finally { if (alive) permissionBusy = false; }
  }
  function save(key: "notifications" | "doneSound" | "waitingSound", value: boolean) {
    error = "";
    try { writePetPreference(key, value); toastState.info("AgentPet alert preferences saved"); }
    catch (cause) { prefs = readPetPreferences(); failure(cause); }
  }
  async function preview(kind: PetSoundKind) {
    busy[kind] = true; error = "";
    try { await playPetSound(kind, true); if (alive) toastState.info("Sound preview started"); }
    catch (cause) { failure(cause); }
    finally { if (alive) busy[kind] = false; }
  }
  async function upload(kind: PetSoundKind, input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    busy[kind] = true; error = "";
    try { await uploadPetSound(kind, file); if (alive) toastState.info("Custom sound saved. Use Play to preview."); }
    catch (cause) { failure(cause); }
    finally { if (alive) busy[kind] = false; }
  }
  function restore() {
    if (!reset) return;
    error = "";
    try { resetPetSound(reset); toastState.info("Synthesized default restored"); reset = null; }
    catch (cause) { failure(cause); }
  }
</script>

<section aria-labelledby="notifications-heading" class="space-y-2 mt-5">
  <div class="flex items-center justify-between">
    <h3 id="notifications-heading" class="text-[10px] font-bold uppercase tracking-wider text-(--muted) m-0">Notifications</h3>
    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border {permission === 'granted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : permission === 'denied' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}">
      <span class="w-1.5 h-1.5 rounded-full {permission === 'granted' ? 'bg-emerald-400' : permission === 'denied' ? 'bg-rose-400' : 'bg-amber-400'}"></span>
      {permission === "granted" ? "System Ready" : permission === "denied" ? "Permission Denied" : "Needs Permission"}
    </span>
  </div>

  <div class="rounded-xl border border-(--line) bg-(--paper) p-3 sm:p-3.5 space-y-2.5">
    <label class="flex items-center justify-between gap-3 text-xs font-medium cursor-pointer" for="pet-notifications">
      <span>Agent alerts</span>
      <input id="pet-notifications" class="pet-alert-switch" type="checkbox" role="switch" checked={prefs.notifications}
        onchange={event => save("notifications", event.currentTarget.checked)} />
    </label>
    <p class="text-xs text-(--muted) m-0" role="status">Permission: {permission}. {prefs.notifications ? "Agent alerts on." : "Agent alerts muted."} Sound settings are independent.</p>
    {#if permission === "denied"}
      <p class="text-xs text-rose-400 m-0">Enable rust-sound in macOS System Settings > Notifications, then refresh.</p>
    {:else if permission === "unavailable"}
      <p class="text-xs text-(--muted) m-0">Notifications require a supported browser or the installed macOS application.</p>
    {/if}
    <div class="pt-1">
      <button type="button" class="btn btn-ghost text-xs px-2.5 py-1 border border-(--line)" disabled={permissionBusy}
        onclick={() => refreshPermission(permission === "default")}>
        {permission === "default" ? "Enable notifications" : "Refresh permission"}
      </button>
    </div>
  </div>
</section>

<section aria-labelledby="sounds-heading" class="space-y-2.5 mt-5">
  <div class="flex items-center justify-between">
    <h3 id="sounds-heading" class="text-[10px] font-bold uppercase tracking-wider text-(--muted) m-0">Sounds</h3>
    <span class="text-[10px] text-(--muted)">WAV, MP3, M4A, OGG, FLAC (&le; 512 KiB)</span>
  </div>
  <p class="text-xs text-(--muted) m-0">Local WAV, MP3, M4A, AAC, OGG or FLAC, up to 512 KiB and 15 seconds, mono/stereo. Play previews even muted sounds.</p>

  <div class="grid grid-cols-1 gap-3 pt-1">
    {#each ["done", "waiting"] as kind (kind)}
      {@const sound = kind as PetSoundKind}
      {@const isCustom = Boolean(prefs[sound === "done" ? "doneCustom" : "waitingCustom"])}
      <div class="rounded-xl border border-(--line) bg-(--paper) p-3 sm:p-3.5 space-y-2.5 transition-all hover:border-(--focus)">
        <div class="flex items-center justify-between gap-3">
          <label class="text-xs font-semibold cursor-pointer select-none text-(--ink)" for={`pet-${sound}-sound`}>
            {sound === "done" ? "When an agent finishes" : "When an agent needs input"}
          </label>
          <input id={`pet-${sound}-sound`} class="pet-alert-switch" type="checkbox" role="switch" checked={prefs[sound === "done" ? "doneSound" : "waitingSound"]}
            onchange={event => save(sound === "done" ? "doneSound" : "waitingSound", event.currentTarget.checked)} />
        </div>

        <div class="flex items-center gap-2">
          <p class="text-xs font-mono text-(--muted) break-all m-0" data-sound-name={sound}>{names[sound]}</p>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-(--line)">
          <button type="button" class="btn btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1 border border-(--line)" aria-label={`Play ${sound} sound`} disabled={busy[sound]} onclick={() => preview(sound)}>
            <Play size={12} class="text-(--success)" />Play
          </button>

          <!-- Clean styled upload button with hidden input -->
          <label class="btn btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1 border border-(--line) cursor-pointer" for={`pet-${sound}-upload`}>
            <Upload size={12} class="text-(--accent-text)" />Upload {sound} sound
          </label>
          <input id={`pet-${sound}-upload`} class="sr-only" type="file" accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,audio/*" disabled={busy[sound]}
            onchange={event => upload(sound, event.currentTarget)} />

          <button type="button" class="btn btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1 border border-(--line)" aria-label={`Restore ${sound} default`} disabled={busy[sound] || !isCustom}
            onclick={() => { reset = sound; }}>
            <RotateCcw size={12} class="text-(--muted)" />Restore default
          </button>
        </div>
      </div>
    {/each}
  </div>

  {#if error}<p class="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg" role="alert">{error}</p>{/if}
</section>
<Modal open={reset !== null} title="Restore synthesized default?" description={`Replace the custom ${reset ?? ""} sound with the synthesized default? This does not change its enabled setting.`}
  confirmText="Restore default" onClose={() => { reset = null; }} onConfirm={restore} />

<style>
  .pet-alert-switch {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    width: 32px;
    height: 18px;
    flex-shrink: 0;
    margin: 0;
    border: 1px solid var(--input-line);
    border-radius: 10px;
    background: var(--track);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }
  .pet-alert-switch::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 12px;
    left: 2px;
    top: 2px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pet-alert-switch:checked {
    border-color: var(--accent);
    background: var(--accent);
  }
  .pet-alert-switch:checked::after {
    transform: translateX(14px);
    background: var(--accent-ink);
  }
  .pet-alert-switch:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .pet-alert-switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
