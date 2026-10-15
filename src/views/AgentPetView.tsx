import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  ButtonComponent,
  BadgeComponent,
  SelectComponent,
  ModalComponent,
  useToast,
} from "@/shared/ui";
import {
  Sparkles,
  Activity,
  Heart,
  Zap,
  Coffee,
  CheckCircle2,
  Fish,
  Flame,
  Award,
  Radio,
  Volume2,
  Moon,
  Laptop,
  RotateCcw,
  Send,
  Eye,
  Terminal,
  FolderGit2,
  Plug,
  Trash2,
  Bot,
  Leaf,
  PawPrint,
  Compass,
  Shield,
  Crown,
  Trophy,
  Utensils,
  Check,
  Code2,
  MousePointer2,
  Cpu,
} from "lucide-react";
import { AgentPetSprite } from "@/components/AgentPetSprite";
import { cn } from "@/lib/utils";

interface PetEvent {
  id: string;
  category: "coding" | "audio" | "vitals" | "system";
  source: string;
  event: string;
  message: string;
  time: string;
}

export interface PetCareStateDto {
  xp: number;
  level: number;
  display_level: number;
  progress: number;
  stage_name: string;
  stage_index: number;
  hunger: string;
  tokens_today: number;
  meals_today: number;
  total_tokens: number;
  total_meals: number;
  streak_days: number;
  unlocked_achievements: string[];
}

export interface AgentSessionDto {
  id: string;
  agent_kind: string;
  state: "registered" | "working" | "waiting" | "done" | "idle";
  project?: string | null;
  message?: string | null;
  model?: string | null;
  tool_name?: string | null;
  tool_summary?: string | null;
  started_at: number;
  last_event_at: number;
}

export interface AgentIntegrationDto {
  kind: string;
  display_name: string;
  is_supported: boolean;
  is_installed: boolean;
  note?: string | null;
}

export interface PetArchetype {
  id: string;
  name: string;
  tag: string;
  description: string;
}

export const INSTALLED_PETS: PetArchetype[] = [
  {
    id: "code-frenzy-cat",
    name: "Code Frenzy Cat",
    tag: "Creature",
    description: "Animated cat frantically typing code on a neon laptop in Codex.",
  },
  {
    id: "boba",
    name: "Boba Otter",
    tag: "Creature",
    description: "Tiny otter sipping bubble tea while keeping you company.",
  },
  {
    id: "shinchan-3",
    name: "Shinchan 3",
    tag: "Character",
    description: "Action Hero Crayon Shin-chan checking every line of code.",
  },
  {
    id: "work-blue-cat",
    name: "Cyber Coding Cat",
    tag: "Creature",
    description: "Adult blue cat in striped green hoodie typing at high speed.",
  },
  {
    id: "super-saiyan-goku",
    name: "Super Saiyan Goku",
    tag: "Character",
    description: "Super Saiyan martial artist with golden hair and teal eyes.",
  },
  {
    id: "wode-daodun-3d",
    name: "Sword & Shield Guardian",
    tag: "Creature",
    description: "Goofy guardian with code sword and defensive tech shield.",
  },
  {
    id: "eddy",
    name: "Eddy Educator Bear",
    tag: "Creature",
    description: "Calm educator yellow bear in round glasses and green hoodie.",
  },
];

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
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-[var(--success)]",
  },
  Companion: {
    icon: PawPrint,
    color: "#14b8a6",
    bg: "bg-teal-500/15",
    border: "border-teal-500/30",
    text: "text-teal-400",
  },
  Scout: {
    icon: Compass,
    color: "#fb7185",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    text: "text-[var(--accent-text)]",
  },
  Hero: {
    icon: Shield,
    color: "#a855f7",
    bg: "bg-purple-500/15",
    border: "border-purple-500/30",
    text: "text-[var(--accent-text)]",
  },
  Legend: {
    icon: Crown,
    color: "#f59e0b",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-[var(--warning)]",
  },
};

export const ACHIEVEMENTS_METADATA = [
  { id: "firstMeal", name: "First Meal", description: "1st finished session", icon: Utensils },
  { id: "sessions100", name: "100 Sessions", description: "Completed 100 sessions", icon: Trophy },
  { id: "sessions500", name: "500 Sessions", description: "Completed 500 sessions", icon: Crown },
  { id: "tokens1M", name: "1M Tokens", description: "Consumed 1,000,000 tokens", icon: Zap },
  { id: "tokens10M", name: "10M Tokens", description: "Consumed 10,000,000 tokens", icon: Flame },
  { id: "level5", name: "Companion", description: "Evolution Stage 2", icon: PawPrint },
  { id: "level10", name: "Scout", description: "Evolution Stage 3", icon: Compass },
  { id: "level20", name: "Hero", description: "Evolution Stage 4", icon: Shield },
  { id: "streak7", name: "7-Day Streak", description: "7 consecutive days active", icon: Flame },
  { id: "streak30", name: "30-Day Streak", description: "30 consecutive days active", icon: Award },
];

export function xpToReach(level: number): number {
  return level <= 1 ? 0 : 60 * level * (level - 1);
}

export function getInternalLevel(xp: number): number {
  let level = 1;
  while (xpToReach(level + 1) <= xp) {
    level++;
  }
  return level;
}

