<script lang="ts">
  import { navigateTo } from "@/lib/navigation";
  import { setDesktopPetVisible } from "@/lib/petVisibility";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import PetGallery from "@/components/pet/PetGallery.svelte";
  import PetAnimationPicker from "@/components/pet/PetAnimationPicker.svelte";
  import PetSocketPanel from "@/components/pet/PetSocketPanel.svelte";
  import PetActivityStream from "@/components/pet/PetActivityStream.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import {
    playPetDoneChime,
    playPetWaitingChime,
    sendDesktopNotification,
    shouldTriggerPetAlert,
  } from "@/lib/petAudio";
  import {
    ACHIEVEMENTS_METADATA,
    SPEECH_QUOTES,
    INITIAL_EVENTS,
    xpToReach,
    getInternalLevel,
    type PetCareStateDto,
    type PetBridgeStatusDto,
    type AgentSessionDto,
    type AgentIntegrationDto,
    type PetEvent,
    type PetMood,
  } from "@/components/pet/types";
  import {
    getPetForSession,
    getProjectName,
    setProjectPetBinding,
    setSessionPetBinding,
    getPetArchetype,
    getActivePets,
  } from "@/lib/petMapping";
  import {
    Sparkles,
    Heart,
    Zap,
    Coffee,
    Utensils,
    Moon,
    Flame,
    Award,
    Radio,
    Laptop,
    RotateCcw,
    Send,
    Terminal,
    Bot,
    Crown,
    Trophy,
    Shield,
    Leaf,
    PawPrint,
    Compass,
    Activity,
    Fish,
    Check,
    PartyPopper,
    Settings,
  } from "@lucide/svelte";

  // The 5 rank hues preserved verbatim
  export const STAGE_CONFIGS: Record<
    string,
    {
      icon: typeof Leaf;
      color: string;
      bg: string;
      border: string;
      text: string;
    }
  > = {
    Hatchling: {
      icon: Leaf,
      color: "#10b981",
      bg: "bg-[color-mix(in_srgb,#10b981_15%,transparent)]",
      border: "border-[color-mix(in_srgb,#10b981_30%,transparent)]",
      text: "text-[#10b981]",
    },
    Companion: {
      icon: PawPrint,
      color: "#14b8a6",
      bg: "bg-[color-mix(in_srgb,#14b8a6_15%,transparent)]",
      border: "border-[color-mix(in_srgb,#14b8a6_30%,transparent)]",
      text: "text-[#14b8a6]",
    },
    Scout: {
      icon: Compass,
      color: "#fb7185",
      bg: "bg-[color-mix(in_srgb,#fb7185_15%,transparent)]",
      border: "border-[color-mix(in_srgb,#fb7185_30%,transparent)]",
      text: "text-[#fb7185]",
    },
    Hero: {
      icon: Shield,
      color: "#a855f7",
      bg: "bg-[color-mix(in_srgb,#a855f7_15%,transparent)]",
      border: "border-[color-mix(in_srgb,#a855f7_30%,transparent)]",
      text: "text-[#a855f7]",
    },
    Legend: {
      icon: Crown,
      color: "#f59e0b",
      bg: "bg-[color-mix(in_srgb,#f59e0b_15%,transparent)]",
      border: "border-[color-mix(in_srgb,#f59e0b_30%,transparent)]",
      text: "text-[#f59e0b]",
    },
  };

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  // Live Pet Care State
  let careState = $state<PetCareStateDto>({
    xp: 1850,
    level: 4,
    display_level: 3,
    progress: 0.65,
    stage_name: "Companion",
    stage_index: 1,
    hunger: "full",
    tokens_today: 42000,
    meals_today: 3,
    total_tokens: 154000,
    total_meals: 12,
    streak_days: 4,
    unlocked_achievements: ["firstMeal", "level5"],
  });

  let agentSessions = $state<AgentSessionDto[]>([]);
  let bridgeStatus = $state<PetBridgeStatusDto | null>(null);
  let agentIntegrations = $state<AgentIntegrationDto[]>([
    { kind: "claude", display_name: "Claude Code", is_supported: true, is_installed: false },
    { kind: "codex", display_name: "Codex", is_supported: true, is_installed: false },
    { kind: "gemini", display_name: "Gemini CLI", is_supported: true, is_installed: false },
    { kind: "cursor", display_name: "Cursor", is_supported: true, is_installed: false },
    { kind: "pi", display_name: "Pi Coding Agent", is_supported: true, is_installed: true },
    { kind: "droid", display_name: "Factory Droid", is_supported: true, is_installed: false },
  ]);

  // Selected Pet & Vitals
  let selectedPet = $state<string>("code-frenzy-cat");
  const currentArchetype = $derived(getPetArchetype(selectedPet));
  let mappingRevision = $state(0);
  $effect(() => {
    const handler = () => { mappingRevision += 1; };
    window.addEventListener("project-pet-changed", handler);
    window.addEventListener("session-pet-changed", handler);
    window.addEventListener("favorite-pets-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("project-pet-changed", handler);
      window.removeEventListener("session-pet-changed", handler);
      window.removeEventListener("favorite-pets-changed", handler);
      window.removeEventListener("storage", handler);
    };
  });
  let petEnergy = $state<number>(88);
  let petMood = $state<number>(94);
  let petFocus = $state<number>(92);

  // Interaction State
  let isInteracting = $state<boolean>(false);
  let interactionAction = $state<string | null>(null);
  let currentQuoteIndex = $state<number>(0);

  // Bridge Toggles
  let showDesktopOverlay = $state<boolean>(false);
  let audioReactive = $state<boolean>(true);
  let focusTimerSync = $state<boolean>(true);
  let activityTheme = $state<string>("Chef");

  // Events & Modal
  let events = $state<PetEvent[]>(INITIAL_EVENTS);
  let isResetModalOpen = $state<boolean>(false);
  let activeViewTab = $state<"cockpit" | "gallery" | "animations" | "stream" | "socket">("cockpit");

  // Read saved pet slug from localStorage on mount
  $effect(() => {
    try {
      const active = getActivePets();
      const saved = localStorage.getItem("rust_sound_pet_slug");
      if (saved && active.some((p) => p.id === saved)) {
        selectedPet = saved;
      } else if (active[0]) {
        selectedPet = active[0].id;
      }
    } catch {}
  });

  // Both controls report actual native visibility; neither restores on tab mount.
  $effect(() => {
    if (!isDesktop) return;
    let active = true;
    const poll = () => invoke<boolean>("is_pet_overlay_open")
      .then(visible => { if (active) showDesktopOverlay = visible; }).catch(() => {});
    poll();
    const timer = setInterval(poll, 1000);
    return () => { active = false; clearInterval(timer); };
  });

  // Load activity theme
  $effect(() => {
    if (isDesktop) {
      invoke<string>("get_pet_activity_theme")
        .then((th) => {
          if (th) activityTheme = th;
        })
        .catch(() => {});
    }
  });

  // Periodic polling for backend state
  const previousSessionStates = new Map<string, string>();

  $effect(() => {
    if (!isDesktop) return;

    const poll = async () => {
      try {
        const [care, sessList, integList, bridge] = await Promise.all([
          invoke<PetCareStateDto>("get_pet_care_state"),
          invoke<AgentSessionDto[]>("get_agent_sessions"),
          invoke<AgentIntegrationDto[]>("get_agent_integrations"),
          invoke<PetBridgeStatusDto>("get_pet_bridge_status"),
        ]);
        if (care) careState = care;
        if (bridge) bridgeStatus = bridge;
        if (sessList) {
          for (const s of sessList) {
            const prevState = previousSessionStates.get(s.id);
            if (prevState && prevState !== s.state) {
              const agentName = s.agent_kind
                ? s.agent_kind.charAt(0).toUpperCase() + s.agent_kind.slice(1)
                : "Agent";
              if (s.state === "waiting") {
                if (shouldTriggerPetAlert(s.id, "waiting")) {
                  playPetWaitingChime();
                  sendDesktopNotification(
                    `[${agentName}] needs input`,
                    s.message || "Waiting for your input"
                  );
                }
              } else if (s.state === "done") {
                if (shouldTriggerPetAlert(s.id, "done")) {
                  playPetDoneChime();
                  sendDesktopNotification(
                    `[${agentName}] finished`,
                    "Task completed"
                  );
                }
              }
            }
            previousSessionStates.set(s.id, s.state);
          }
          agentSessions = sessList;
          if (sessList.length > 0) {
            const top = sessList[0];
            const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const hasExisting = events.some(
              (e) => e.source.includes(top.agent_kind) && e.message === (top.message || top.tool_summary || "")
            );
            if (!hasExisting) {
              const newEvt: PetEvent = {
                id: `${top.id}-${Date.now()}`,
                category: "coding",
                source: `${top.agent_kind}:${top.tool_name || top.state}`,
                event: top.state,
                message: top.message || top.tool_summary || `Agent task in ${top.project || "workspace"}`,
                time: timeStr,
              };
              events = [newEvt, ...events.slice(0, 19)];
            }
          }
        }
        if (integList && integList.length > 0) {
          agentIntegrations = integList;
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  });

  // Cycle speech quotes
  $effect(() => {
    const interval = setInterval(() => {
      currentQuoteIndex = (currentQuoteIndex + 1) % 5;
    }, 12000);
    return () => clearInterval(interval);
  });

  const activeQuotes = $derived(SPEECH_QUOTES[selectedPet] || SPEECH_QUOTES["code-frenzy-cat"]);
  const currentQuote = $derived(activeQuotes[currentQuoteIndex % activeQuotes.length]);

  const topActiveSession = $derived(
    agentSessions.find((s) => s.state === "working" || s.state === "waiting")
  );

  const liveBubbleMessage = $derived(
    topActiveSession
      ? topActiveSession.tool_name
        ? `Executing ${topActiveSession.tool_name}: ${topActiveSession.tool_summary || "Working..."}`
        : topActiveSession.message || `Working on ${topActiveSession.project || "code"}...`
      : currentQuote
  );

  const currentMood = $derived<PetMood>(
    isInteracting
      ? interactionAction === "purring"
        ? "celebrate"
        : interactionAction === "sleep"
        ? "sleepy"
        : "working"
      : topActiveSession
      ? topActiveSession.state === "working"
        ? "working"
        : topActiveSession.state === "waiting"
        ? "waiting"
        : topActiveSession.state === "done"
        ? "done"
        : "idle"
      : "idle"
  );

  // Level & XP Progression calculations
  const internalLevel = $derived(getInternalLevel(careState.xp));
  const floorXP = $derived(xpToReach(internalLevel));
  const ceilingXP = $derived(xpToReach(internalLevel + 1));
  const inLevelXP = $derived(Math.max(0, careState.xp - floorXP));
  const spanXP = $derived(Math.max(1, ceilingXP - floorXP));
  const progressPercent = $derived(Math.min(100, Math.max(0, Math.round((inLevelXP / spanXP) * 100))));
  const tokensToNext = $derived(Math.max(0, (ceilingXP - careState.xp) * 5000));
  const stageConfig = $derived(STAGE_CONFIGS[careState.stage_name] || STAGE_CONFIGS["Hatchling"]);
  const StageIcon = $derived(stageConfig.icon);

  // Desktop Overlay Toggle (open_pet_overlay_window)
  export async function open_pet_overlay_window(enable: boolean) {
    try {
      if (!isDesktop) throw new Error("Desktop app required");
      showDesktopOverlay = await setDesktopPetVisible(enable);
      toastState.info(showDesktopOverlay ? "Desktop companion shown" : "Desktop companion hidden");
    } catch (error) {
      toastState.error(`Could not change desktop companion visibility: ${String(error)}`);
    }
  }

  function handleToggleDesktopOverlay() {
    open_pet_overlay_window(!showDesktopOverlay);
  }

  // Action Buttons calling backend feed_pet_action
  async function handlePetAction() {
    isInteracting = true;
    interactionAction = "purring";
    petMood = Math.min(100, petMood + 6);

    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "pet" });
        careState = next;
      } catch {}
    } else {
      careState = { ...careState, xp: careState.xp + 15 };
    }

    currentQuoteIndex = (currentQuoteIndex + 1) % activeQuotes.length;
    toastState.success("Pet companion! Mood boosted (+6%) and gained +15 XP");

    setTimeout(() => {
      isInteracting = false;
      interactionAction = null;
    }, 1000);
  }

  async function handleFeedAction() {
    isInteracting = true;
    interactionAction = "eating";
    petMood = Math.min(100, petMood + 4);

    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "tuna" });
        careState = next;
      } catch {}
    } else {
      careState = { ...careState, xp: careState.xp + 20, hunger: "full" };
    }

    toastState.success("Served meal treat! Hunger satisfied (+20 XP)");

    setTimeout(() => {
      isInteracting = false;
      interactionAction = null;
    }, 1000);
  }

  async function handleSleepAction() {
    isInteracting = true;
    interactionAction = "sleep";
    petEnergy = Math.min(100, petEnergy + 20);
    petMood = Math.min(100, petMood + 10);

    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "rest" });
        careState = next;
      } catch {}
    } else {
      careState = { ...careState, xp: careState.xp + 10 };
    }

    toastState.info("Quick meditation rest taken. Fatigue cleared (+10 XP)");

    setTimeout(() => {
      isInteracting = false;
      interactionAction = null;
    }, 1000);
  }

  async function handleCelebrateAction() {
    isInteracting = true;
    interactionAction = "purring";
    petEnergy = Math.min(100, petEnergy + 12);
    petFocus = Math.min(100, petFocus + 8);

    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "coffee" });
        careState = next;
      } catch {}
    } else {
      careState = { ...careState, xp: careState.xp + 25 };
    }

    toastState.success("Celebrated milestone! Energy (+12%) and Focus boosted (+25 XP)");

    setTimeout(() => {
      isInteracting = false;
      interactionAction = null;
    }, 1000);
  }

  async function handleActivityThemeChange(newTheme: string) {
    activityTheme = newTheme;
    if (isDesktop) {
      try {
        await invoke("set_pet_activity_theme", { theme: newTheme });
      } catch {}
    }
    toastState.info(`Switched companion activity theme to ${newTheme}`);
  }

  function handleSimulatePing() {
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newEvt: PetEvent = {
      id: Date.now().toString(),
      category: "coding",
      source: "pi:test-ping",
      event: "working",
      message: "Coding pulse received from agent session. Companion gained +10 XP!",
      time: timeStr,
    };
    events = [newEvt, ...events.slice(0, 19)];
    petFocus = Math.min(100, petFocus + 4);

    if (isDesktop) {
      invoke<PetCareStateDto>("feed_pet_action", { action: "pet" })
        .then((s) => (careState = s))
        .catch(() => {});
    }
    toastState.success("Agent ping received! Companion synchronized");
  }

  async function handleToggleHook(kind: string, isInstalled: boolean) {
    const next = !isInstalled;
    try {
      if (isDesktop) {
        await invoke("toggle_agent_hook", { kind, enabled: next });
        const updated = await invoke<AgentIntegrationDto[]>("get_agent_integrations");
        agentIntegrations = updated;
      } else {
        agentIntegrations = agentIntegrations.map((i) =>
          i.kind === kind ? { ...i, is_installed: next } : i
        );
      }
      toastState.success(
        next ? `Hook installed for ${kind}! Agent events will stream to pet` : `Hook removed for ${kind}`
      );
    } catch (e) {
      toastState.error(`Failed to configure hook: ${String(e)}`);
    }
  }

  async function handleDismissSession(id: string) {
    if (isDesktop) {
      try {
        await invoke("dismiss_agent_session", { id });
        agentSessions = agentSessions.filter((s) => s.id !== id);
      } catch {}
    } else {
      agentSessions = agentSessions.filter((s) => s.id !== id);
    }
    toastState.info("Session dismissed from active monitor");
  }

  async function handleConfirmReset() {
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("reset_pet_care_state");
        careState = next;
      } catch {}
    } else {
      careState = {
        xp: 0,
        level: 1,
        display_level: 0,
        progress: 0,
        stage_name: "Hatchling",
        stage_index: 0,
        hunger: "peckish",
        tokens_today: 0,
        meals_today: 0,
        total_tokens: 0,
        total_meals: 0,
        streak_days: 0,
        unlocked_achievements: [],
      };
    }
    petEnergy = 70;
    petMood = 75;
    petFocus = 60;
    isResetModalOpen = false;
    toastState.info("Companion progression and vitals reset to defaults.");
  }
