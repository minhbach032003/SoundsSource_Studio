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
    text: "text-emerald-400",
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
    text: "text-rose-300",
  },
  Hero: {
    icon: Shield,
    color: "#a855f7",
    bg: "bg-purple-500/15",
    border: "border-purple-500/30",
    text: "text-purple-400",
  },
  Legend: {
    icon: Crown,
    color: "#f59e0b",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-400",
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
        await invoke("toggle_pet_overlay", { enable: next });
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
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 shrink-0 pb-1">
        <div className="flex items-center gap-2.5">
          <BadgeComponent variant="default" className="text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5">
            <StageIcon className={cn("w-3.5 h-3.5", stageConfig.text)} />
            Lv {careState.display_level} · {careState.stage_name}
          </BadgeComponent>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-white/8 text-[11px] text-slate-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-mono">~/.agentpet/agentpet.sock</span>
          </div>
          {careState.streak_days > 0 && (
            <BadgeComponent variant="emerald" className="text-[11px] px-2 py-0.5 font-semibold">
              <Flame className="w-3 h-3 text-amber-400 inline mr-1" />
              {careState.streak_days} Day Streak
            </BadgeComponent>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={handleToggleDesktopOverlay}
            leftIcon={<Laptop className="w-3.5 h-3.5 text-rose-400" />}
            title="Toggle Desktop Floating Pet Window"
            className="h-7 text-xs border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
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
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-400" />}
            title="Reset companion stats"
            className="h-7 text-xs text-slate-400 hover:text-slate-200"
          >
            Reset
          </ButtonComponent>
        </div>
      </div>

      {/* 2. Fluid 2-Column Edge-to-Edge Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
        {/* Left Column (lg:col-span-7): Hologram Stage & Vitals Cockpit */}
        <div className="lg:col-span-7 flex flex-col gap-4 h-full min-h-0">
          {/* Main Companion Hologram Stage */}
          <div className="flex-1 flex flex-col items-center justify-between p-6 sm:p-7 rounded-2xl bg-gradient-to-b from-[#141b26] via-[#10141d] to-[#0c0f17] border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.45)] relative overflow-hidden min-h-[380px]">
            {/* Ambient Background Aura */}
            <div
              className={cn(
                "absolute inset-0 rounded-full blur-3xl transition-all duration-1000 pointer-events-none opacity-40",
                audioReactive
                  ? "bg-gradient-to-tr from-sky-500/30 via-emerald-500/20 to-purple-500/25 animate-pulse"
                  : "bg-sky-500/15"
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

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold shadow-sm">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{careState.streak_days > 0 ? `${careState.streak_days}-Day Streak` : "7-Day Streak"}</span>
              </div>
            </div>

            {/* Interactive Speech Bubble with Audio Pulse */}
            <div className="relative max-w-lg w-full my-2 z-10 shrink-0">
              <div
                onClick={() => setCurrentQuoteIndex((prev) => (prev + 1) % activeQuotes.length)}
                className="relative bg-slate-900/90 border border-sky-500/30 rounded-2xl p-3 px-4 shadow-[0_4px_24px_rgba(56,189,248,0.15)] backdrop-blur-md cursor-pointer hover:border-sky-400/50 transition-all text-center group"
                title="Click to hear companion's next thought"
              >
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-spin" style={{ animationDuration: "8s" }} />
                  <p className="text-xs font-medium text-slate-100 m-0 group-hover:text-sky-200 transition-colors">
                    "{liveBubbleMessage}"
                  </p>
                </div>
                {/* Speech arrow tail */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-r border-b border-sky-500/30 transform rotate-45" />
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
                  size={200}
                />

                {/* Status Micro-Badge */}
                <span className="mt-2 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-950/90 border border-sky-400/40 text-sky-300 shadow-lg flex items-center gap-1.5 backdrop-blur-md">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      currentMood === "working"
                        ? "bg-emerald-400 animate-ping"
                        : currentMood === "waiting"
                        ? "bg-amber-400 animate-bounce"
                        : "bg-sky-400"
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
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3 border-t border-white/8 w-full relative z-10 shrink-0">
              <ButtonComponent
                variant="primary"
                size="sm"
                onClick={handlePet}
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-slate-950" />}
                className="h-8.5 px-3.5 text-xs font-semibold shadow-md"
              >
                Pet Companion
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleCoffee}
                leftIcon={<Coffee className="w-3.5 h-3.5 text-amber-400" />}
                className="h-8.5 px-3.5 text-xs font-semibold"
              >
                Brew Espresso (+12%)
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleTuna}
                leftIcon={<Fish className="w-3.5 h-3.5 text-emerald-400" />}
                className="h-8.5 px-3.5 text-xs font-semibold"
              >
                Feed Tuna (+15%)
              </ButtonComponent>

              <ButtonComponent
                variant="ghost"
                size="sm"
                onClick={handleRest}
                leftIcon={<Moon className="w-3.5 h-3.5 text-purple-400" />}
                className="h-8.5 px-3.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Power Nap
              </ButtonComponent>
            </div>
          </div>

          {/* 7-Companion Visual Showcase Gallery */}
          <div className="rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm space-y-3 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100 tracking-tight m-0">
                    Companion Showcase Gallery
                  </h4>
                  <p className="text-[10px] text-slate-400 m-0">
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
                      } catch {}
                      showToast("success", `Equipped ${pet.name}!`);
                    }}
                    className={cn(
                      "p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition-all text-center group cursor-pointer relative overflow-hidden",
                      isSelected
                        ? "bg-rose-500/15 border-rose-400/60 ring-2 ring-rose-400/40 shadow-[0_0_16px_rgba(251,113,133,0.2)] text-rose-100"
                        : "bg-[#18121b]/60 border-white/6 text-stone-400 hover:text-stone-200 hover:border-white/14 hover:bg-[#251e2b]/60"
                    )}
                  >
                    {/* Active Checkmark Pill */}
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-rose-400 text-stone-950 flex items-center justify-center font-bold text-[8px] shadow-sm">
                        ✓
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
                      <span className="text-[9px] text-slate-500 block truncate mt-0.5 font-mono">
                        {pet.tag}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progression Bar & Vitals Cockpit */}
          <div className="rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm space-y-3.5 shrink-0">
            {/* Level & XP Progression Bar matching CareTabView */}
            <div className="bg-slate-950/60 border border-white/6 rounded-xl p-3 px-3.5">
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
                    <span className="font-bold text-slate-100 text-xs">
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
                  <span className="text-[11px] font-semibold text-rose-300 tabular-nums">
                    {inLevelXP.toLocaleString()} / {spanXP.toLocaleString()} XP
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                    ({progressPercent}%)
                  </span>
                </div>
              </div>

              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-400 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 text-slate-300">
                  <Sparkles className="w-3 h-3 text-rose-400" />
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
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Energy
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petEnergy}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                    style={{ width: `${petEnergy}%` }}
                  />
                </div>
              </div>

              {/* Mood */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Heart className="w-3 h-3 text-rose-400" />
                    Mood
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petMood}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-300 rounded-full transition-all duration-300"
                    style={{ width: `${petMood}%` }}
                  />
                </div>
              </div>

              {/* Focus */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Activity className="w-3 h-3 text-rose-400" />
                    Focus
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petFocus}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-300 rounded-full transition-all duration-300"
                    style={{ width: `${petFocus}%` }}
                  />
                </div>
              </div>

              {/* Hunger */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Fish className="w-3 h-3 text-emerald-400" />
                    Hunger
                  </span>
                  <span className="font-semibold text-emerald-400 capitalize text-[10px]">
                    {careState.hunger}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
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
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Daily Feeding & Work Activity
                </span>
                <span className="font-mono text-emerald-400 font-semibold text-[10px]">
                  {careState.streak_days} Day Streak
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-500 block">Tokens Today</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {careState.tokens_today.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Meals Today</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {careState.meals_today} sessions
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Lifetime Tokens</span>
                  <span className="font-mono font-semibold text-slate-300">
                    {careState.total_tokens.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Lifetime Meals</span>
                  <span className="font-mono font-semibold text-slate-300">
                    {careState.total_meals} sessions
                  </span>
                </div>
              </div>
            </div>

            {/* Achievements Showcase (AgentPet Trophy Shelf) */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Achievements Showcase
                </span>
                <span className="text-slate-500 font-mono text-[10px]">
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
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                          : "bg-slate-900/40 border-white/5 text-slate-500 opacity-40"
                      )}
                      title={`${ach.name}: ${ach.description} (${isUnlocked ? "Unlocked" : "Locked"})`}
                    >
                      <Icon
                        className={cn("w-3.5 h-3.5", isUnlocked ? "text-amber-400" : "text-slate-500")}
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
        <div className="lg:col-span-5 flex flex-col gap-4 h-full min-h-0">
          {/* Socket & Desktop Bridge Card */}
          <div className="rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm space-y-3.5 shrink-0">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
              <div>
                <span className="text-xs font-semibold text-slate-200 tracking-tight block">
                  IPC Socket & Desktop Bridge
                </span>
                <span className="text-[11px] text-slate-400">
                  Unix Domain Socket ~/.agentpet/agentpet.sock
                </span>
              </div>
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>

            {/* Diagnostic Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
              <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">Connection State</span>
                <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected (1.2 ms)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">Target Agent</span>
                <span className="text-slate-200 font-semibold text-[11px]">pi:coding-agent</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <FolderGit2 className="w-3 h-3 text-rose-400" />
                  Workspace Context:
                </span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  /Users/mac/Documents/rust-sound
                </span>
              </div>
            </div>

            {/* Control Toggles */}
            <div className="space-y-2 pt-0.5">
              {/* Desktop Floating Overlay Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="flex items-center gap-2.5">
                  <Laptop className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Desktop Floating Overlay</span>
                    <span className="text-[10px] text-slate-400 block">Render animated cat sticker on desktop</span>
                  </div>
                </div>
                <button
                  onClick={handleToggleDesktopOverlay}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    showDesktopOverlay ? "bg-rose-500" : "bg-[#251e2b]"
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
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Audio-Reactive Rhythm</span>
                    <span className="text-[10px] text-slate-400 block">Pulse visuals to active music stream</span>
                  </div>
                </div>
                <button
                  onClick={handleToggleAudioReactive}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    audioReactive ? "bg-emerald-500" : "bg-slate-800"
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
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="flex items-center gap-2.5">
                  <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Break Timer Sync</span>
                    <span className="text-[10px] text-slate-400 block">Duck audio and rest during breaks</span>
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
                    focusTimerSync ? "bg-amber-500" : "bg-slate-800"
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
          <div className="flex-1 flex flex-col rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm min-h-[300px]">
            {/* Console Navigation Tabs */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 shrink-0 gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 bg-slate-950/80 border border-white/6 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRightColumnTab("stream")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    rightColumnTab === "stream"
                      ? "bg-slate-800 text-sky-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
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
                      ? "bg-slate-800 text-sky-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  Active Sessions
                  {agentSessions.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] flex items-center justify-center font-bold">
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
                      ? "bg-slate-800 text-sky-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Plug className="w-3.5 h-3.5 text-purple-400" />
                  Agent Hooks
                </button>
              </div>

              {rightColumnTab === "stream" && (
                <ButtonComponent
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2.5 text-rose-300 hover:text-white hover:bg-rose-500/10"
                  onClick={handleSimulatePing}
                  leftIcon={<Send className="w-3 h-3 text-rose-400" />}
                >
                  Test Ping
                </ButtonComponent>
              )}
            </div>

            {/* TAB 1: ACTIVITY STREAM */}
            {rightColumnTab === "stream" && (
              <>
                {/* Filter Pills */}
                <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-slate-950/60 border border-white/6 shrink-0">
                  {(["all", "coding", "audio", "vitals"] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFeedFilter(cat)}
                      className={cn(
                        "flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all capitalize cursor-pointer",
                        feedFilter === cat
                          ? "bg-[#2b2231] text-rose-300 shadow-sm border border-white/5"
                          : "text-slate-400 hover:text-slate-200"
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
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-white/6 flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-white/12"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-semibold text-slate-200 text-[11px] truncate">
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
                          <p className="text-slate-400 text-[11px] m-0 line-clamp-2 leading-relaxed">
                            {evt.message}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums">
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
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                    <Bot className="w-8 h-8 mb-2 opacity-30 text-rose-400" />
                    <span className="text-xs font-semibold text-slate-300">No active coding sessions</span>
                    <span className="text-[11px] text-slate-400 mt-1 max-w-xs">
                      Run Claude Code, Codex, or Cursor in your terminal. Live work will automatically stream here via ~/.agentpet/agentpet.sock
                    </span>
                  </div>
                ) : (
                  agentSessions.map((sess: AgentSessionDto) => (
                    <div
                      key={sess.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-white/6 flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-white/12"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-200 text-xs capitalize">
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
                            <span className="text-[10px] text-slate-400 font-mono truncate">
                              {sess.model}
                            </span>
                          )}
                        </div>
                        {sess.project && (
                          <div className="text-[11px] text-rose-300 font-mono truncate flex items-center gap-1">
                            <FolderGit2 className="w-3 h-3 shrink-0" />
                            {sess.project}
                          </div>
                        )}
                        {(sess.tool_name || sess.tool_summary || sess.message) && (
                          <div className="text-[11px] text-slate-300 font-mono bg-slate-900/80 px-2 py-1 rounded mt-1.5 truncate border border-white/5 flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-rose-400">TOOL:</span>
                            <span>{sess.tool_name ? `${sess.tool_name}: ` : ""}{sess.tool_summary || sess.message || "Working"}</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDismissSession(sess.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
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
                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-white/5 text-[11px] text-slate-400 mb-2">
                  1-Click configure hooks into your local developer tools. Lifecycle events will automatically stream into this AgentPet companion.
                </div>

                {agentIntegrations.map((agent: AgentIntegrationDto) => (
                  <div
                    key={agent.kind}
                    className="p-3 rounded-xl bg-slate-950/70 border border-white/6 flex items-center justify-between gap-3 text-xs transition-colors hover:border-white/12"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-xs">
                          {agent.display_name}
                        </span>
                        {agent.is_installed ? (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Hooked
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 bg-slate-800/40 px-1.5 py-0.2 rounded border border-white/5">
                            Inactive
                          </span>
                        )}
                      </div>
                      {agent.note && (
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">{agent.note}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={agent.is_installed}
                      onClick={() => handleToggleHook(agent.kind, agent.is_installed)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        agent.is_installed ? "bg-emerald-500" : "bg-slate-700"
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
