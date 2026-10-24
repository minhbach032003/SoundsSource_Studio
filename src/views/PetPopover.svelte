<script lang="ts">
  import { applyTheme, readThemePreference, themeState, THEME_STORAGE_KEY } from "@/lib/theme.svelte";
  import PetDisplaySettings from "@/components/pet/PetDisplaySettings.svelte";
  import { subscribePetPreferences } from "@/lib/petPreferences";
  import { updatePetTrayCount } from "@/lib/petTray";
  import { navigateTo } from "@/lib/navigation";
  import { toastState } from "@/lib/toast.svelte";
  import ToastHost from "@/components/ui/ToastHost.svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import type { AgentSessionDto, PetCareStateDto } from "@/components/pet/types";
  import { xpToReach, getInternalLevel } from "@/components/pet/types";
  import { getPetForSession } from "@/lib/petMapping";
  import {
    PawPrint,
    Settings,
    RefreshCw,
    Power,
    X,
    Sparkles,
  } from "@lucide/svelte";

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  let sessions = $state<AgentSessionDto[]>([]);
  let care = $state<PetCareStateDto | null>(null);
  let petSlug = $state<string>("super-saiyan-goku");

  $effect(() => subscribePetPreferences(() => {
    petSlug = localStorage.getItem("rust_sound_pet_slug") || "super-saiyan-goku";
  }));

  // This is a separate, reusable webview: keep its canvas clear and theme current.
  $effect(() => {
    document.body.classList.add("pet-popover-window");
    const syncTheme = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      themeState.themePreference = readThemePreference();
      applyTheme(themeState.themePreference, themeState.osDark);
    };
    window.addEventListener("storage", syncTheme);
    return () => {
      document.body.classList.remove("pet-popover-window");
      window.removeEventListener("storage", syncTheme);
    };
  });

  // Poll sessions and care state every 1.5s
  $effect(() => {
    if (!isDesktop) return;
    let active = true;

    const poll = async () => {
      try {
        const [sessList, careState] = await Promise.all([
          invoke<AgentSessionDto[]>("get_agent_sessions"),
          invoke<PetCareStateDto>("get_pet_care_state"),
        ]);
        if (active) {
          if (sessList) {
            sessions = sessList;
            updatePetTrayCount(sessList).catch(() => {});
          }
          if (careState) care = careState;
        }
      } catch {}
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  });

  // Active agents (working, waiting, done)
  let mappingRevision = $state(0);
  $effect(() => {
    const handler = () => { mappingRevision += 1; };
    window.addEventListener("project-pet-changed", handler);
    window.addEventListener("session-pet-changed", handler);
    window.addEventListener("favorite-pets-changed", handler);
    return () => {
      window.removeEventListener("project-pet-changed", handler);
      window.removeEventListener("session-pet-changed", handler);
      window.removeEventListener("favorite-pets-changed", handler);
    };
  });
  const activeAgents = $derived(
    sessions.filter((s) => s.state !== "idle" && s.state !== "registered")
  );
  const runningCount = $derived(
    activeAgents.filter((s) => s.state === "working").length
  );

  const subtitle = $derived(
    activeAgents.length === 0
      ? "No agents running"
      : `${activeAgents.length} agent${activeAgents.length === 1 ? "" : "s"} · ${runningCount} running`
  );

  // Companion calculations
  const internalLevel = $derived(getInternalLevel(care?.xp ?? 0));
  const floorXP = $derived(xpToReach(internalLevel));
  const ceilingXP = $derived(xpToReach(internalLevel + 1));
  const inLevelXP = $derived(Math.max(0, (care?.xp ?? 0) - floorXP));
  const spanXP = $derived(Math.max(1, ceilingXP - floorXP));
  const progressPercent = $derived(
    Math.min(100, Math.max(0, Math.round((inLevelXP / spanXP) * 100)))
  );

  const todayTokensLabel = $derived.by(() => {
    const t = care?.tokens_today ?? 0;
    if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
    if (t >= 1_000) return `${Math.round(t / 1_000)}k`;
    return String(t);
  });

  function formatElapsed(startedAt: number, endedAt?: number): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = startedAt > 1e11 ? Math.floor(startedAt / 1000) : startedAt;
    const endSec = endedAt && endedAt > 0 ? (endedAt > 1e11 ? Math.floor(endedAt / 1000) : endedAt) : nowSec;
    const elapsed = Math.max(0, endSec - startSec);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m`;
    }
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }

  function handleClearAll() {
    if (isDesktop) {
      invoke("clear_agent_sessions").catch(() => {});
    }
    sessions = [];
  }

  function handleDismiss(id: string) {
    if (isDesktop) {
      invoke("dismiss_agent_session", { id }).catch(() => {});
    }
    sessions = sessions.filter((s) => s.id !== id);
  }

  async function handleOpenSettings() {
    try {
      navigateTo("pet-settings");
      await invoke("show_main_window");
      await invoke("close_pet_popover");
    } catch (error) {
      toastState.error(`Could not open main window: ${String(error)}`);
    }
  }

  function handleQuit() {
    if (isDesktop) {
      return invoke("quit_app").catch(error =>
        toastState.error(`Could not quit: ${String(error)}`));
    }
  }

</script>

<div class="pet-popover" aria-label="AgentPet">
  <header class="popover-header">
    <span class="pet-emblem"><PawPrint size={18} /></span>
    <div class="min-w-0">
      <h1>AgentPet</h1>
      <p class="subtitle">{subtitle}</p>
    </div>
  </header>

  <main class="popover-content" aria-label="Companion and preferences">
    <section class="companion" aria-labelledby="companion-heading">
      <h2 id="companion-heading">COMPANION</h2>
      <div class="companion-summary">
        <Sparkles size={14} class="text-(--accent-text) shrink-0" />
        <span class="pet-name" title={petSlug.replace(/-/g, " ")}>{petSlug.replace(/-/g, " ")}</span>
        <span class="level">Lv {care?.display_level ?? 1}</span>
        <span class="hunger">{care?.hunger ?? "Full"}</span>
      </div>
      <div class="xp-track" role="progressbar" aria-label="Level progress" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
        <div style:width="{progressPercent}%"></div>
      </div>
      <div class="companion-stats">
        <span>{inLevelXP} / {spanXP} XP</span>
        <span>Today {todayTokensLabel} tokens · {care?.meals_today ?? 0} meals</span>
      </div>
    </section>

    <section class="agents" aria-labelledby="agents-heading">
      <div class="section-heading">
        <h2 id="agents-heading">AGENTS</h2>
        {#if activeAgents.length > 0}
          <button type="button" onclick={handleClearAll} class="text-action">Clear all</button>
        {/if}
      </div>
      {#if activeAgents.length === 0}
        <p class="empty-agents">Nothing running right now.</p>
      {:else}
        <ul class="session-list" aria-label="Active agent sessions">
          {#each activeAgents as agent, idx (agent.id)}
            {@const agentPet = (void mappingRevision, getPetForSession(agent, idx, petSlug))}
            <li class="session">
              <span class="session-dot" class:working={agent.state === "working"} class:waiting={agent.state === "waiting"}></span>
              <img
                src={agentPet.avatarUrl}
                alt={agentPet.name}
                class="w-4.5 h-4.5 rounded-full border border-(--line) shrink-0 object-cover bg-(--surface)"
                title="{agentPet.name} · {agentPet.tagline}"
              />
              <div class="session-details">
                <span class="session-project" title={agent.project || agent.agent_kind}>
                  {agent.project ? agent.project.split('/').filter(Boolean).pop() : agent.agent_kind}
                </span>
                <span class="session-state">{agent.state} · {agentPet.name}</span>
              </div>
              <span class="elapsed">{formatElapsed(agent.started_at, agent.last_event_at)}</span>
              <button type="button" onclick={() => handleDismiss(agent.id)} class="dismiss-session" aria-label="Dismiss {agent.project ? agent.project.split('/').filter(Boolean).pop() : agent.agent_kind} session" title="Dismiss session">
                <X size={12} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <PetDisplaySettings />
  </main>

  <footer class="popover-footer">
    <button type="button" onclick={handleOpenSettings}><Settings size={14} />Settings</button>
    <button type="button" disabled title="Update checking is not available"><RefreshCw size={14} />Updates</button>
    <button type="button" onclick={handleQuit} class="quit-action"><Power size={14} />Quit</button>
  </footer>
</div>

<ToastHost placement="popover" />

<style>
  :global(body.pet-popover-window) {
    background: transparent;
    overflow: hidden;
  }
  :global(body.pet-popover-window *::-webkit-scrollbar) {
    width: 5px;
    height: 5px;
  }
  :global(body.pet-popover-window *::-webkit-scrollbar-track) {
    background: transparent !important;
  }
  :global(body.pet-popover-window *::-webkit-scrollbar-thumb) {
    background: color-mix(in srgb, var(--input-line) 35%, transparent) !important;
    border: none !important;
    border-radius: 6px !important;
  }
  :global(body.pet-popover-window *::-webkit-scrollbar-thumb:hover) {
    background: var(--input-line) !important;
  }
  :global(body.pet-popover-window [role="region"][aria-label="Notifications"]) {
    bottom: 46px !important;
    left: 14px !important;
    right: 14px !important;
    width: auto !important;
    align-items: center !important;
  }

  .pet-popover {
    display: flex;
    flex-direction: column;
    width: calc(100vw - 12px);
    height: calc(100dvh - 12px);
    margin: 6px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 12px 32px var(--shadow), 0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 0 var(--hi);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    line-height: 1.4;
    user-select: none;
  }
  .popover-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .pet-emblem {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--soft);
    color: var(--accent-text);
    border: 1px solid var(--accent-line);
  }
  h1 { margin: 0; font-family: inherit; font-size: 13.5px; font-weight: 650; line-height: 1.25; }
  .subtitle { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .popover-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 10px 8px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--input-line) 40%, transparent) transparent;
  }
  .popover-content::-webkit-scrollbar {
    width: 5px;
  }
  .popover-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .popover-content::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--input-line) 40%, transparent);
    border-radius: 6px;
  }
  .popover-content::-webkit-scrollbar-thumb:hover {
    background: var(--input-line);
  }
  h2 { margin: 0; color: var(--muted); font-family: inherit; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .companion {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .companion-summary { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .pet-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; font-weight: 600; text-transform: capitalize; }
  .level {
    flex-shrink: 0;
    color: var(--accent-text);
    font-size: 11px;
    font-weight: 600;
  }
  .hunger { margin-left: auto; flex-shrink: 0; color: var(--muted); font-size: 11px; text-transform: capitalize; }
  .xp-track { height: 4px; overflow: hidden; border-radius: 2px; margin-top: 6px; background: var(--track); }
  .xp-track > div { height: 100%; border-radius: inherit; background: var(--strong); transition: width 200ms ease; }
  .companion-stats { display: flex; justify-content: space-between; gap: 4px; margin-top: 5px; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
  .agents { padding: 8px 2px 4px; border-bottom: 1px solid var(--line); }
  .section-heading { display: flex; align-items: center; justify-content: space-between; min-height: 18px; margin-bottom: 3px; }
  .text-action {
    color: var(--accent-text);
    font-size: 11px;
    font-weight: 500;
    padding: 1px 5px;
    border-radius: 4px;
    transition: background 120ms ease;
  }
  .text-action:hover {
    background: var(--soft);
  }
  .empty-agents { margin: 4px 2px; color: var(--muted); font-size: 11px; }
  .session-list {
    list-style: none;
    padding: 0;
    margin: 4px 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .session {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 3px 6px;
    border-radius: 7px;
    transition: background 120ms ease;
  }
  .session:hover, .session:focus-within { background: var(--soft); }
  .session-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 5px color-mix(in srgb, var(--success) 50%, transparent);
  }
  .session-dot.working {
    background: var(--accent-text);
    box-shadow: 0 0 5px color-mix(in srgb, var(--accent-text) 50%, transparent);
  }
  .session-dot.waiting {
    background: var(--warning);
    box-shadow: 0 0 5px color-mix(in srgb, var(--warning) 50%, transparent);
  }
  .session-details { min-width: 0; flex: 1; }
  .session-project { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; font-weight: 600; line-height: 1.25; }
  .session-state { display: block; color: var(--muted); font-size: 10px; text-transform: capitalize; }
  .elapsed { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dismiss-session {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 5px;
    color: var(--muted);
    transition: all 120ms ease;
  }
  .dismiss-session:hover { color: var(--error); background: color-mix(in srgb, var(--error) 14%, transparent); }
  .popover-footer {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    padding: 7px 12px;
    border-top: 1px solid var(--line);
    background: var(--paper);
  }
  button { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  .popover-footer button {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    padding: 2px 6px;
    border-radius: 5px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    transition: all 120ms ease;
  }
  .popover-footer button:hover:not(:disabled) {
    color: var(--ink);
    background: var(--soft);
  }
  .popover-footer button:disabled { color: var(--faint); cursor: not-allowed; opacity: 0.6; }
  .popover-footer .quit-action { margin-left: auto; }
  .popover-footer .quit-action:hover {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, transparent);
  }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
</style>
