<script lang="ts">
  import { navigateTo } from "@/lib/navigation";
  import { setDesktopPetVisible } from "@/lib/petVisibility";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import { petFormAura } from "@/shared/lib/petRenderer";
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
    getPetArchetype,
    getActivePets,
    resolvePetActiveForm,
  } from "@/lib/petMapping";
  import {
    readPetFormPreference,
    writePetFormPreference,
  } from "@/lib/petPreferences";
  import {
    Sparkles,
    Heart,
    Zap,
    Utensils,
    Moon,
    Flame,
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
    Eye,
    Layers,
    Lock,
    Play,
    Coffee,
    BookOpen,
    CheckCircle2,
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
  let previewPetSlug = $state<string | null>(null);
  const displayPet = $derived(previewPetSlug || selectedPet);
  const isPetPreviewing = $derived(previewPetSlug !== null && previewPetSlug !== selectedPet);
  const currentArchetype = $derived(getPetArchetype(displayPet));

  let formPref = $state<string>("auto");
  let previewFormId = $state<string | null>(null);
  let bindingRevision = $state<number>(0);
  $effect(() => {
    formPref = readPetFormPreference(displayPet);
    previewFormId = null;
  });
  const activeForm = $derived(
    resolvePetActiveForm(displayPet, careState?.display_level ?? 1, formPref)
  );
  const displayForm = $derived(
    previewFormId && currentArchetype.forms?.some((f) => f.id === previewFormId)
      ? currentArchetype.forms.find((f) => f.id === previewFormId) ?? activeForm
      : activeForm
  );
  const isFormPreviewing = $derived(
    previewFormId !== null && previewFormId !== activeForm?.id
  );
  const activeAura = $derived(petFormAura(displayPet, displayForm?.id));

  function equipPet(slug: string) {
    selectedPet = slug;
    previewPetSlug = null;
    previewFormId = null;
    try {
      localStorage.setItem("rust_sound_pet_slug", slug);
      window.dispatchEvent(new Event("storage"));
    } catch {}
    toastState.info(`Switched active companion to ${getPetArchetype(slug).name}`);
  }

  function cancelPetPreview() {
    previewPetSlug = null;
    previewFormId = null;
  }

  function equipForm(formId: string) {
    writePetFormPreference(displayPet, formId);
    formPref = formId;
    previewFormId = null;
    toastState.info(
      formId === "auto"
        ? "Tự động tiến hóa theo cấp độ"
        : `Đã khóa hình thái: ${currentArchetype.forms?.find((f) => f.id === formId)?.name || formId}`
    );
  }

  function cancelFormPreview() {
    previewFormId = null;
  }
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

    const onCloudSync = () => {
      invoke<PetCareStateDto>("get_pet_care_state").then((c) => {
        if (c) {
          careState = c;
          toastState.info("Đã đồng bộ cấp độ Pet từ tài khoản Google");
        }
      }).catch(() => {});
    };
    window.addEventListener("pet-cloud-synced", onCloudSync);
    return () => window.removeEventListener("pet-cloud-synced", onCloudSync);
  });

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

  const activeQuotes = $derived(SPEECH_QUOTES[displayPet] || SPEECH_QUOTES["code-frenzy-cat"]);
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

  // Interactive / Manual Action Preview
  let manualActionMood = $state<PetMood | null>(null);

  const currentMood = $derived<PetMood>(
    manualActionMood ??
    (isInteracting
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
      : "idle")
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
  <div class="flex items-center justify-between flex-wrap gap-2 shrink-0 pb-1">
    <div class="flex flex-wrap items-center gap-2 min-w-0">
      <!-- Evolution Stage Badge with Rank Hue text and styling -->
      <span
        class="badge text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5 {stageConfig.bg} {stageConfig.border} shadow-2xs"
      >
        <StageIcon class="w-3.5 h-3.5 {stageConfig.text}" />
        <span class={stageConfig.text}>Lv {careState.display_level} · {careState.stage_name}</span>
      </span>

      <!-- Compact IPC Status Pill -->
      <div
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-(--surface) border border-(--line) text-[11px] text-(--ink) shadow-2xs"
        title="IPC Socket Active (/tmp/rust-sound-agent-pet.sock)"
      >
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span class="font-medium text-emerald-400">IPC Connected</span>
      </div>

      {#if careState.streak_days > 0}
        <span class="badge badge-ok text-[11px] px-2.5 py-1 font-semibold flex items-center gap-1 shadow-2xs">
          <Flame class="w-3.5 h-3.5 text-(--warning)" />
          <span>{careState.streak_days} Day Streak</span>
        </span>
      {/if}
    </div>

    <!-- Quick Actions in Header -->
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        onclick={handleToggleDesktopOverlay}
        class="btn h-7 text-xs px-2.5 border border-(--line) flex items-center gap-1.5 transition-colors {showDesktopOverlay ? 'bg-(--accent)/15 border-(--accent)/30 text-(--accent-text)' : 'btn-ghost'}"
        title="Toggle Desktop Floating Pet Window"
      >
        <Laptop class="w-3.5 h-3.5 {showDesktopOverlay ? 'text-(--accent-text)' : 'text-(--muted)'}" />
        <span>{showDesktopOverlay ? "Desktop Pet Active" : "Launch Desktop Pet"}</span>
      </button>

      <button
        type="button"
        onclick={handleSimulatePing}
        class="btn btn-ghost h-7 text-xs text-(--accent-text) border border-(--line) px-2.5 flex items-center gap-1.5 hover:bg-(--surface)"
        title="Send simulation test pulse"
      >
        <Send class="w-3 h-3 text-(--accent-text)" />
        <span class="hidden md:inline">Pulse</span>
      </button>

      <button
        type="button"
        onclick={() => navigateTo("pet-settings")}
        class="btn btn-ghost h-7 text-xs px-2.5 border border-(--line) flex items-center gap-1.5 text-(--muted) hover:text-(--ink)"
        title="AgentPet Configuration"
      >
        <Settings class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Settings</span>
      </button>

      <button
        type="button"
        onclick={() => (isResetModalOpen = true)}
        class="btn btn-ghost h-7 text-xs text-(--muted) hover:text-rose-400 hover:border-rose-500/30 border border-(--line) px-2"
        title="Reset companion stats"
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>

  <!-- Companion Quick-Switch Avatar Strip -->
  <div class="panel p-2 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-xs">
    <div class="flex items-center gap-1.5 shrink-0 pl-1 pr-2 border-r border-(--line)/60">
      <Bot class="w-4 h-4 text-(--accent-text)" />
      <span class="text-[11px] font-bold text-(--ink)">Roster</span>
      <span class="text-[9px] font-mono px-1 py-0 rounded bg-(--surface) border border-(--line) text-(--muted)">
        {getActivePets().length}
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#each getActivePets() as pet}
        {@const isCurrent = displayPet === pet.id}
        {@const isEquipped = selectedPet === pet.id}
        <button
          type="button"
          onclick={() => equipPet(pet.id)}
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer group text-left {isCurrent
            ? 'bg-(--accent)/15 border-(--accent) text-(--ink) ring-1 ring-(--accent)/40 shadow-xs'
            : 'bg-(--surface)/40 border-(--line)/70 text-(--muted) hover:text-(--ink) hover:bg-(--surface)/80 hover:border-(--focus)'}"
          title="{pet.name} ({pet.tag})"
        >
          <div class="relative w-7 h-7 rounded-lg overflow-hidden border border-(--line) bg-(--paper) shrink-0 group-hover:scale-105 transition-transform">
            <img src={pet.avatarUrl} alt={pet.name} class="w-full h-full object-cover" />
            {#if isEquipped}
              <span class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-(--paper)"></span>
            {/if}
          </div>
          <div class="min-w-0 pr-1">
            <div class="text-[11px] font-bold truncate max-w-28 leading-tight">{pet.name}</div>
            <div class="text-[9px] text-(--muted) truncate max-w-28 capitalize">{pet.tag || "Companion"}</div>
          </div>
        </button>
      {/each}
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
      onclick={() => (activeViewTab = "gallery")}
      class="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 {activeViewTab === 'gallery'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Layers class="w-3.5 h-3.5 text-(--accent-text)" />
      Companion Roster
      <span class="text-[9px] px-1.5 py-0 rounded bg-(--surface) border border-(--line) text-(--muted) font-mono">
        {getActivePets().length}
      </span>
    </button>
    <button
      type="button"
      onclick={() => (activeViewTab = "animations")}
      class="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 {activeViewTab === 'animations'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Sparkles class="w-3.5 h-3.5 text-(--warning)" />
      Animation Studio
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
      previewPet={previewPetSlug}
      onPreviewPet={(slug) => {
        previewPetSlug = slug;
        previewFormId = null;
        activeViewTab = "cockpit";
        toastState.info(`Previewing ${getPetArchetype(slug).name} in Cockpit`);
      }}
      {careState}
      onSelectPet={(slug) => {
        equipPet(slug);
        activeViewTab = "cockpit";
      }}
    />

  <!-- TAB: ANIMATIONS BINDING INSPECTOR -->
  {:else if activeViewTab === "animations"}
    <PetAnimationPicker
      slug={displayPet}
      formSpritesheetPath={displayForm?.spritesheetPath}
      formAura={activeAura}
      onBindingChange={(state, clipIdx) => {
        bindingRevision += 1;
        toastState.info(`Bound ${state} to Clip ${clipIdx + 1} for ${displayPet}`);
      }}
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

  <!-- MAIN COMPANION VIEW -->
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <!-- Left Column: Sprite + Vitals -->
      <div class="lg:col-span-7 flex flex-col gap-3">
        <!-- Compact Companion Stage Card (Unified Hero + Vitals + Actions) -->
        <div class="panel p-4 relative overflow-hidden flex flex-col gap-3.5">
          <!-- Ambient Aura backdrop -->
          <div
            class="absolute inset-0 rounded-3xl blur-3xl pointer-events-none transition-all duration-700 {activeAura
              ? 'opacity-25'
              : 'opacity-15 bg-rose-500/10'}"
            style={activeAura
              ? `background: radial-gradient(closest-side, ${activeAura.inner}66, ${activeAura.outer ?? activeAura.inner}33 60%, transparent);`
              : undefined}
          ></div>

          <!-- Top bar: Character selector + streak -->
          <div class="flex items-center justify-between gap-2 relative z-10">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="relative shrink-0">
                <img
                  src={currentArchetype.avatarUrl}
                  alt={currentArchetype.name}
                  class="w-8 h-8 rounded-full border border-(--line) object-cover bg-(--surface) shadow-2xs"
                />
                <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-(--paper) {currentMood === 'working' ? 'bg-emerald-400' : currentMood === 'waiting' ? 'bg-amber-400' : 'bg-rose-400'}"></span>
              </div>
              <div class="flex flex-col min-w-0">
                <select
                  value={displayPet}
                  onchange={(e) => equipPet(e.currentTarget.value)}
                  class="field text-xs font-semibold h-7 rounded-lg max-w-56 bg-transparent hover:bg-(--surface)/50 transition-colors cursor-pointer border-(--line)/60"
                >
                  {#each getActivePets() as pet}
                    <option value={pet.id}>{pet.name} ({pet.tag})</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if careState.streak_days > 0}
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-(--surface) border border-(--line) text-(--warning) text-[11px] font-semibold shadow-2xs shrink-0">
                <Flame class="w-3.5 h-3.5" />
                <span>{careState.streak_days} Day Streak</span>
              </div>
            {/if}
          </div>

          <!-- Preview banner if hovering/previewing pet -->
          {#if isPetPreviewing}
            <div class="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-(--accent)/15 border border-(--accent)/30 text-xs relative z-10 shadow-xs">
              <div class="flex items-center gap-1.5 min-w-0">
                <Eye class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
                <span class="font-bold text-(--ink) truncate">Previewing: {currentArchetype.name}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick={() => equipPet(displayPet)}
                  class="btn btn-primary h-6 px-2.5 text-[10px] font-semibold cursor-pointer flex items-center gap-1 shadow-2xs">
                  <Check class="w-3 h-3" />Equip
                </button>
                <button type="button" onclick={cancelPetPreview}
                  class="btn btn-ghost h-6 px-2 text-[10px] border border-(--line) cursor-pointer">Cancel</button>
              </div>
            </div>
          {/if}

          <!-- Sprite + Speech + XP & Vitals -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center relative z-10">
            <!-- Left: Interactive Sprite & State Badge -->
            <div class="md:col-span-5 flex flex-col items-center justify-center p-2 rounded-2xl bg-(--surface)/40 border border-(--line)/40">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                onclick={handlePetAction}
                class="relative flex flex-col items-center shrink-0 cursor-pointer transition-transform duration-200 {isInteracting ? 'scale-105' : 'hover:scale-102'}"
                title="Click to interact!"
              >
                <AgentPetSprite
                  slug={displayPet}
                  formId={displayForm?.id}
                  spritesheetPath={displayForm?.spritesheetPath}
                  mood={currentMood}
                  size={132}
                  revision={bindingRevision}
                />
              </div>

              <div class="mt-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-(--paper) border border-(--line) text-(--ink) shadow-2xs">
                <span class="w-1.5 h-1.5 rounded-full {currentMood === 'working' ? 'bg-emerald-400 animate-pulse' : currentMood === 'waiting' ? 'bg-amber-400' : 'bg-rose-400'}"></span>
                <span>
                  {#if isInteracting}
                    {interactionAction === "purring" ? "Purring happily" : interactionAction === "sleep" ? "Resting" : "Eating snack"}
                  {:else if topActiveSession}
                    {topActiveSession.agent_kind.toUpperCase()} ({topActiveSession.state})
                  {:else}
                    Listening on CoreAudio
                  {/if}
                </span>
              </div>
            </div>

            <!-- Right: Speech, Level Progress, Sleek Vitals -->
            <div class="md:col-span-7 flex flex-col gap-2.5 min-w-0">
              <!-- Speech bubble (Glass Card style) -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                onclick={() => (currentQuoteIndex = (currentQuoteIndex + 1) % activeQuotes.length)}
                class="p-2.5 rounded-xl bg-(--surface)/70 border border-(--line) hover:border-(--focus) transition-all cursor-pointer group shadow-2xs"
                title="Click for next thought"
              >
                <p class="text-[11px] font-medium text-(--ink) m-0 group-hover:text-(--accent-text) transition-colors line-clamp-2 leading-relaxed">
                  <Sparkles class="w-3.5 h-3.5 text-(--accent-text) inline mr-1 align-[-2px]" />"{liveBubbleMessage}"
                </p>
              </div>

              <!-- XP & Stage Progress -->
              <div class="p-2.5 rounded-xl bg-(--surface)/50 border border-(--line) space-y-1.5">
                <div class="flex items-center justify-between text-[11px]">
                  <div class="flex items-center gap-1.5">
                    <StageIcon class="w-3.5 h-3.5 {stageConfig.text}" />
                    <span class="font-bold text-(--ink)">Lv {careState.display_level}</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold border {stageConfig.bg} {stageConfig.border} {stageConfig.text}">{careState.stage_name}</span>
                  </div>
                  <span class="text-[10px] font-mono font-semibold text-(--accent-text) tabular-nums">
                    {inLevelXP.toLocaleString()} / {spanXP.toLocaleString()} XP
                  </span>
                </div>
                <div class="w-full h-1.5 bg-(--paper) rounded-full overflow-hidden border border-(--line)/40">
                  <div
                    class="h-full bg-linear-to-r from-rose-500 via-pink-400 to-(--accent) rounded-full transition-all duration-300"
                    style="width: {progressPercent}%;"
                  ></div>
                </div>
              </div>

              <!-- 4 Sleek Vitals (Progress Indicators) -->
              <div class="grid grid-cols-2 gap-2">
                <!-- Energy -->
                <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line) space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-(--muted) flex items-center gap-1 font-medium">
                      <Zap class="w-3 h-3 text-(--warning)" />Energy
                    </span>
                    <span class="font-mono font-bold text-(--ink) tabular-nums">{petEnergy}%</span>
                  </div>
                  <div class="w-full h-1 bg-(--paper) rounded-full overflow-hidden">
                    <div class="h-full bg-amber-400 rounded-full transition-all duration-300" style="width: {petEnergy}%;"></div>
                  </div>
                </div>

                <!-- Mood -->
                <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line) space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-(--muted) flex items-center gap-1 font-medium">
                      <Heart class="w-3 h-3 text-rose-400" />Mood
                    </span>
                    <span class="font-mono font-bold text-(--ink) tabular-nums">{petMood}%</span>
                  </div>
                  <div class="w-full h-1 bg-(--paper) rounded-full overflow-hidden">
                    <div class="h-full bg-rose-400 rounded-full transition-all duration-300" style="width: {petMood}%;"></div>
                  </div>
                </div>

                <!-- Focus -->
                <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line) space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-(--muted) flex items-center gap-1 font-medium">
                      <Activity class="w-3 h-3 text-cyan-400" />Focus
                    </span>
                    <span class="font-mono font-bold text-(--ink) tabular-nums">{petFocus}%</span>
                  </div>
                  <div class="w-full h-1 bg-(--paper) rounded-full overflow-hidden">
                    <div class="h-full bg-cyan-400 rounded-full transition-all duration-300" style="width: {petFocus}%;"></div>
                  </div>
                </div>

                <!-- Hunger -->
                <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line) space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-(--muted) flex items-center gap-1 font-medium">
                      <Fish class="w-3 h-3 text-emerald-400" />Hunger
                    </span>
                    <span class="font-mono font-bold text-emerald-400 capitalize">{careState.hunger}</span>
                  </div>
                  <div class="w-full h-1 bg-(--paper) rounded-full overflow-hidden">
                    <div
                      class="h-full bg-emerald-400 rounded-full transition-all duration-300"
                      style="width: {careState.hunger === 'full' ? 100 : careState.hunger === 'peckish' ? 50 : 20}%;"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Action States Interactive Controller -->
          <div class="p-2.5 rounded-2xl bg-(--surface)/50 border border-(--line) relative z-10 flex flex-col gap-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-(--ink) flex items-center gap-1.5">
                <Play class="w-3.5 h-3.5 text-emerald-400" />
                <span>Simulate Actions & Moods</span>
              </span>
              {#if manualActionMood}
                <button
                  type="button"
                  onclick={() => manualActionMood = null}
                  class="text-[10px] text-(--accent-text) hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw class="w-2.5 h-2.5" />
                  <span>Resume Live AI Session</span>
                </button>
              {:else}
                <span class="text-[10px] text-(--muted) flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live AI Sync
                </span>
              {/if}
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onclick={() => manualActionMood = manualActionMood === "working" ? null : "working"}
                class="px-2 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-all {currentMood === "working" && manualActionMood === "working"
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 ring-1 ring-emerald-500/40 shadow-xs"
                  : "bg-(--paper) border-(--line)/70 text-(--muted) hover:text-(--ink) hover:bg-(--surface)"}"
                title="Working: Typing code / executing terminal tool"
              >
                <Terminal class="w-3.5 h-3.5 text-emerald-400" />
                <span>Working</span>
              </button>

              <button
                type="button"
                onclick={() => manualActionMood = manualActionMood === "reading" ? null : "reading"}
                class="px-2 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-all {currentMood === "reading" && manualActionMood === "reading"
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 ring-1 ring-cyan-500/40 shadow-xs"
                  : "bg-(--paper) border-(--line)/70 text-(--muted) hover:text-(--ink) hover:bg-(--surface)"}"
                title="Reading: Reviewing diff or reading documentation"
              >
                <BookOpen class="w-3.5 h-3.5 text-cyan-400" />
                <span>Reading</span>
              </button>

              <button
                type="button"
                onclick={() => manualActionMood = manualActionMood === "waiting" ? null : "waiting"}
                class="px-2 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-all {currentMood === "waiting" && manualActionMood === "waiting"
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400 ring-1 ring-amber-500/40 shadow-xs"
                  : "bg-(--paper) border-(--line)/70 text-(--muted) hover:text-(--ink) hover:bg-(--surface)"}"
                title="Waiting: Waiting for user prompt or approval"
              >
                <Coffee class="w-3.5 h-3.5 text-amber-400" />
                <span>Waiting</span>
              </button>

              <button
                type="button"
                onclick={() => manualActionMood = manualActionMood === "done" ? null : "done"}
                class="px-2 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-all {currentMood === "done" && manualActionMood === "done"
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-400 ring-1 ring-purple-500/40 shadow-xs"
                  : "bg-(--paper) border-(--line)/70 text-(--muted) hover:text-(--ink) hover:bg-(--surface)"}"
                title="Done: Finished prompt or task successfully"
              >
                <CheckCircle2 class="w-3.5 h-3.5 text-purple-400" />
                <span>Done</span>
              </button>
            </div>
          </div>

          <!-- Quick Action Bar -->
          <div class="flex items-center justify-center gap-2 pt-2 border-t border-(--line)/60 relative z-10 flex-wrap">
            <button
              type="button"
              onclick={handlePetAction}
              class="btn btn-primary h-7.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Pet (+15 XP)"
            >
              <Sparkles class="w-3.5 h-3.5" />
              <span>Pet</span>
            </button>
            <button
              type="button"
              onclick={handleFeedAction}
              class="btn h-7.5 px-3 text-xs font-semibold border border-(--line) flex items-center gap-1.5 hover:bg-(--surface) cursor-pointer"
              title="Feed (+20 XP)"
            >
              <Utensils class="w-3.5 h-3.5 text-emerald-400" />
              <span>Feed</span>
            </button>
            <button
              type="button"
              onclick={handleSleepAction}
              class="btn btn-ghost h-7.5 px-3 text-xs font-semibold border border-(--line) flex items-center gap-1.5 hover:bg-(--surface) cursor-pointer"
              title="Rest (+10 XP)"
            >
              <Moon class="w-3.5 h-3.5 text-(--accent-text)" />
              <span>Rest</span>
            </button>
            <button
              type="button"
              onclick={handleCelebrateAction}
              class="btn h-7.5 px-3 text-xs font-semibold border border-(--line) flex items-center gap-1.5 hover:bg-(--surface) cursor-pointer"
              title="Celebrate (+25 XP)"
            >
              <PartyPopper class="w-3.5 h-3.5 text-amber-400" />
              <span>Celebrate</span>
            </button>
          </div>
        </div>

        <!-- Forms & Evolution Strip (Integrated) -->
        {#if currentArchetype.forms && currentArchetype.forms.length > 0}
          <div class="panel p-3 space-y-2">
            <div class="flex items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-bold text-(--ink) flex items-center gap-1.5">
                  <Layers class="w-3.5 h-3.5 text-(--accent-text)" />
                  <span>Evolution Forms</span>
                </span>
                {#if isFormPreviewing}
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-(--accent)/15 text-(--accent-text) border border-(--accent)/30 flex items-center gap-1">
                    <Eye class="w-2.5 h-2.5" />Preview: {displayForm?.name ?? "Custom"}
                  </span>
                  {#if (careState?.display_level ?? 1) < (displayForm?.minLevel ?? 1)}
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-400/15 text-amber-400 border border-amber-400/30 flex items-center gap-0.5">
                      <Lock class="w-2.5 h-2.5" />Lv {displayForm?.minLevel}
                    </span>
                  {/if}
                {:else}
                  <span class="text-[11px] text-(--muted) truncate">
                    {formPref === "auto" ? `Auto (Unlocked at Lv ${careState?.display_level ?? 1})` : `Locked: ${activeForm?.name || "Default"}`}
                  </span>
                {/if}
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                {#if isFormPreviewing}
                  <button type="button" onclick={() => { if (displayForm) equipForm(displayForm.id); }}
                    class="btn btn-primary h-6.5 px-2.5 text-[10px] font-semibold flex items-center gap-1 cursor-pointer shadow-2xs">
                    <Check class="w-3 h-3" />Equip
                  </button>
                  <button type="button" onclick={cancelFormPreview}
                    class="btn btn-ghost h-6.5 px-2 text-[10px] border border-(--line) cursor-pointer">Cancel</button>
                {:else if formPref !== "auto"}
                  <button type="button" onclick={() => equipForm("auto")}
                    class="btn btn-ghost h-6.5 px-2 text-[10px] font-semibold border border-(--line) text-(--warning) flex items-center gap-1 cursor-pointer">
                    <Zap class="w-2.5 h-2.5" />Reset to Auto
                  </button>
                {/if}
              </div>
            </div>

            <!-- Horizontal forms slider -->
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onclick={() => equipForm("auto")}
                class="h-9 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer transition-all {formPref === 'auto' && !isFormPreviewing
                  ? 'bg-(--accent)/15 border-(--accent) text-(--accent-text) ring-1 ring-(--accent)/40 shadow-xs'
                  : 'bg-(--surface)/50 border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
                title="Auto Evolution (Current: Lv {careState?.display_level ?? 1})"
              >
                <Zap class="w-3.5 h-3.5 {formPref === 'auto' && !isFormPreviewing ? 'text-(--accent-text)' : 'text-(--warning)'}" />
                <span class="font-bold">Auto</span>
              </button>

              {#each currentArchetype.forms as f (f.id)}
                {@const isUnlocked = (careState?.display_level ?? 1) >= f.minLevel}
                {@const isPreview = previewFormId === f.id}
                {@const isActive = activeForm?.id === f.id && !isFormPreviewing}

                <button
                  type="button"
                  onclick={() => { if (previewFormId === f.id) { equipForm(f.id); } else { previewFormId = f.id; } }}
                  class="h-9 px-2 rounded-xl border flex items-center gap-2 shrink-0 cursor-pointer transition-all {isPreview
                    ? 'bg-(--accent)/20 border-(--accent) text-(--accent-text) ring-1 ring-(--accent)/50 shadow-xs'
                    : isActive
                    ? 'bg-(--surface) border-(--accent)/40 text-(--ink) ring-1 ring-(--line) shadow-2xs'
                    : 'bg-(--surface)/40 border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
                  title="{f.name} (Requires Lv {f.minLevel})"
                >
                  <div class="w-6 h-6 rounded-lg bg-(--paper) border border-(--line) overflow-hidden flex items-center justify-center shrink-0">
                    <img src={f.avatarUrl} alt={f.name} class="w-full h-full object-contain" />
                  </div>
                  <span class="text-[11px] font-semibold leading-tight truncate max-w-28">{f.name}</span>
                  {#if !isUnlocked}
                    <Lock class="w-3 h-3 text-(--warning) shrink-0" />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
        <!-- Achievements & Lifetime Ledger (Compact Card) -->
        <details class="panel p-3 text-xs group">
          <summary class="font-bold text-(--ink) flex items-center justify-between cursor-pointer select-none">
            <div class="flex items-center gap-2">
              <Trophy class="w-3.5 h-3.5 text-amber-400" />
              <span>Achievements & Care Ledger</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-(--surface) border border-(--line) text-(--ink) font-semibold">
                {careState.unlocked_achievements.length}/{ACHIEVEMENTS_METADATA.length} Unlocked
              </span>
            </div>
          </summary>

          <!-- Telemetry counters row -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-(--line)/60">
            <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line)/60">
              <span class="text-[10px] text-(--muted) block font-medium">Tokens Today</span>
              <span class="font-mono text-xs font-bold text-(--ink)">{careState.tokens_today.toLocaleString()}</span>
            </div>
            <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line)/60">
              <span class="text-[10px] text-(--muted) block font-medium">Meals Today</span>
              <span class="font-mono text-xs font-bold text-emerald-400">{careState.meals_today}</span>
            </div>
            <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line)/60">
              <span class="text-[10px] text-(--muted) block font-medium">Lifetime Tokens</span>
              <span class="font-mono text-xs font-bold text-(--ink)">{careState.total_tokens.toLocaleString()}</span>
            </div>
            <div class="p-2 rounded-xl bg-(--surface)/40 border border-(--line)/60">
              <span class="text-[10px] text-(--muted) block font-medium">Lifetime Meals</span>
              <span class="font-mono text-xs font-bold text-emerald-400">{careState.total_meals}</span>
            </div>
          </div>

          <!-- Badges grid -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-2.5 pt-2.5 border-t border-(--line)/60">
            {#each ACHIEVEMENTS_METADATA as ach}
              {@const isUnlocked = careState.unlocked_achievements.includes(ach.id)}
              {@const AchIcon = ach.icon}
              <div
                class="p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition-all {isUnlocked
                  ? 'bg-(--surface)/60 border-amber-400/30 text-amber-400 shadow-2xs'
                  : 'bg-(--surface)/20 border-(--line)/40 text-(--muted) opacity-40'}"
                title="{ach.name}: {ach.description}"
              >
                <AchIcon class="w-4 h-4 {isUnlocked ? 'text-amber-400' : 'text-(--muted)'}" />
                <span class="text-[9px] font-semibold truncate w-full block leading-tight">{ach.name}</span>
              </div>
            {/each}
          </div>
        </details>
      </div>

      <!-- Right Column: Sessions + Events -->
      <div class="lg:col-span-5 flex flex-col gap-3">
        <!-- Connected Sessions (Telemetry Card) -->
        <div class="panel p-3.5 space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h4 class="text-xs font-bold text-(--ink) m-0">Connected Sessions</h4>
              <span class="text-[10px] font-mono px-1.5 py-0 rounded bg-(--surface) border border-(--line) text-(--muted)">
                {agentSessions.length}
              </span>
            </div>
            <button
              type="button"
              onclick={() => (activeViewTab = "socket")}
              class="text-[10px] text-(--accent-text) hover:underline cursor-pointer"
            >
              Manage Hooks…
            </button>
          </div>

          {#if agentSessions.length === 0}
            <div class="text-center py-4 text-xs text-(--muted) bg-(--surface)/30 rounded-xl border border-dashed border-(--line)/60">
              No active sessions. Start Pi, Claude, or Codex to stream events!
            </div>
          {:else}
            <div class="space-y-1.5">
              {#each agentSessions as session, idx (session.id)}
                {@const sessionPet = (void mappingRevision, getPetForSession(session, idx, selectedPet))}
                {@const projName = getProjectName(session.project)}
                <div class="p-2.5 rounded-xl bg-(--surface)/50 border border-(--line) flex items-center justify-between gap-2.5 text-xs hover:border-(--focus) transition-colors group">
                  <div class="min-w-0 flex items-center gap-2.5 flex-1">
                    <img
                      src={sessionPet.avatarUrl}
                      alt={sessionPet.name}
                      class="w-7 h-7 rounded-lg border border-(--line) object-cover bg-(--paper) shrink-0 shadow-2xs"
                    />
                    <div class="truncate min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="w-1.5 h-1.5 rounded-full {session.state === 'working' ? 'bg-emerald-400 animate-pulse' : session.state === 'waiting' ? 'bg-amber-400' : 'bg-slate-400'} shrink-0"></span>
                        <span class="font-bold text-(--ink) truncate">{projName}</span>
                        <span class="badge text-[9px] px-1.5 py-0 font-mono uppercase tracking-wider">{session.agent_kind}</span>
                      </div>
                      <div class="flex items-center gap-1.5 text-[10px] text-(--muted) mt-0.5">
                        <span class="capitalize text-(--ink)/80 font-medium">{session.state}</span>
                        {#if session.tool_name}
                          <span>·</span>
                          <span class="font-mono truncate max-w-36 text-(--accent-text)">{session.tool_name}</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onclick={() => handleDismissSession(session.id)}
                    class="btn btn-ghost h-6 text-[10px] px-2 text-(--muted) hover:text-rose-400 hover:bg-rose-500/10 rounded-lg cursor-pointer transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Recent Event Stream (Telemetry Card) -->
        <div class="panel p-3.5 space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Terminal class="w-3.5 h-3.5 text-emerald-400" />
              <h4 class="text-xs font-bold text-(--ink) m-0">Recent Events</h4>
              <span class="text-[10px] font-mono px-1.5 py-0 rounded bg-(--surface) border border-(--line) text-(--muted)">
                {events.length}
              </span>
            </div>
            <button
              type="button"
              onclick={() => (activeViewTab = "stream")}
              class="text-[10px] text-(--accent-text) hover:underline cursor-pointer"
            >
              Full Stream…
            </button>
          </div>

          {#if events.length === 0}
            <div class="text-center py-4 text-xs text-(--muted) bg-(--surface)/30 rounded-xl border border-dashed border-(--line)/60">
              No events logged yet.
            </div>
          {:else}
            <div class="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar">
              {#each events.slice(0, 8) as event (event.id)}
                {@const isMilestone = event.event === 'milestone' || event.event === 'mood_boost'}
                <div class="px-2.5 py-2 rounded-xl bg-(--surface)/40 border border-(--line)/70 flex items-center justify-between gap-2.5 text-[11px] hover:bg-(--surface)/70 transition-colors">
                  <div class="min-w-0 flex items-center gap-2 flex-1">
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold shrink-0 {isMilestone ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'bg-(--paper) text-(--muted) border border-(--line)'}">
                      {event.event}
                    </span>
                    <span class="text-(--ink) truncate font-mono text-[10px] leading-tight">{event.message}</span>
                  </div>
                  <span class="text-(--muted) text-[9px] font-mono shrink-0 tabular-nums">{event.time}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <!-- Lifetime XP footer -->
        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-(--paper) border border-(--line) text-[10px] text-(--muted)">
          <span class="flex items-center gap-1">
            <Sparkles class="w-3 h-3 text-(--accent-text)" />
            Lifetime XP: <span class="font-mono font-semibold text-(--ink)">{careState.xp.toLocaleString()}</span>
          </span>
          <span class="font-medium {stageConfig.text}">
            ≈ {tokensToNext.toLocaleString()} tokens to Lv {careState.display_level + 1}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <Modal
    open={isResetModalOpen}
    onClose={() => (isResetModalOpen = false)}
    title="Reset Companion Stats?"
    description="Reset all companion vitals, XP, and mood to defaults?"
    confirmText="Reset"
    cancelText="Cancel"
    confirmVariant="destructive"
    onConfirm={handleConfirmReset}
  />
</div>