const INITIAL_EVENTS: PetEvent[] = [
  {
    id: "1",
    category: "coding",
    source: "pi:coding-agent",
    event: "working",
    message: "Refactoring UI component architecture to Tailwind v4 & custom primitives",
    time: "10:52 AM",
  },
  {
    id: "2",
    category: "vitals",
    source: "agentpet.sock",
    event: "mood_boost",
    message: "Companion gained +15 Focus from clean cargo test pass",
    time: "10:50 AM",
  },
  {
    id: "3",
    category: "audio",
    source: "rust-sound",
    event: "registered",
    message: "Desktop audio mixer session connected to AgentPet IPC bridge",
    time: "10:45 AM",
  },
  {
    id: "4",
    category: "coding",
    source: "git:commit",
    event: "milestone",
    message: "Committed CoreAudio audio tap bindings (+50 XP)",
    time: "10:30 AM",
  },
  {
    id: "5",
    category: "audio",
    source: "audio:router",
    event: "auto_duck",
    message: "Background audio ducked to 15% during high-focus coding interval",
    time: "10:15 AM",
  },
];

const SPEECH_QUOTES: Record<string, string[]> = {
  "code-frenzy-cat": [
    "Clacking away on these Rust traits! Purrrfect execution!",
    "Zero compiler warnings, maximum runtime efficiency!",
    "Remember to hydrate and stretch between compiler passes!",
    "Brewing an espresso to optimize this audio DSP loop.",
    "Tail is synchronizing to the rhythm of your music stream!",
  ],
  boba: [
    "Sipping iced tea while reviewing your pull request diff.",
    "Clean architecture detected! High readability score.",
    "Focus level is at 100%, ready for the next coding milestone.",
  ],
  "shinchan-3": [
    "Checking every semicolon in the workspace!",
    "Hero mode activated: Let's ship this audio hub update!",
    "Energy is high, keeping the studio console active.",
  ],
  "work-blue-cat": [
    "Cyber-link established. 10-band DSP parametric EQ aligned.",
    "Neon buffer synchronized with active stream routing.",
    "Focus aura at maximum throughput.",
  ],
};

