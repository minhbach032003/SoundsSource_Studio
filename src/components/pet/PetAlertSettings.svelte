<script lang="ts">
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
    refreshPermission();
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

<section aria-labelledby="notifications-heading" class="space-y-2 mt-4">
  <h3 id="notifications-heading" class="text-xs font-semibold text-(--muted)">Notifications</h3>
  <label class="flex justify-between gap-3 text-xs">
    Agent alerts
    <input id="pet-notifications" type="checkbox" role="switch" checked={prefs.notifications}
      onchange={event => save("notifications", event.currentTarget.checked)} />
  </label>
  <p class="text-xs text-(--muted)" role="status">Permission: {permission}. {prefs.notifications ? "Agent alerts on." : "Agent alerts muted."} Sound settings are independent.</p>
  {#if permission === "denied"}
    <p class="text-xs text-(--muted)">Enable rust-sound in macOS System Settings > Notifications, then refresh.</p>
  {:else if permission === "unavailable"}
    <p class="text-xs text-(--muted)">Notifications require a supported browser or the installed macOS application.</p>
  {/if}
  <button type="button" class="btn btn-ghost text-xs" disabled={permissionBusy}
    onclick={() => refreshPermission(permission === "default")}>{permission === "default" ? "Enable notifications" : "Refresh permission"}</button>
</section>
<section aria-labelledby="sounds-heading" class="space-y-3 mt-4">
  <h3 id="sounds-heading" class="text-xs font-semibold text-(--muted)">Sounds</h3>
  <p class="text-xs text-(--muted)">Local WAV, MP3, M4A, AAC, OGG or FLAC, up to 512 KiB and 15 seconds, mono/stereo. Play previews even muted sounds.</p>
  {#each ["done", "waiting"] as kind (kind)}
    {@const sound = kind as PetSoundKind}
    <div class="rounded-lg border border-(--line) p-3 space-y-2">
      <label class="flex justify-between gap-3 text-xs" for={`pet-${sound}-sound`}>
        {sound === "done" ? "When an agent finishes" : "When an agent needs input"}
        <input id={`pet-${sound}-sound`} type="checkbox" role="switch" checked={prefs[sound === "done" ? "doneSound" : "waitingSound"]}
          onchange={event => save(sound === "done" ? "doneSound" : "waitingSound", event.currentTarget.checked)} />
      </label>
      <p class="text-xs text-(--muted) break-all" data-sound-name={sound}>{names[sound]}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-ghost text-xs flex gap-1" aria-label={`Play ${sound} sound`} disabled={busy[sound]} onclick={() => preview(sound)}><Play size={12} />Play</button>
        <label class="text-xs flex items-center gap-1" for={`pet-${sound}-upload`}><Upload size={12} />Upload {sound} sound</label>
        <input id={`pet-${sound}-upload`} class="text-xs max-w-full" type="file" accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,audio/*" disabled={busy[sound]}
          onchange={event => upload(sound, event.currentTarget)} />
        <button type="button" class="btn btn-ghost text-xs flex gap-1" aria-label={`Restore ${sound} default`} disabled={busy[sound] || !prefs[sound === "done" ? "doneCustom" : "waitingCustom"]}
          onclick={() => { reset = sound; }}><RotateCcw size={12} />Restore default</button>
      </div>
    </div>
  {/each}
  {#if error}<p class="text-xs text-(--accent)" role="alert">{error}</p>{/if}
</section>
<Modal open={reset !== null} title="Restore synthesized default?" description={`Replace the custom ${reset ?? ""} sound with the synthesized default? This does not change its enabled setting.`}
  confirmText="Restore default" onClose={() => { reset = null; }} onConfirm={restore} />

<style>
  input[type="checkbox"] { accent-color: var(--strong); }
  input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