</script>

<div class="w-full flex flex-col space-y-4 select-none pb-8">
  <!-- 1. Header Toolbar -->
  <div class="flex items-center justify-between flex-wrap gap-2.5 shrink-0 pb-1">
    <div class="flex flex-wrap items-center gap-2.5 min-w-0">
      <!-- Evolution Stage Badge with Rank Hue text and styling -->
      <span
        class="badge text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5 {stageConfig.bg} {stageConfig.border}"
      >
        <StageIcon class="w-3.5 h-3.5 {stageConfig.text}" />
        <span class={stageConfig.text}>Lv {careState.display_level} · {careState.stage_name}</span>
      </span>

      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-(--paper) border border-(--line) text-[11px] text-(--ink)">
        <Radio class="w-3.5 h-3.5 text-(--success) animate-pulse" />
        <span class="font-mono">/tmp/rust-sound-agent-pet.sock</span>
      </div>

      {#if careState.streak_days > 0}
        <span class="badge badge-ok text-[11px] px-2 py-0.5 font-semibold flex items-center gap-1">
          <Flame class="w-3 h-3 text-(--warning)" />
          {careState.streak_days} Day Streak
        </span>
      {/if}
    </div>

    <!-- Quick Actions in Header -->
    <div class="flex items-center gap-2">
      <button type="button" onclick={() => navigateTo("pet-settings")}
        class="btn btn-ghost h-7 text-xs px-2.5 border border-(--line) flex items-center gap-1.5">
        <Settings class="w-3.5 h-3.5" />AgentPet Settings
      </button>
      <button
        type="button"
        onclick={handleToggleDesktopOverlay}
        class="btn btn-ghost h-7 text-xs px-2.5 border border-(--line) flex items-center gap-1.5"
        title="Toggle Desktop Floating Pet Window"
      >
        <Laptop class="w-3.5 h-3.5 text-(--accent-text)" />
        <span>{showDesktopOverlay ? "Desktop Pet Active" : "Launch Desktop Pet"}</span>
      </button>

      <span class="badge badge-ok text-xs font-semibold px-2.5 py-1 flex items-center gap-1">
        <Check class="w-3 h-3 text-(--success)" />
        IPC Socket Active
      </span>

      <button
        type="button"
        onclick={handleSimulatePing}
        class="btn btn-ghost h-7 text-xs text-(--accent-text) border border-(--line) px-2.5 flex items-center gap-1"
        title="Send simulation test pulse"
      >
        <Send class="w-3 h-3 text-(--accent-text)" />
        <span class="hidden md:inline">Pulse</span>
      </button>

      <button
        type="button"
        onclick={() => (isResetModalOpen = true)}
        class="btn btn-ghost h-7 text-xs text-(--muted) hover:text-(--ink) px-2"
        title="Reset companion stats"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Reset</span>
      </button>
    </div>
  </div>

  <!-- Cockpit Navigation Sub-Tabs -->
  <div class="flex items-center gap-1 p-1 rounded-xl bg-(--paper) border border-(--line) shrink-0 overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeViewTab = "cockpit")}
      class="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 {activeViewTab === 'cockpit'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Bot class="w-3.5 h-3.5 text-(--accent-text)" />
      Companion Cockpit
    </button>
    <button
      type="button"
      onclick={() => (activeViewTab = "stream")}
      class="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 {activeViewTab === 'stream'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Terminal class="w-3.5 h-3.5 text-(--success)" />
      Activity Stream
      {#if events.length > 0}
        <span class="text-[9px] px-1.5 py-0 rounded bg-(--surface) border border-(--line) text-(--muted) font-mono">
          {events.length}
        </span>
      {/if}
    </button>
    <button
      type="button"
      onclick={() => (activeViewTab = "socket")}
      class="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 {activeViewTab === 'socket'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Radio class="w-3.5 h-3.5 text-(--accent-text)" />
      Socket & Sessions Bridge
      {#if agentSessions.length > 0}
        <span class="w-4 h-4 rounded-full bg-(--surface) text-(--success) text-[9px] flex items-center justify-center font-bold border border-(--line) font-mono">
          {agentSessions.length}
        </span>
      {/if}
    </button>
  </div>

  <!-- TAB: FULL GALLERY VIEW -->
  {#if activeViewTab === "gallery"}
    <PetGallery
      bind:selectedPet
      {careState}
      onSelectPet={(slug) => toastState.success(`Equipped companion ${slug}!`)}
    />

  <!-- TAB: ANIMATIONS BINDING INSPECTOR -->
  {:else if activeViewTab === "animations"}
    <PetAnimationPicker
      slug={selectedPet}
      onBindingChange={(state, clipIdx) =>
        toastState.info(`Bound ${state} to Clip ${clipIdx + 1} for ${selectedPet}`)
      }
    />

  <!-- TAB: FULL ACTIVITY STREAM VIEW -->
  {:else if activeViewTab === "stream"}
    <PetActivityStream
      {events}
      onSimulatePing={handleSimulatePing}
    />

  <!-- TAB: FULL SOCKET & SESSIONS VIEW -->
  {:else if activeViewTab === "socket"}
    <PetSocketPanel
      {agentSessions}
      {agentIntegrations}
      {bridgeStatus}
      {showDesktopOverlay}
      {audioReactive}
      {focusTimerSync}
      {activityTheme}
      onToggleDesktopOverlay={handleToggleDesktopOverlay}
      onToggleAudioReactive={() => {
        audioReactive = !audioReactive;
        toastState.info(audioReactive ? "Audio-reactive rhythm enabled" : "Audio-reactive rhythm paused");
      }}
      onToggleFocusTimerSync={() => {
        focusTimerSync = !focusTimerSync;
        toastState.info(focusTimerSync ? "Break timer sync activated" : "Break timer sync disabled");
      }}
      onActivityThemeChange={handleActivityThemeChange}
      onSimulatePing={handleSimulatePing}
      onDismissSession={handleDismissSession}
      onToggleHook={handleToggleHook}
    />

  <!-- MAIN COMPANION VIEW (Focused, Studio-Grade Hero & Consolidated Sidebar) -->
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Left Column (lg:col-span-7): Clean Companion Stage & Vitals -->
      <div class="lg:col-span-7 flex flex-col gap-4">
        <!-- Main Companion Stage -->
        <div class="flex flex-col items-center p-5 sm:p-6 panel relative overflow-hidden gap-3">
          <!-- Subtle Glow Backdrop -->
          <div
            class="absolute inset-0 rounded-full blur-3xl pointer-events-none opacity-20 {audioReactive
              ? 'bg-linear-to-tr from-rose-500/20 via-pink-500/10 to-purple-500/15'
              : 'bg-rose-500/10'}"
          ></div>

          <!-- Top Row: Pet Selector Dropdown & Switcher -->
          <div class="flex items-center justify-between w-full mb-1 gap-2 relative z-10 shrink-0">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <img
                src={currentArchetype.avatarUrl}
                alt={currentArchetype.name}
                class="w-8 h-8 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs"
              />
              <select
                bind:value={selectedPet}
                onchange={() => {
                  try {
                    localStorage.setItem("rust_sound_pet_slug", selectedPet);
                    window.dispatchEvent(new Event("storage"));
                  } catch {}
                  toastState.info(`Switched active companion to ${currentArchetype.name}`);
                }}
                class="field text-xs h-8.5 rounded-lg max-w-60"
              >
                {#each getActivePets() as pet}
                  <option value={pet.id}>{pet.name} ({pet.tag})</option>
                {/each}
              </select>
            </div>

            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-(--paper) border border-(--line) text-(--warning) text-xs font-semibold shadow-xs">
              <Flame class="w-3.5 h-3.5 text-(--warning) shrink-0" />
              <span>{careState.streak_days > 0 ? `${careState.streak_days}-Day Streak` : "Active Streak"}</span>
            </div>
          </div>

          <!-- Interactive Speech / Context Bubble -->
          <div class="relative max-w-lg w-full my-1 z-10 shrink-0">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={() => (currentQuoteIndex = (currentQuoteIndex + 1) % activeQuotes.length)}
              class="relative bg-(--paper) border border-(--line) rounded-2xl p-2.5 px-3.5 shadow-sm cursor-pointer hover:border-(--focus) transition-all text-center group"
              title="Click companion to hear next thought"
            >
              <div class="flex items-center justify-center gap-2">
                <Sparkles class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
                <p class="text-xs font-medium text-(--ink) m-0 group-hover:text-(--accent-text) transition-colors">
                  "{liveBubbleMessage}"
                </p>
              </div>
              <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-(--paper) border-r border-b border-(--line) transform rotate-45"></div>
            </div>
          </div>

          <!-- Character Stage & Crisp Animated Sprite -->
          <div class="relative w-full flex-1 flex flex-col items-center justify-center select-none py-3 z-10">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={handlePetAction}
              class="relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-200 {isInteracting
                ? 'scale-105'
                : 'hover:scale-102'}"
              title="Click companion to pet!"
            >
              <AgentPetSprite
                slug={selectedPet}
                mood={currentMood}
                size={160}
              />

              <!-- Status Pill -->
              <span class="mt-2.5 px-3 py-0.5 rounded-full text-[10px] font-bold bg-(--paper) border border-(--line) text-(--ink) shadow-xs flex items-center gap-1.5">
                <span
                  class="w-1.5 h-1.5 rounded-full {currentMood === 'working'
                    ? 'bg-(--success)'
                    : currentMood === 'waiting'
                    ? 'bg-(--warning)'
                    : 'bg-(--accent)'}"
                ></span>
                <span>
                  {#if isInteracting}
                    {interactionAction === "purring"
                      ? "Purring Happily"
                      : interactionAction === "sleep"
                      ? "Resting Peacefully"
                      : "Devouring Meal"}
                  {:else if topActiveSession}
                    {topActiveSession.agent_kind.toUpperCase()} ({topActiveSession.state})
                  {:else}
                    Coding Companion (Ready)
                  {/if}
                </span>
              </span>
            </div>
          </div>

          <!-- Tactical Care Action Dock -->
          <div class="flex flex-wrap items-center justify-center gap-2 pt-3 mt-1 border-t border-(--line) w-full relative z-10">
            <button
              type="button"
              onclick={handlePetAction}
              class="btn btn-primary h-8 px-3.5 text-xs font-semibold shadow-xs"
              title="Pet companion (+15 XP, Mood Boost)"
            >
              <Sparkles class="w-3.5 h-3.5 text-(--accent-ink)" />
              <span>Pet</span>
            </button>
            <button
              type="button"
              onclick={handleFeedAction}
              class="btn h-8 px-3.5 text-xs font-semibold"
              title="Feed treat (+20 XP, Satisfy Hunger)"
            >
              <Utensils class="w-3.5 h-3.5 text-(--success)" />
              <span>Feed</span>
            </button>
            <button
              type="button"
              onclick={handleSleepAction}
              class="btn btn-ghost h-8 px-3.5 text-xs font-semibold border border-(--line)"
              title="Rest meditation (+10 XP, Rest Energy)"
            >
              <Moon class="w-3.5 h-3.5 text-(--accent-text)" />
              <span>Rest</span>
            </button>
            <button
              type="button"
              onclick={handleCelebrateAction}
              class="btn h-8 px-3.5 text-xs font-semibold"
              title="Celebrate milestone (+25 XP)"
            >
              <PartyPopper class="w-3.5 h-3.5 text-(--warning)" />
              <Coffee class="w-3 h-3 text-(--warning)" />
              <span>Celebrate</span>
            </button>
          </div>
        </div>

        <!-- Embedded Pet Gallery Showcase -->
        <PetGallery
          bind:selectedPet
          {careState}
          onSelectPet={(slug) => toastState.success(`Equipped companion ${slug}!`)}
        />

        <!-- Interactive Animations Clip Inspector & Binding Panel -->
        <PetAnimationPicker
          slug={selectedPet}
          onBindingChange={(state, clipIdx) =>
            toastState.info(`Bound ${state} to Clip ${clipIdx + 1} for ${selectedPet}`)
          }
        />

        <!-- Compact Progression & Vitals Panel -->
        <div class="panel p-4 sm:p-5 shadow-sm space-y-3.5">
          <!-- Level & XP Progression Bar -->
          <div class="bg-(--paper) border border-(--line) rounded-xl p-3 px-3.5">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-lg flex items-center justify-center border {stageConfig.bg} {stageConfig.border}">
                  <StageIcon class="w-3.5 h-3.5 {stageConfig.text}" />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-(--ink) text-xs">
                    Lv {careState.display_level}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border {stageConfig.bg} {stageConfig.border} {stageConfig.text}">
                    {careState.stage_name}
                  </span>
                </div>
              </div>

              <div class="text-right">
                <span class="text-[11px] font-semibold text-(--accent-text) tabular-nums">
                  {inLevelXP.toLocaleString()} / {spanXP.toLocaleString()} XP
                </span>
                <span class="text-[10px] text-(--muted) font-mono ml-1.5">
                  ({progressPercent}%)
                </span>
              </div>
            </div>

            <!-- Progress Track -->
            <div class="w-full h-2 bg-(--surface) rounded-full overflow-hidden mt-1.5">
              <div
                class="h-full bg-linear-to-r from-rose-500 to-pink-400 rounded-full transition-all duration-300"
                style="width: {progressPercent}%;"
              ></div>
            </div>

            <div class="flex items-center justify-between mt-2 pt-1.5 border-t border-(--line) text-[10px] text-(--muted)">
              <span class="flex items-center gap-1 text-(--ink)">
                <Sparkles class="w-3 h-3 text-(--accent-text)" />
                Lifetime XP: {careState.xp.toLocaleString()}
              </span>
              <span class="font-medium {stageConfig.text}">
                ≈ {tokensToNext.toLocaleString()} tokens to Lv {careState.display_level + 1}
              </span>
            </div>
          </div>

          <!-- 4 Core Vitals Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <!-- 1. Energy -->
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-(--muted) flex items-center gap-1 font-medium">
                  <Zap class="w-3 h-3 text-(--warning)" />
                  Energy
                </span>
                <span class="font-semibold text-(--ink) tabular-nums">{petEnergy}%</span>
              </div>
              <div class="w-full h-1.5 bg-(--surface) rounded-full overflow-hidden">
                <div class="h-full bg-amber-400 rounded-full transition-all duration-300" style="width: {petEnergy}%;"></div>
              </div>
            </div>

            <!-- 2. Mood -->
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-(--muted) flex items-center gap-1 font-medium">
                  <Heart class="w-3 h-3 text-(--accent-text)" />
                  Mood
                </span>
                <span class="font-semibold text-(--ink) tabular-nums">{petMood}%</span>
              </div>
              <div class="w-full h-1.5 bg-(--surface) rounded-full overflow-hidden">
                <div class="h-full bg-rose-400 rounded-full transition-all duration-300" style="width: {petMood}%;"></div>
              </div>
            </div>

            <!-- 3. Focus -->
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-(--muted) flex items-center gap-1 font-medium">
                  <Activity class="w-3 h-3 text-(--accent-text)" />
                  Focus
                </span>
                <span class="font-semibold text-(--ink) tabular-nums">{petFocus}%</span>
              </div>
              <div class="w-full h-1.5 bg-(--surface) rounded-full overflow-hidden">
                <div class="h-full bg-rose-400 rounded-full transition-all duration-300" style="width: {petFocus}%;"></div>
              </div>
            </div>

            <!-- 4. Hunger -->
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-(--muted) flex items-center gap-1 font-medium">
                  <Fish class="w-3 h-3 text-(--success)" />
                  Hunger
                </span>
                <span class="font-semibold text-(--success) capitalize text-[10px]">
                  {careState.hunger}
                </span>
              </div>
              <div class="w-full h-1.5 bg-(--surface) rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300 {careState.hunger === 'full'
                    ? 'w-full bg-emerald-400'
                    : careState.hunger === 'satisfied'
                    ? 'w-3/4 bg-emerald-500'
                    : careState.hunger === 'peckish'
                    ? 'w-1/2 bg-amber-400'
                    : 'w-1/4 bg-rose-500'}"
                ></div>
              </div>
            </div>
          </div>

          <!-- Collapsible Progress Details & Achievements -->
          <details class="bg-(--paper) border border-(--line) rounded-xl p-3 text-xs group">
            <summary class="font-semibold text-(--ink) flex items-center justify-between cursor-pointer select-none">
              <span class="flex items-center gap-1.5">
                <Trophy class="w-3.5 h-3.5 text-(--warning)" />
                <Award class="w-3 h-3 text-(--accent-text)" />
                Achievements & Work Ledger
              </span>
              <span class="text-(--muted) text-[10px] font-mono">
                {careState.unlocked_achievements.length}/{ACHIEVEMENTS_METADATA.length} Unlocked
              </span>
            </summary>

            <!-- Ledger stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] mt-3 pt-2.5 border-t border-(--line)">
              <div>
                <span class="text-(--muted) block">Tokens Today</span>
                <span class="font-mono font-semibold text-(--ink)">{careState.tokens_today.toLocaleString()}</span>
              </div>
              <div>
                <span class="text-(--muted) block">Meals Today</span>
                <span class="font-mono font-semibold text-(--ink)">{careState.meals_today}</span>
              </div>
              <div>
                <span class="text-(--muted) block">Lifetime Tokens</span>
                <span class="font-mono font-semibold text-(--ink)">{careState.total_tokens.toLocaleString()}</span>
              </div>
              <div>
                <span class="text-(--muted) block">Lifetime Meals</span>
                <span class="font-mono font-semibold text-(--ink)">{careState.total_meals}</span>
              </div>
            </div>

            <!-- Achievements grid -->
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-3 pt-2.5 border-t border-(--line)">
              {#each ACHIEVEMENTS_METADATA as ach}
                {@const isUnlocked = careState.unlocked_achievements.includes(ach.id)}
                {@const AchIcon = ach.icon}
                <div
                  class="p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 {isUnlocked
                    ? 'bg-(--surface) border-(--line) text-(--warning) shadow-xs'
                    : 'bg-(--paper) border-(--line) text-(--muted) opacity-40'}"
                  title="{ach.name}: {ach.description}"
                >
                  <AchIcon class="w-3.5 h-3.5 {isUnlocked ? 'text-(--warning)' : 'text-(--muted)'}" />
                  <span class="text-[9px] font-semibold truncate w-full block">
                    {ach.name}
                  </span>
                </div>
              {/each}
            </div>
          </details>
        </div>
      </div>

      <!-- Right Column (lg:col-span-5): Active Sessions & Recent Activity -->
      <div class="lg:col-span-5 flex flex-col gap-4">
        <!-- Active Sessions Quick Monitor -->
        <div class="panel p-4 sm:p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-(--line)">
            <div class="flex items-center gap-2">
              <Radio class="w-4 h-4 text-(--accent-text)" />
              <h4 class="text-xs font-bold text-(--ink) m-0">Connected Sessions</h4>
            </div>
            <button
              type="button"
              onclick={() => (activeViewTab = "socket")}
              class="text-[11px] text-(--accent-text) hover:underline"
            >
              Manage Hooks…
            </button>
          </div>

          {#if agentSessions.length === 0}
            <div class="text-center py-6 text-xs text-(--muted)">
              No active agent sessions. Start Pi, Claude, or Codex to stream events!
            </div>
          {:else}
            <div class="space-y-2">
              {#each agentSessions as session, idx (session.id)}
                {@const sessionPet = (void mappingRevision, getPetForSession(session, idx, selectedPet))}
                {@const projName = getProjectName(session.project)}
                <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-2.5 text-xs">
                  <div class="min-w-0 flex items-center gap-2.5 flex-1">
                    <img
                      src={sessionPet.avatarUrl}
                      alt={sessionPet.name}
                      class="w-7 h-7 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs"
                      title="{sessionPet.name} · {sessionPet.tagline}"
                    />
                    <div class="truncate min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="w-1.5 h-1.5 rounded-full {session.state === 'working' ? 'bg-emerald-400 animate-pulse' : session.state === 'waiting' ? 'bg-amber-400' : 'bg-slate-400'} shrink-0"></span>
                        <span class="font-bold text-(--ink) text-xs">{projName}</span>
                        <span class="badge text-[9px] px-1 py-0 uppercase">{session.agent_kind}</span>
                        <span class="text-[10px] text-(--accent-text) font-semibold ml-auto sm:ml-0">
                          {sessionPet.name}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-(--muted)">
                        <span class="capitalize">{session.state}</span>
                        {#if session.tool_name}
                          <span>•</span>
                          <span class="font-mono truncate">{session.tool_name}</span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <select
                      value={sessionPet.id}
                      onchange={(e) => {
                        const newId = e.currentTarget.value;
                        setSessionPetBinding(session.id, newId);
                        setProjectPetBinding(projName, newId);
                        toastState.info(`Assigned ${getPetArchetype(newId).name} to ${projName}`);
                      }}
                      class="field text-[10px] h-6 px-1.5 py-0 rounded max-w-28 text-(--muted) hover:text-(--ink)"
                      title="Assign companion to {projName}"
                    >
                      {#each getActivePets() as p}
                        <option value={p.id}>{p.name}</option>
                      {/each}
                    </select>

                    <button
                      type="button"
                      onclick={() => handleDismissSession(session.id)}
                      class="btn btn-ghost h-6 text-[10px] px-1.5 text-(--muted) hover:text-(--ink)"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Recent Activity Feed Preview -->
        <div class="panel p-4 sm:p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-(--line)">
            <div class="flex items-center gap-2">
              <Terminal class="w-4 h-4 text-(--success)" />
              <h4 class="text-xs font-bold text-(--ink) m-0">Recent Event Stream</h4>
            </div>
            <button
              type="button"
              onclick={() => (activeViewTab = "stream")}
              class="text-[11px] text-(--accent-text) hover:underline"
            >
              Full Stream…
            </button>
          </div>

          {#if events.length === 0}
            <div class="text-center py-6 text-xs text-(--muted)">
              No recent events logged yet.
            </div>
          {:else}
            <div class="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {#each events.slice(0, 6) as event (event.id)}
                <div class="p-2 rounded-lg bg-(--paper) border border-(--line) flex items-center justify-between gap-2 text-[11px]">
                  <div class="min-w-0 flex items-center gap-2">
                    <span class="badge text-[9px] px-1 py-0">{event.event}</span>
                    <span class="text-(--ink) truncate font-mono">{event.message}</span>
                  </div>
                  <span class="text-(--muted) text-[10px] font-mono shrink-0">{event.time}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Confirmation Modal for Progression Reset -->
  <Modal
    open={isResetModalOpen}
    onClose={() => (isResetModalOpen = false)}
    title="Reset Companion Stats?"
    description="Are you sure you want to reset all companion vitals, XP progression, and mood metrics back to initial defaults?"
    confirmText="Reset Progression"
    cancelText="Cancel"
    confirmVariant="destructive"
    onConfirm={handleConfirmReset}
  />
</div>