export const AgentPetView: FC = () => {
  const { showToast } = useToast();
  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  // Live Tamagotchi State from Backend
  const [careState, setCareState] = useState<PetCareStateDto>({
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

  const [agentSessions, setAgentSessions] = useState<AgentSessionDto[]>([]);
  const [agentIntegrations, setAgentIntegrations] = useState<AgentIntegrationDto[]>([
    { kind: "claude", display_name: "Claude Code", is_supported: true, is_installed: false },
    { kind: "codex", display_name: "Codex", is_supported: true, is_installed: false },
    { kind: "gemini", display_name: "Gemini CLI", is_supported: true, is_installed: false },
    { kind: "cursor", display_name: "Cursor", is_supported: true, is_installed: false },
    { kind: "pi", display_name: "Pi Coding Agent", is_supported: true, is_installed: true },
    { kind: "droid", display_name: "Factory Droid", is_supported: true, is_installed: false },
  ]);

  const [rightColumnTab, setRightColumnTab] = useState<"stream" | "sessions" | "integrations">("stream");

  // Pet Visual Selection & Vitals
  const [selectedPet, setSelectedPet] = useState("code-frenzy-cat");
  const [petEnergy, setPetEnergy] = useState(88);
  const [petMood, setPetMood] = useState(94);
  const [petFocus, setPetFocus] = useState(92);

  // Interaction State
  const [isInteracting, setIsInteracting] = useState(false);
  const [interactionAction, setInteractionAction] = useState<string | null>(null);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  // Settings Toggles
  const [showDesktopOverlay, setShowDesktopOverlay] = useState(true);
  const [audioReactive, setAudioReactive] = useState(true);
  const [focusTimerSync, setFocusTimerSync] = useState(true);

  // Feed State
  const [events, setEvents] = useState<PetEvent[]>(INITIAL_EVENTS);
  const [feedFilter, setFeedFilter] = useState<"all" | "coding" | "audio" | "vitals">("all");

  // Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Periodic polling for real agentpet backend state
  const fetchPetData = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const [care, sessList, integList] = await Promise.all([
        invoke<PetCareStateDto>("get_pet_care_state"),
        invoke<AgentSessionDto[]>("get_agent_sessions"),
        invoke<AgentIntegrationDto[]>("get_agent_integrations"),
      ]);
      if (care) setCareState(care);
      if (sessList) {
        setAgentSessions(sessList);
        if (sessList.length > 0) {
          const top = sessList[0];
          const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setEvents((prev) => {
            const hasExisting = prev.some(
              (e) => e.source.includes(top.agent_kind) && e.message === (top.message || top.tool_summary || "")
            );
            if (hasExisting) return prev;
            const newEvt: PetEvent = {
              id: `${top.id}-${Date.now()}`,
              category: "coding",
              source: `${top.agent_kind}:${top.tool_name || top.state}`,
              event: top.state,
              message: top.message || top.tool_summary || `Agent task in ${top.project || "workspace"}`,
              time: timeStr,
            };
            return [newEvt, ...prev.slice(0, 19)];
          });
        }
      }
      if (integList && integList.length > 0) {
        setAgentIntegrations(integList);
      }
    } catch {
      // Ignore background poll errors
    }
  }, [isDesktop]);

  useEffect(() => {
    fetchPetData();
    const interval = setInterval(fetchPetData, 2500);
    return () => clearInterval(interval);
  }, [fetchPetData]);

  // Cycle quotes periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % 5);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  const activeQuotes = SPEECH_QUOTES[selectedPet] || SPEECH_QUOTES["code-frenzy-cat"];
  const currentQuote = activeQuotes[currentQuoteIndex % activeQuotes.length];

  // Action Handlers
  const handlePet = async () => {
    setIsInteracting(true);
    setInteractionAction("purring");
    setPetMood((prev) => Math.min(100, prev + 6));
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "pet" });
        setCareState(next);
      } catch {}
    } else {
      setCareState((prev) => ({ ...prev, xp: prev.xp + 15 }));
    }
    setCurrentQuoteIndex((prev) => (prev + 1) % activeQuotes.length);
    showToast("success", "Pet companion! Mood boosted (+6%) and gained +15 XP");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleCoffee = async () => {
    setIsInteracting(true);
    setInteractionAction("coffee");
    setPetEnergy((prev) => Math.min(100, prev + 12));
    setPetFocus((prev) => Math.min(100, prev + 5));
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "coffee" });
        setCareState(next);
      } catch {}
    } else {
      setCareState((prev) => ({ ...prev, xp: prev.xp + 25 }));
    }
    showToast("success", "Served Espresso Coffee! Energy (+12%) and Focus boosted (+25 XP)");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleTuna = async () => {
    setIsInteracting(true);
    setInteractionAction("eating");
    setPetMood((prev) => Math.min(100, prev + 4));
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "tuna" });
        setCareState(next);
      } catch {}
    } else {
      setCareState((prev) => ({ ...prev, xp: prev.xp + 20, hunger: "full" }));
    }
    showToast("success", "Tuna treat served! Hunger satisfied and Happy (+20 XP)");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleRest = async () => {
    setPetEnergy((prev) => Math.min(100, prev + 20));
    setPetMood((prev) => Math.min(100, prev + 10));
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("feed_pet_action", { action: "rest" });
        setCareState(next);
      } catch {}
    } else {
      setCareState((prev) => ({ ...prev, xp: prev.xp + 10 }));
    }
    showToast("info", "Quick meditation rest taken. Fatigue cleared (+10 XP).");
  };

  const handleToggleDesktopOverlay = async () => {
    const next = !showDesktopOverlay;
    setShowDesktopOverlay(next);
    if (isDesktop) {
      try {
        let pos: { x: number; y: number } | null = null;
        try {
          const raw = localStorage.getItem("rust_sound_pet_overlay_pos");
          if (raw) pos = JSON.parse(raw);
        } catch {}
        await invoke("toggle_pet_overlay", {
          enable: next,
          x: pos?.x,
          y: pos?.y,
        });
      } catch (e) {
        console.error("Failed to toggle desktop overlay", e);
      }
    }
    showToast(
      "info",
      next
        ? "Desktop floating companion launched on your screen! (Drag to move)"
        : "Desktop floating companion hidden"
    );
  };

  const handleToggleAudioReactive = () => {
    const next = !audioReactive;
    setAudioReactive(next);
    showToast("info", next ? "Audio-reactive rhythm enabled" : "Audio-reactive rhythm paused");
  };

  const handleSimulatePing = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newEvt: PetEvent = {
      id: Date.now().toString(),
      category: "coding",
      source: "pi:test-ping",
      event: "working",
      message: "Coding pulse received from agent session. Companion gained +10 XP!",
      time: timeStr,
    };
    setEvents((prev) => [newEvt, ...prev.slice(0, 19)]);
    setPetFocus((prev) => Math.min(100, prev + 4));
    if (isDesktop) {
      invoke<PetCareStateDto>("feed_pet_action", { action: "pet" }).then(setCareState).catch(() => {});
    }
    showToast("success", "Agent ping received! Companion synchronized");
  };

  const handleToggleHook = async (kind: string, isInstalled: boolean) => {
    const next = !isInstalled;
    try {
      if (isDesktop) {
        await invoke("toggle_agent_hook", { kind, enabled: next });
        const updated = await invoke<AgentIntegrationDto[]>("get_agent_integrations");
        setAgentIntegrations(updated);
      } else {
        setAgentIntegrations((prev) =>
          prev.map((i) => (i.kind === kind ? { ...i, is_installed: next } : i))
        );
      }
      showToast(
        "success",
        next ? `Hook installed for ${kind}! Agent events will stream to pet` : `Hook removed for ${kind}`
      );
    } catch (e) {
      showToast("error", `Failed to configure hook: ${String(e)}`);
    }
  };

  const handleDismissSession = async (id: string) => {
    if (isDesktop) {
      try {
        await invoke("dismiss_agent_session", { id });
        setAgentSessions((prev) => prev.filter((s) => s.id !== id));
      } catch {}
    } else {
      setAgentSessions((prev) => prev.filter((s) => s.id !== id));
    }
    showToast("info", "Session dismissed from active monitor");
  };

  const handleConfirmReset = async () => {
    if (isDesktop) {
      try {
        const next = await invoke<PetCareStateDto>("reset_pet_care_state");
        setCareState(next);
      } catch {}
    } else {
      setCareState({
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
      });
    }
    setPetEnergy(70);
    setPetMood(75);
    setPetFocus(60);
    setIsResetModalOpen(false);
    showToast("info", "Companion progression and vitals reset to defaults.");
  };

  const filteredEvents = events.filter(
    (e) => feedFilter === "all" || e.category === feedFilter
  );

  // Within-level calculations matching AgentPet CareTabView
  const internalLevel = getInternalLevel(careState.xp);
  const floorXP = xpToReach(internalLevel);
  const ceilingXP = xpToReach(internalLevel + 1);
  const inLevelXP = Math.max(0, careState.xp - floorXP);
  const spanXP = Math.max(1, ceilingXP - floorXP);
  const progressPercent = Math.min(100, Math.max(0, Math.round((inLevelXP / spanXP) * 100)));
  const tokensToNext = Math.max(0, (ceilingXP - careState.xp) * 5000);

  const stageConfig = STAGE_CONFIGS[careState.stage_name] || STAGE_CONFIGS["Hatchling"];
  const StageIcon = stageConfig.icon;

  const topActiveSession = agentSessions.find((s) => s.state === "working" || s.state === "waiting");
  const liveBubbleMessage = topActiveSession
    ? topActiveSession.tool_name
      ? `Executing ${topActiveSession.tool_name}: ${topActiveSession.tool_summary || "Working..."}`
      : topActiveSession.message || `Working on ${topActiveSession.project || "code"}...`
    : currentQuote;

  const currentMood: "idle" | "working" | "waiting" | "done" | "celebrate" | "sleepy" = isInteracting
    ? interactionAction === "purring"
      ? "celebrate"
      : "working"
    : topActiveSession
    ? topActiveSession.state === "working"
      ? "working"
      : topActiveSession.state === "waiting"
      ? "waiting"
      : topActiveSession.state === "done"
      ? "done"
      : "idle"
    : "idle";

  return (
    <div className="w-full flex flex-col space-y-4 select-none pb-8">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 shrink-0 pb-1">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <BadgeComponent variant="default" className="text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5">
            <StageIcon className={cn("w-3.5 h-3.5", stageConfig.text)} />
            Lv {careState.display_level} · {careState.stage_name}
          </BadgeComponent>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--paper)] border border-[var(--line)] text-[11px] text-[var(--ink)]">
            <Radio className="w-3.5 h-3.5 text-[var(--success)] animate-pulse" />
            <span className="font-mono">~/.agentpet/agentpet.sock</span>
          </div>
          {careState.streak_days > 0 && (
            <BadgeComponent variant="emerald" className="text-[11px] px-2 py-0.5 font-semibold">
              <Flame className="w-3 h-3 text-[var(--warning)] inline mr-1" />
              {careState.streak_days} Day Streak
            </BadgeComponent>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={handleToggleDesktopOverlay}
            leftIcon={<Laptop className="w-3.5 h-3.5 text-[var(--accent-text)]" />}
            title="Toggle Desktop Floating Pet Window"
            className="h-7 text-xs border-rose-500/30 text-[var(--accent-text)] hover:bg-rose-500/10"
          >
            {showDesktopOverlay ? "Desktop Pet Active" : "Launch Desktop Pet"}
          </ButtonComponent>

          <BadgeComponent variant="emerald" dot className="px-2.5 py-1 text-xs font-semibold">
            IPC Socket Active
          </BadgeComponent>
          <ButtonComponent
            variant="ghost"
            size="sm"
            onClick={() => setIsResetModalOpen(true)}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[var(--muted)]" />}
            title="Reset companion stats"
            className="h-7 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Reset
          </ButtonComponent>
        </div>
      </div>

      {/* 2. Fluid 2-Column Edge-to-Edge Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (lg:col-span-7): Hologram Stage & Vitals Cockpit */}
        <div className="lg:col-span-7 flex flex-col gap-4.5">
          {/* Main Companion Hologram Stage */}
          <div className="flex flex-col items-center p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm relative overflow-hidden gap-3">
            {/* Ambient Background Aura */}
            <div
              className={cn(
                "absolute inset-0 rounded-full blur-3xl transition-all duration-1000 pointer-events-none opacity-40",
                audioReactive
                  ? "bg-gradient-to-tr from-rose-500/25 via-pink-500/15 to-purple-500/20 animate-pulse"
                  : "bg-rose-500/10"
              )}
            />

            {/* Top Row: Companion Selector & Streak Badge */}
            <div className="flex items-center justify-between w-full mb-2 gap-2 relative z-10 shrink-0">
              <div className="w-64 min-w-0">
                <SelectComponent
                  value={selectedPet}
                  onChange={(val) => {
                    setSelectedPet(val);
                    try {
                      localStorage.setItem("rust_sound_pet_slug", val);
                      window.dispatchEvent(new Event("storage"));
                    } catch {}
                    showToast("info", `Switched active companion to ${val}`);
                  }}
                  options={[
                    { label: "Code Frenzy Cat (Active)", value: "code-frenzy-cat" },
                    { label: "Boba Otter (Bubble Tea)", value: "boba" },
                    { label: "Shinchan 3 (Action Hero)", value: "shinchan-3" },
                    { label: "Work Blue Cat (Cyber Coding)", value: "work-blue-cat" },
                    { label: "Super Saiyan Goku (Anime)", value: "super-saiyan-goku" },
                    { label: "Sword & Shield Guardian", value: "wode-daodun-3d" },
                    { label: "Eddy Educator Bear", value: "eddy" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[var(--warning)] text-xs font-semibold shadow-sm">
                <Flame className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                <span>{careState.streak_days > 0 ? `${careState.streak_days}-Day Streak` : "7-Day Streak"}</span>
              </div>
            </div>

            {/* Interactive Speech Bubble with Audio Pulse */}
            <div className="relative max-w-lg w-full my-2 z-10 shrink-0">
              <div
                onClick={() => setCurrentQuoteIndex((prev) => (prev + 1) % activeQuotes.length)}
                className="relative bg-[var(--paper)] border border-[var(--input-line)] rounded-2xl p-3 px-4 shadow-[0_4px_24px_rgba(251,113,133,0.15)] backdrop-blur-md cursor-pointer hover:border-rose-400/50 transition-all text-center group"
                title="Click to hear companion's next thought"
              >
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0 animate-spin" style={{ animationDuration: "8s" }} />
                  <p className="text-xs font-medium text-[var(--ink)] m-0 group-hover:text-[var(--accent-text)] transition-colors">
                    "{liveBubbleMessage}"
                  </p>
                </div>
                {/* Speech arrow tail */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[var(--paper)] border-r border-b border-[var(--input-line)] transform rotate-45" />
              </div>
            </div>

            {/* Character Stage & Authentic Animated Pixel Sprite */}
            <div className="relative w-full flex-1 flex flex-col items-center justify-center select-none py-2 z-10">
              <div
                onClick={handlePet}
                className={cn(
                  "relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-300",
                  isInteracting && "scale-110",
                  !isInteracting && "hover:scale-105"
                )}
                title="Click companion to interact!"
              >
                <AgentPetSprite
                  slug={selectedPet}
                  mood={currentMood}
                  size={165}
                />

                {/* Status Micro-Badge */}
                <span className="mt-2 px-3 py-1 rounded-full text-[10px] font-bold bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] shadow-md flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      currentMood === "working"
                        ? "bg-emerald-400 animate-ping"
                        : currentMood === "waiting"
                        ? "bg-amber-400 animate-bounce"
                        : "bg-[var(--accent)]"
                    )}
                  />
                  <span>
                    {isInteracting
                      ? interactionAction === "purring"
                        ? "Purring Happily"
                        : interactionAction === "coffee"
                        ? "Energized on Espresso"
                        : "Devouring Tuna"
                      : topActiveSession
                      ? `${topActiveSession.agent_kind.toUpperCase()} (${topActiveSession.state})`
                      : "Coding Companion (Active)"}
                  </span>
                </span>
              </div>
            </div>

            {/* Tactical Pet Care Action Dock */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3.5 mt-2 border-t border-[var(--line)] w-full relative z-10">
              <ButtonComponent
                variant="primary"
                size="sm"
                onClick={handlePet}
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-[var(--accent-ink)]" />}
                className="h-8.5 px-3.5 text-xs font-semibold shadow-md"
              >
                Pet Companion
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleCoffee}
                leftIcon={<Coffee className="w-3.5 h-3.5 text-[var(--warning)]" />}
                className="h-8.5 px-3.5 text-xs font-semibold"
              >
                Brew Espresso (+12%)
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleTuna}
                leftIcon={<Fish className="w-3.5 h-3.5 text-[var(--success)]" />}
                className="h-8.5 px-3.5 text-xs font-semibold"
              >
                Feed Tuna (+15%)
              </ButtonComponent>

              <ButtonComponent
                variant="ghost"
                size="sm"
                onClick={handleRest}
                leftIcon={<Moon className="w-3.5 h-3.5 text-[var(--accent-text)]" />}
                className="h-8.5 px-3.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Power Nap
              </ButtonComponent>
            </div>
          </div>

          {/* 7-Companion Visual Showcase Gallery */}
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 shadow-sm space-y-3 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
                <div>
                  <h4 className="text-xs font-bold text-[var(--ink)] tracking-tight m-0">
                    Companion Showcase Gallery
                  </h4>
                  <p className="text-[10px] text-[var(--muted)] m-0">
                    7 Authentic Pixel-Art Archetypes · 1-Click Equip
                  </p>
                </div>
              </div>

              <BadgeComponent variant="default" className="text-[10px] font-mono px-2 py-0.5">
                7 Installed
              </BadgeComponent>
            </div>

            {/* Horizontal Scrollable Pet Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {INSTALLED_PETS.map((pet) => {
                const isSelected = selectedPet === pet.id;
                return (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => {
                      setSelectedPet(pet.id);
                      try {
                        localStorage.setItem("rust_sound_pet_slug", pet.id);
                        window.dispatchEvent(new Event("storage"));
                      } catch {}
                      showToast("success", `Equipped ${pet.name}!`);
                    }}
                    className={cn(
                      "p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition-all text-center group cursor-pointer relative overflow-hidden",
                      isSelected
                        ? "bg-[var(--accent)]/15 border-[var(--accent)] ring-2 ring-[var(--accent)]/30 text-[var(--ink)] shadow-sm"
                        : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--focus)]"
                    )}
                  >
                    {/* Active Checkmark Pill */}
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-rose-400 text-stone-950 flex items-center justify-center font-bold shadow-sm">
                        <Check className="w-2.5 h-2.5 text-stone-950 stroke-[3]" />
                      </span>
                    )}

                    {/* Mini Sprite Preview */}
                    <div className="w-14 h-14 flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                      <AgentPetSprite slug={pet.id} mood={isSelected ? "working" : "idle"} size={56} />
                    </div>

                    <div className="w-full min-w-0">
                      <span className="text-[11px] font-bold block truncate leading-tight">
                        {pet.name}
                      </span>
                      <span className="text-[9px] text-[var(--muted)] block truncate mt-0.5 font-mono">
                        {pet.tag}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progression Bar & Vitals Cockpit */}
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 shadow-sm space-y-3.5 shrink-0">
            {/* Level & XP Progression Bar matching CareTabView */}
            <div className="bg-[var(--paper)] border border-[var(--line)] rounded-xl p-3 px-3.5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center border",
                      stageConfig.bg,
                      stageConfig.border
                    )}
                  >
                    <StageIcon className={cn("w-3.5 h-3.5", stageConfig.text)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[var(--ink)] text-xs">
                      Lv {careState.display_level}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold border",
                        stageConfig.bg,
                        stageConfig.border,
                        stageConfig.text
                      )}
                    >
                      {careState.stage_name}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-semibold text-[var(--accent-text)] tabular-nums">
                    {inLevelXP.toLocaleString()} / {spanXP.toLocaleString()} XP
                  </span>
                  <span className="text-[10px] text-[var(--muted)] font-mono ml-1.5">
                    ({progressPercent}%)
                  </span>
                </div>
              </div>

              <div className="w-full h-2 bg-[var(--paper)] rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-400 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[var(--line)] text-[10px] text-[var(--muted)]">
                <span className="flex items-center gap-1 text-[var(--ink)]">
                  <Sparkles className="w-3 h-3 text-[var(--accent-text)]" />
                  Lifetime XP: {careState.xp.toLocaleString()}
                </span>
                <span className={cn("font-medium", stageConfig.text)}>
                  ≈ {tokensToNext.toLocaleString()} tokens to Lv {careState.display_level + 1}
                </span>
              </div>
            </div>

            {/* 4 Core Vitals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Energy */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-[var(--muted)] flex items-center gap-1 font-medium">
                    <Zap className="w-3 h-3 text-[var(--warning)]" />
                    Energy
                  </span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">{petEnergy}%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--paper)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                    style={{ width: `${petEnergy}%` }}
                  />
                </div>
              </div>

              {/* Mood */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-[var(--muted)] flex items-center gap-1 font-medium">
                    <Heart className="w-3 h-3 text-[var(--accent-text)]" />
                    Mood
                  </span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">{petMood}%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--paper)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-300 rounded-full transition-all duration-300"
                    style={{ width: `${petMood}%` }}
                  />
                </div>
              </div>

              {/* Focus */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-[var(--muted)] flex items-center gap-1 font-medium">
                    <Activity className="w-3 h-3 text-[var(--accent-text)]" />
                    Focus
                  </span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">{petFocus}%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--paper)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-300 rounded-full transition-all duration-300"
                    style={{ width: `${petFocus}%` }}
                  />
                </div>
              </div>

              {/* Hunger */}
              <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-[var(--muted)] flex items-center gap-1 font-medium">
                    <Fish className="w-3 h-3 text-[var(--success)]" />
                    Hunger
                  </span>
                  <span className="font-semibold text-[var(--success)] capitalize text-[10px]">
                    {careState.hunger}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--paper)] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      careState.hunger === "full"
                        ? "w-full bg-emerald-400"
                        : careState.hunger === "satisfied"
                        ? "w-3/4 bg-emerald-500"
                        : careState.hunger === "peckish"
                        ? "w-1/2 bg-amber-400"
                        : "w-1/4 bg-rose-500"
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Tamagotchi Daily Feeding & Lifetime Ledger */}
            <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)] flex items-center gap-1.5 font-medium">
                  <Flame className="w-3.5 h-3.5 text-[var(--warning)]" />
                  Daily Feeding & Work Activity
                </span>
                <span className="font-mono text-[var(--success)] font-semibold text-[10px]">
                  {careState.streak_days} Day Streak
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div>
                  <span className="text-[var(--muted)] block">Tokens Today</span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {careState.tokens_today.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block">Meals Today</span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {careState.meals_today} sessions
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block">Lifetime Tokens</span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {careState.total_tokens.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block">Lifetime Meals</span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {careState.total_meals} sessions
                  </span>
                </div>
              </div>
            </div>

            {/* Achievements Showcase (AgentPet Trophy Shelf) */}
            <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)] flex items-center gap-1.5 font-medium">
                  <Trophy className="w-3.5 h-3.5 text-[var(--warning)]" />
                  Achievements Showcase
                </span>
                <span className="text-[var(--muted)] font-mono text-[10px]">
                  {careState.unlocked_achievements.length} / {ACHIEVEMENTS_METADATA.length} Unlocked
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {ACHIEVEMENTS_METADATA.map((ach) => {
                  const isUnlocked = careState.unlocked_achievements.includes(ach.id);
                  const Icon = ach.icon;
                  return (
                    <div
                      key={ach.id}
                      className={cn(
                        "p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1",
                        isUnlocked
                          ? "bg-amber-500/10 border-amber-500/30 text-[var(--warning)] shadow-sm"
                          : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] opacity-40"
                      )}
                      title={`${ach.name}: ${ach.description} (${isUnlocked ? "Unlocked" : "Locked"})`}
                    >
                      <Icon
                        className={cn("w-3.5 h-3.5", isUnlocked ? "text-[var(--warning)]" : "text-[var(--muted)]")}
                      />
                      <span className="text-[9px] font-semibold truncate w-full block">
                        {ach.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (lg:col-span-5): Socket Diagnostics & Real-Time Console */}
        <div className="lg:col-span-5 flex flex-col gap-4.5">
          {/* Socket & Desktop Bridge Card */}
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 shadow-sm space-y-3.5 shrink-0">
            <div className="flex items-center justify-between pb-2.5 border-b border-[var(--line)]">
              <div>
                <span className="text-xs font-semibold text-[var(--ink)] tracking-tight block">
                  IPC Socket & Desktop Bridge
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  Unix Domain Socket ~/.agentpet/agentpet.sock
                </span>
              </div>
              <Radio className="w-4 h-4 text-[var(--success)] animate-pulse" />
            </div>

            {/* Diagnostic Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
              <div>
                <span className="text-[10px] text-[var(--muted)] block mb-0.5">Connection State</span>
                <span className="text-[var(--success)] font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected (1.2 ms)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] block mb-0.5">Target Agent</span>
                <span className="text-[var(--ink)] font-semibold text-[11px]">pi:coding-agent</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-[var(--line)] flex items-center justify-between text-[10px] text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <FolderGit2 className="w-3 h-3 text-[var(--accent-text)]" />
                  Workspace Context:
                </span>
                <span className="font-mono text-[var(--ink)] truncate max-w-[200px]">
                  /Users/mac/Documents/rust-sound
                </span>
              </div>
            </div>

            {/* Control Toggles */}
            <div className="space-y-2 pt-0.5">
              {/* Desktop Floating Overlay Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Laptop className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-[var(--ink)] block">Desktop Floating Overlay</span>
                    <span className="text-[10px] text-[var(--muted)] block">Render animated cat sticker on desktop</span>
                  </div>
                </div>
                <button
                  onClick={handleToggleDesktopOverlay}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    showDesktopOverlay ? "bg-rose-500" : "bg-[var(--input-line)]"
                  )}
                  role="switch"
                  aria-checked={showDesktopOverlay}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75",
                      showDesktopOverlay ? "left-5.25" : "left-0.75"
                    )}
                  />
                </button>
              </div>

              {/* Audio-Reactive Mode Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-[var(--ink)] block">Audio-Reactive Rhythm</span>
                    <span className="text-[10px] text-[var(--muted)] block">Pulse visuals to active music stream</span>
                  </div>
                </div>
                <button
                  onClick={handleToggleAudioReactive}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    audioReactive ? "bg-emerald-500" : "bg-[var(--input-line)]"
                  )}
                  role="switch"
                  aria-checked={audioReactive}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75",
                      audioReactive ? "left-5.25" : "left-0.75"
                    )}
                  />
                </button>
              </div>

              {/* Focus Timer Sync Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Eye className="w-4 h-4 text-[var(--warning)] shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-[var(--ink)] block">Break Timer Sync</span>
                    <span className="text-[10px] text-[var(--muted)] block">Duck audio and rest during breaks</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const next = !focusTimerSync;
                    setFocusTimerSync(next);
                    showToast("info", next ? "Break timer sync activated" : "Break timer sync disabled");
                  }}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    focusTimerSync ? "bg-amber-500" : "bg-[var(--input-line)]"
                  )}
                  role="switch"
                  aria-checked={focusTimerSync}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75",
                      focusTimerSync ? "left-5.25" : "left-0.75"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Live Activity Console (Takes Remaining Height) */}
          <div className="flex-1 flex flex-col rounded-2xl bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 shadow-sm min-h-[300px]">
            {/* Console Navigation Tabs */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--line)] shrink-0 gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 bg-[var(--paper)] border border-[var(--line)] rounded-lg">
                <button
                  type="button"
                  onClick={() => setRightColumnTab("stream")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    rightColumnTab === "stream"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-bold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Activity Stream
                </button>

                <button
                  type="button"
                  onClick={() => setRightColumnTab("sessions")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    rightColumnTab === "sessions"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-bold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  <Bot className="w-3.5 h-3.5 text-[var(--success)]" />
                  Active Sessions
                  {agentSessions.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-[var(--success)] text-[9px] flex items-center justify-center font-bold">
                      {agentSessions.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setRightColumnTab("integrations")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    rightColumnTab === "integrations"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-bold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  <Plug className="w-3.5 h-3.5 text-purple-500" />
                  Agent Hooks
                </button>
              </div>

              {rightColumnTab === "stream" && (
                <ButtonComponent
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2.5 text-[var(--accent-text)] hover:text-[var(--ink)] hover:bg-rose-500/10"
                  onClick={handleSimulatePing}
                  leftIcon={<Send className="w-3 h-3 text-[var(--accent-text)]" />}
                >
                  Test Ping
                </ButtonComponent>
              )}
            </div>

            {/* TAB 1: ACTIVITY STREAM */}
            {rightColumnTab === "stream" && (
              <>
                {/* Filter Pills */}
                <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-[var(--paper)] border border-[var(--line)] shrink-0">
                  {(["all", "coding", "audio", "vitals"] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFeedFilter(cat)}
                      className={cn(
                        "flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all capitalize cursor-pointer",
                        feedFilter === cat
                          ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                          : "text-[var(--muted)] hover:text-[var(--ink)]"
                      )}
                    >
                      {cat === "all" ? "All" : cat}
                    </button>
                  ))}
                </div>

                {/* Event List Items */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
                  {filteredEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-[var(--focus)]"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-semibold text-[var(--ink)] text-[11px] truncate">
                              {evt.source}
                            </span>
                            <BadgeComponent
                              variant={
                                evt.category === "coding"
                                  ? "default"
                                  : evt.category === "audio"
                                  ? "emerald"
                                  : "secondary"
                              }
                              className="px-1.5 py-0 text-[9px] uppercase tracking-wider"
                            >
                              {evt.event}
                            </BadgeComponent>
                          </div>
                          <p className="text-[var(--muted)] text-[11px] m-0 line-clamp-2 leading-relaxed">
                            {evt.message}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--muted)] whitespace-nowrap tabular-nums">
                        {evt.time}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TAB 2: ACTIVE AGENT SESSIONS */}
            {rightColumnTab === "sessions" && (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
                {agentSessions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[var(--muted)]">
                    <Bot className="w-8 h-8 mb-2 opacity-30 text-[var(--accent-text)]" />
                    <span className="text-xs font-semibold text-[var(--ink)]">No active coding sessions</span>
                    <span className="text-[11px] text-[var(--muted)] mt-1 max-w-xs">
                      Run Claude Code, Codex, or Cursor in your terminal. Live work will automatically stream here via ~/.agentpet/agentpet.sock
                    </span>
                  </div>
                ) : (
                  agentSessions.map((sess: AgentSessionDto) => (
                    <div
                      key={sess.id}
                      className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-[var(--focus)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {sess.agent_kind.toLowerCase() === "pi" ? (
                            <Terminal className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
                          ) : sess.agent_kind.toLowerCase() === "claude" ? (
                            <Bot className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                          ) : sess.agent_kind.toLowerCase() === "codex" ? (
                            <Code2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
                          ) : sess.agent_kind.toLowerCase() === "cursor" ? (
                            <MousePointer2 className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                          ) : sess.agent_kind.toLowerCase() === "gemini" ? (
                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                          ) : (
                            <Cpu className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                          )}
                          <span className="font-bold text-[var(--ink)] text-xs capitalize">
                            {sess.agent_kind}
                          </span>
                          <BadgeComponent
                            variant={
                              sess.state === "working"
                                ? "emerald"
                                : sess.state === "waiting"
                                ? "coral"
                                : "default"
                            }
                            className="px-1.5 py-0 text-[9px] uppercase font-bold"
                          >
                            {sess.state}
                          </BadgeComponent>
                          {sess.model && (
                            <span className="text-[10px] text-[var(--muted)] font-mono truncate">
                              {sess.model}
                            </span>
                          )}
                        </div>
                        {sess.project && (
                          <div className="text-[11px] text-[var(--accent-text)] font-mono truncate flex items-center gap-1">
                            <FolderGit2 className="w-3 h-3 shrink-0" />
                            {sess.project}
                          </div>
                        )}
                        {(sess.tool_name || sess.tool_summary || sess.message) && (
                          <div className="text-[11px] text-[var(--ink)] font-mono bg-[var(--paper)] px-2 py-1 rounded mt-1.5 truncate border border-[var(--line)] flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-[var(--accent-text)]">TOOL:</span>
                            <span>{sess.tool_name ? `${sess.tool_name}: ` : ""}{sess.tool_summary || sess.message || "Working"}</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDismissSession(sess.id)}
                        className="text-[var(--muted)] hover:text-[var(--accent-text)] p-1 rounded transition-colors cursor-pointer"
                        title="Dismiss session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: AGENT HOOK INTEGRATIONS */}
            {rightColumnTab === "integrations" && (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
                <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] text-[11px] text-[var(--muted)] mb-2">
                  1-Click configure hooks into your local developer tools. Lifecycle events will automatically stream into this AgentPet companion.
                </div>

                {agentIntegrations.map((agent: AgentIntegrationDto) => (
                  <div
                    key={agent.kind}
                    className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex items-center justify-between gap-3 text-xs transition-colors hover:border-[var(--line)]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-[var(--line)] flex items-center justify-center shrink-0 mt-0.5">
                        {agent.kind === "pi" ? (
                          <Terminal className="w-3.5 h-3.5 text-[var(--success)]" />
                        ) : agent.kind === "claude" ? (
                          <Bot className="w-3.5 h-3.5 text-[var(--warning)]" />
                        ) : agent.kind === "codex" ? (
                          <Code2 className="w-3.5 h-3.5 text-[var(--success)]" />
                        ) : agent.kind === "cursor" ? (
                          <MousePointer2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        ) : agent.kind === "gemini" ? (
                          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        ) : (
                          <Cpu className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--ink)] text-xs">
                            {agent.display_name}
                          </span>
                        {agent.is_installed ? (
                          <span className="text-[10px] font-medium text-[var(--success)] bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Hooked
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--muted)] bg-[var(--paper)] px-1.5 py-0.2 rounded border border-[var(--line)]">
                            Inactive
                          </span>
                        )}
                      </div>
                      {agent.note && (
                        <p className="text-[10px] text-[var(--muted)] m-0 mt-0.5">{agent.note}</p>
                      )}
                    </div>
                  </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={agent.is_installed}
                      onClick={() => handleToggleHook(agent.kind, agent.is_installed)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        agent.is_installed ? "bg-emerald-500" : "bg-[var(--input-line)]"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          agent.is_installed ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Confirmation Modal Before Resetting Companion Progression */}
      <ModalComponent
        open={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Companion Stats?"
        description="Are you sure you want to reset all companion vitals, XP progression, and mood metrics back to initial defaults?"
        confirmText="Reset Progression"
        cancelText="Cancel"
        confirmVariant="destructive"
        onConfirm={handleConfirmReset}
      />
    </div>
  );
};
