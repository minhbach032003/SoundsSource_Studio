<script lang="ts">
  import { applyTheme, readThemePreference, themeState, THEME_STORAGE_KEY } from "@/lib/theme.svelte";
  import { setDesktopPetVisible } from "@/lib/petVisibility";
  import { toastState } from "@/lib/toast.svelte";
  import ToastHost from "@/components/ui/ToastHost.svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import type { AgentSessionDto, PetCareStateDto } from "@/components/pet/types";
  import { xpToReach, getInternalLevel } from "@/components/pet/types";
  import {
    PawPrint,
    Hash,
    MessageSquare,
    List,
    Columns2,
    Play,
    Maximize2,
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
  let petSlug = $state<string>("work-blue-cat");

  // Controls state (synced with localStorage & Rust backend)
  let showPet = $state<boolean>(true);
  let showCountOnMenuBar = $state<boolean>(true);
  let showChatOnMenuBar = $state<boolean>(false);
  let showBubbleOnMenuBar = $state<boolean>(false);
  let splitPet = $state<boolean>(false);
  let animatePets = $state<boolean>(true);
  let animationFPS = $state<number>(12);
  let petSize = $state<number>(180);

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
        const [sessList, careState, isPetOpen] = await Promise.all([
          invoke<AgentSessionDto[]>("get_agent_sessions"),
          invoke<PetCareStateDto>("get_pet_care_state"),
          invoke<boolean>("is_pet_overlay_open").catch(() => true),
        ]);
        if (active) {
          if (sessList) {
            sessions = sessList;
            // Update menu bar title with running agent count
            const runningCount = sessList.filter((s) => s.state === "working").length;
            if (showCountOnMenuBar && runningCount > 0) {
              invoke("update_tray_title", { title: `${runningCount}` }).catch(() => {});
            } else if (showCountOnMenuBar) {
              invoke("update_tray_title", { title: "0" }).catch(() => {});
            } else {
              invoke("update_tray_title", { title: "" }).catch(() => {});
            }
          }
          if (careState) care = careState;
          showPet = isPetOpen;
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

  // Load preferences from localStorage on mount
  $effect(() => {
    if (typeof localStorage === "undefined") return;
    petSlug = localStorage.getItem("rust_sound_pet_slug") || "work-blue-cat";
    showCountOnMenuBar = localStorage.getItem("ap_show_count") !== "0";
    showChatOnMenuBar = localStorage.getItem("ap_show_chat") === "1";
    showBubbleOnMenuBar = localStorage.getItem("ap_show_bubble") === "1";
    splitPet = localStorage.getItem("ap_split_pet") === "1";
    animatePets = localStorage.getItem("ap_animate_pets") !== "0";
    animationFPS = parseInt(localStorage.getItem("ap_animation_fps") || "12", 10);
    petSize = parseInt(localStorage.getItem("rust_sound_pet_size") || "180", 10);
  });

  // Active agents (working, waiting, done)
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

  async function togglePetVisibility() {
    try {
      if (!isDesktop) throw new Error("Desktop app required");
      showPet = await setDesktopPetVisible(!showPet);
      toastState.info(showPet ? "Desktop companion shown" : "Desktop companion hidden");
    } catch (error) {
      toastState.error(`Could not change desktop companion visibility: ${String(error)}`);
    }
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
          {#each activeAgents as agent (agent.id)}
            <li class="session">
              <span class="session-dot" class:working={agent.state === "working"} class:waiting={agent.state === "waiting"}></span>
              <div class="session-details">
                <span class="session-project" title={agent.project || agent.agent_kind}>
                  {agent.project ? agent.project.split('/').filter(Boolean).pop() : agent.agent_kind}
                </span>
                <span class="session-state">{agent.state}</span>
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

    <section class="preferences" aria-labelledby="display-heading">
      <h2 id="display-heading">Display</h2>
      <div class="settings-group">
        <label class="setting-row" for="show-pet">
          <span class="setting-label"><PawPrint size={14} />Show pet</span>
          <input id="show-pet" class="pet-switch" type="checkbox" role="switch" checked={showPet}
            onclick={(event) => {
              // Keep the DOM controlled until the native operation succeeds.
              event.preventDefault();
              togglePetVisibility();
            }} />
        </label>
        <label class="setting-row" for="show-count">
          <span class="setting-label"><Hash size={14} />Show count on menu bar</span>
          <input id="show-count" class="pet-switch" type="checkbox" role="switch" bind:checked={showCountOnMenuBar}
            onchange={() => localStorage.setItem("ap_show_count", showCountOnMenuBar ? "1" : "0")} />
        </label>
        <label class="setting-row" for="show-chat">
          <span class="setting-label"><MessageSquare size={14} />Show chat on menu bar</span>
          <input id="show-chat" class="pet-switch" type="checkbox" role="switch" bind:checked={showChatOnMenuBar}
            onchange={() => localStorage.setItem("ap_show_chat", showChatOnMenuBar ? "1" : "0")} />
        </label>
        <label class="setting-row" for="show-bubble">
          <span class="setting-label"><List size={14} />Show bubble on menu bar</span>
          <input id="show-bubble" class="pet-switch" type="checkbox" role="switch" bind:checked={showBubbleOnMenuBar}
            onchange={() => localStorage.setItem("ap_show_bubble", showBubbleOnMenuBar ? "1" : "0")} />
        </label>
        <label class="setting-row" for="split-pet">
          <span class="setting-label"><Columns2 size={14} />Split pet</span>
          <input id="split-pet" class="pet-switch" type="checkbox" role="switch" bind:checked={splitPet}
            onchange={() => localStorage.setItem("ap_split_pet", splitPet ? "1" : "0")} />
        </label>
        <div class="setting-row slider-row">
          <label class="setting-label" for="pet-size"><Maximize2 size={14} />Pet size</label>
          <div class="slider-control">
            <input id="pet-size" type="range" min="70" max="240" bind:value={petSize}
              onchange={() => {
                localStorage.setItem("rust_sound_pet_size", String(petSize));
                window.dispatchEvent(new Event("storage"));
              }} />
            <output for="pet-size">{petSize}<span class="sr-only"> pixels</span></output>
          </div>
        </div>
      </div>
    </section>

    <section class="preferences" aria-labelledby="animation-heading">
      <h2 id="animation-heading">Animation</h2>
      <div class="settings-group">
        <label class="setting-row" for="animate-pets">
          <span class="setting-label"><Play size={14} />Animate pets</span>
          <input id="animate-pets" class="pet-switch" type="checkbox" role="switch" bind:checked={animatePets}
            onchange={() => localStorage.setItem("ap_animate_pets", animatePets ? "1" : "0")} />
        </label>
        {#if animatePets}
          <div class="setting-row slider-row">
            <label for="animation-fps" class="setting-label slider-label">Frame rate</label>
            <div class="slider-control">
              <input id="animation-fps" type="range" min="1" max="12" bind:value={animationFPS}
                onchange={() => localStorage.setItem("ap_animation_fps", String(animationFPS))} />
              <output for="animation-fps">{animationFPS}<span class="sr-only"> frames per second</span></output>
            </div>
          </div>
        {/if}
      </div>
    </section>
  </main>

  <footer class="popover-footer">
    <button type="button" onclick={handleOpenSettings}><Settings size={14} />Settings</button>
    <button type="button" disabled title="Update checking is not available"><RefreshCw size={14} />Updates</button>
    <button type="button" onclick={handleQuit} class="quit-action"><Power size={14} />Quit</button>
  </footer>
</div>

<ToastHost />

<style>
  :global(body.pet-popover-window) {
    background: transparent;
    overflow: hidden;
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
    box-shadow: 0 2px 6px var(--shadow), inset 0 1px 0 var(--hi);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    line-height: 1.4;
    user-select: none;
  }
  .popover-header { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
  .pet-emblem { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--soft); color: var(--accent-text); }
  h1 { margin: 0; font-family: inherit; font-size: 14px; font-weight: 650; line-height: 1.25; }
  .subtitle { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .popover-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 12px 8px; }
  h2 { margin: 0; color: var(--muted); font-family: inherit; font-size: 10px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
  .companion { padding: 8px 0; border-bottom: 1px solid var(--line); }
  .companion-summary { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .pet-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; text-transform: capitalize; }
  .level { flex-shrink: 0; color: var(--accent-text); font-size: 11px; font-weight: 600; }
  .hunger { margin-left: auto; flex-shrink: 0; color: var(--muted); font-size: 11px; text-transform: capitalize; }
  .xp-track { height: 4px; overflow: hidden; border-radius: 4px; margin-top: 6px; background: var(--track); }
  .xp-track > div { height: 100%; border-radius: inherit; background: var(--strong); }
  .companion-stats { display: flex; justify-content: space-between; gap: 4px; margin-top: 4px; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
  .agents { padding: 7px 0; border-bottom: 1px solid var(--line); }
  .section-heading { display: flex; align-items: center; justify-content: space-between; min-height: 18px; }
  .text-action { color: var(--accent-text); font-size: 11px; }
  .empty-agents { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  .session-list { list-style: none; padding: 0 3px; margin: 4px -3px 0; max-height: 126px; overflow-y: auto; }
  .session { display: flex; align-items: center; gap: 7px; min-height: 38px; padding: 2px 3px; border-radius: 6px; }
  .session:hover, .session:focus-within { background: var(--soft); }
  .session-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--success); }
  .session-dot.working { background: var(--accent-text); }
  .session-dot.waiting { background: var(--warning); }
  .session-details { min-width: 0; flex: 1; }
  .session-project { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; }
  .session-state { display: block; color: var(--muted); font-size: 10px; text-transform: capitalize; }
  .elapsed { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dismiss-session { display: grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 5px; color: var(--muted); }
  .dismiss-session:hover { color: var(--error); background: var(--surface); }
  .preferences { padding-top: 8px; }
  .preferences h2 { margin: 0 0 5px 2px; }
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
  .slider-label { padding-left: 21px; }
  .slider-control { display: flex; align-items: center; gap: 7px; }
  input[type="range"] { width: 90px; height: 18px; margin: 0; cursor: pointer; accent-color: var(--strong); }
  output { min-width: 23px; color: var(--muted); font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
  .popover-footer { display: flex; align-items: center; gap: 16px; flex-shrink: 0; padding: 7px 12px; border-top: 1px solid var(--line); background: var(--paper); }
  button { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  .popover-footer button { display: flex; align-items: center; gap: 5px; min-height: 24px; color: var(--muted); font-size: 11px; }
  .popover-footer button:hover:not(:disabled) { color: var(--ink); }
  .popover-footer button:disabled { color: var(--faint); cursor: not-allowed; }
  .popover-footer .quit-action { margin-left: auto; }
  .popover-footer .quit-action:hover { color: var(--error); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { .pet-switch::after { transition: none; } }
</style>
