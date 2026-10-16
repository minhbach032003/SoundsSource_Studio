<script lang="ts">
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
  let hoveredSessionId = $state<string | null>(null);

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

<div class="w-[300px] min-h-[480px] bg-(--surface)/95 text-(--ink) border border-(--line) rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col select-none overflow-hidden font-sans">
  <!-- 1. Header -->
  <div class="p-3.5 flex items-center justify-between gap-2.5">
    <div class="flex items-center gap-2.5">
      <div class="w-7 h-7 rounded-lg bg-linear-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
        <PawPrint class="w-4 h-4" />
      </div>
      <div>
        <h3 class="text-sm font-bold text-white tracking-tight leading-none m-0">
          AgentPet
        </h3>
        <span class="text-[11px] text-white/50 block mt-0.5 font-medium">
          {subtitle}
        </span>
      </div>
    </div>
  </div>

  <div class="h-px bg-white/10 w-full"></div>

  <!-- 2. Companion Card -->
  <div class="px-3.5 py-3 space-y-2">
    <span class="text-[10px] font-bold tracking-wider text-white/40 uppercase block">
      COMPANION
    </span>
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
          <Sparkles class="w-3.5 h-3.5" />
        </div>
        <span class="font-semibold text-white truncate text-xs">
          {petSlug.replace(/-/g, " ")}
        </span>
        <span class="text-blue-400 font-bold text-xs">
          Lv {care?.display_level ?? 1}
        </span>
      </div>
      <span class="text-[11px] text-white/60 capitalize font-medium">
        {care?.hunger ?? "Full"}
      </span>
    </div>

    <!-- XP Progress Bar -->
    <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        class="h-full bg-linear-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
        style="width: {progressPercent}%;"
      ></div>
    </div>

    <div class="flex items-center justify-between text-[10px] text-white/45 font-mono">
      <span>{inLevelXP} / {spanXP} XP</span>
      <span>Today {todayTokensLabel} tokens · {care?.meals_today ?? 0} meals</span>
    </div>
  </div>

  <div class="h-px bg-white/10 w-full"></div>

  <!-- 3. Active Agents -->
  <div class="px-3.5 py-2.5 flex-1 flex flex-col min-h-0">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-[10px] font-bold tracking-wider text-white/40 uppercase">
        AGENTS
      </span>
      {#if activeAgents.length > 0}
        <button
          type="button"
          onclick={handleClearAll}
          class="text-[11px] text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          Clear all
        </button>
      {/if}
    </div>

    {#if activeAgents.length === 0}
      <div class="py-3 text-center text-xs text-white/40">
        Nothing running right now.
      </div>
    {:else}
      <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {#each activeAgents as agent (agent.id)}
          {@const isHovered = hoveredSessionId === agent.id}
          <div
            role="row"
            tabindex="0"
            onmouseenter={() => (hoveredSessionId = agent.id)}
            onmouseleave={() => (hoveredSessionId = null)}
            class="flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-white/5 transition-colors text-xs group"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="w-2 h-2 rounded-full shrink-0 {agent.state === 'working'
                  ? 'bg-blue-400 animate-pulse shadow-xs shadow-blue-400/50'
                  : agent.state === 'waiting'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'}"
              ></span>
              <div class="min-w-0 leading-tight">
                <span class="font-bold text-white block truncate text-[11px]">
                  {agent.project ? agent.project.split('/').filter(Boolean).pop() : agent.agent_kind}
                </span>
                <span class="text-[10px] text-white/50 block capitalize truncate">
                  {agent.state}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              {#if isHovered}
                <button
                  type="button"
                  onclick={() => handleDismiss(agent.id)}
                  class="w-4 h-4 rounded hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
                  title="Dismiss session"
                >
                  <X class="w-3 h-3" />
                </button>
              {:else}
                <span class="font-mono text-[10px] text-white/50">
                  {formatElapsed(agent.started_at, agent.last_event_at)}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="h-px bg-white/10 w-full"></div>

  <!-- 4. Controls -->
  <div class="px-3.5 py-2 space-y-1 text-xs text-white/90">
    <!-- Show pet -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <PawPrint class="w-3.5 h-3.5 text-white/70" />
        <span>Show pet</span>
      </div>
      <input
        type="checkbox"
        checked={showPet}
        onclick={(event) => {
          // Keep the DOM controlled until the native operation succeeds.
          event.preventDefault();
          togglePetVisibility();
        }}
        class="toggle toggle-sm cursor-pointer accent-blue-500"
      />
    </div>

    <!-- Show count on menu bar -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <Hash class="w-3.5 h-3.5 text-white/70" />
        <span>Show count on menu bar</span>
      </div>
      <input
        type="checkbox"
        bind:checked={showCountOnMenuBar}
        onchange={() => localStorage.setItem("ap_show_count", showCountOnMenuBar ? "1" : "0")}
        class="toggle toggle-sm cursor-pointer accent-blue-500"
      />
    </div>

    <!-- Show chat on menu bar -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <MessageSquare class="w-3.5 h-3.5 text-white/70" />
        <span>Show chat on menu bar</span>
      </div>
      <input
        type="checkbox"
        bind:checked={showChatOnMenuBar}
        onchange={() => localStorage.setItem("ap_show_chat", showChatOnMenuBar ? "1" : "0")}
        class="toggle toggle-sm cursor-pointer accent-blue-500"
      />
    </div>

    <!-- Show bubble on menu bar -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <List class="w-3.5 h-3.5 text-white/70" />
        <span>Show bubble on menu bar</span>
      </div>
      <input
        type="checkbox"
        bind:checked={showBubbleOnMenuBar}
        onchange={() => localStorage.setItem("ap_show_bubble", showBubbleOnMenuBar ? "1" : "0")}
        class="toggle toggle-sm cursor-pointer accent-blue-500"
      />
    </div>

    <!-- Split pet -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <Columns2 class="w-3.5 h-3.5 text-white/70" />
        <span>Split pet</span>
      </div>
      <input
        type="checkbox"
        bind:checked={splitPet}
        onchange={() => localStorage.setItem("ap_split_pet", splitPet ? "1" : "0")}
        class="toggle toggle-sm cursor-pointer accent-blue-500"
      />
    </div>

    <!-- Animate pets + FPS slider -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <Play class="w-3.5 h-3.5 text-white/70" />
        <span>Animate pets</span>
      </div>
      <div class="flex items-center gap-1.5">
        {#if animatePets}
          <input
            type="range"
            min="1"
            max="12"
            bind:value={animationFPS}
            onchange={() => localStorage.setItem("ap_animation_fps", String(animationFPS))}
            class="w-16 h-1 accent-blue-500 cursor-pointer"
          />
          <span class="font-mono text-[10px] text-white/50 w-4 text-right">
            {animationFPS}
          </span>
        {/if}
        <input
          type="checkbox"
          bind:checked={animatePets}
          onchange={() => localStorage.setItem("ap_animate_pets", animatePets ? "1" : "0")}
          class="toggle toggle-sm cursor-pointer accent-blue-500"
        />
      </div>
    </div>

    <!-- Pet size -->
    <div class="flex items-center justify-between py-1">
      <div class="flex items-center gap-2">
        <Maximize2 class="w-3.5 h-3.5 text-white/70" />
        <span>Pet size</span>
      </div>
      <input
        type="range"
        min="70"
        max="240"
        bind:value={petSize}
        onchange={() => {
          localStorage.setItem("rust_sound_pet_size", String(petSize));
          window.dispatchEvent(new Event("storage"));
        }}
        class="w-24 h-1 accent-blue-500 cursor-pointer"
      />
    </div>
  </div>

  <div class="h-px bg-white/10 w-full"></div>

  <!-- 5. Footer -->
  <div class="p-2.5 px-3.5 flex items-center justify-between text-xs text-white/75 bg-black/20">
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={handleOpenSettings}
        class="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
      >
        <Settings class="w-3.5 h-3.5" />
        <span>Settings</span>
      </button>

      <button
        type="button"
        disabled
        title="Update checking is not available"
        class="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
      >
        <RefreshCw class="w-3.5 h-3.5" />
        <span>Updates</span>
      </button>
    </div>

    <button
      type="button"
      onclick={handleQuit}
      class="flex items-center gap-1.5 hover:text-rose-400 transition-colors cursor-pointer"
    >
      <Power class="w-3.5 h-3.5" />
      <span>Quit</span>
    </button>
  </div>
</div>

<ToastHost />
