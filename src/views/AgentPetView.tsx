import { useState, useEffect, type FC } from "react";
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
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PetEvent {
  id: string;
  category: "coding" | "audio" | "vitals" | "system";
  source: string;
  event: string;
  message: string;
  time: string;
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

  // Pet State
  const [selectedPet, setSelectedPet] = useState("code-frenzy-cat");
  const [petEnergy, setPetEnergy] = useState(88);
  const [petMood, setPetMood] = useState(94);
  const [petFocus, setPetFocus] = useState(92);
  const [petHunger, setPetHunger] = useState(76);
  const [petXP, setPetXP] = useState(1850);
  const petLevel = 4;
  const maxXP = 2500;

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
  const handlePet = () => {
    setIsInteracting(true);
    setInteractionAction("purring");
    setPetMood((prev) => Math.min(100, prev + 6));
    setPetXP((prev) => Math.min(maxXP, prev + 15));
    setCurrentQuoteIndex((prev) => (prev + 1) % activeQuotes.length);
    showToast("success", "Pet companion! Mood boosted (+6%) and gained +15 XP");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleCoffee = () => {
    setIsInteracting(true);
    setInteractionAction("coffee");
    setPetEnergy((prev) => Math.min(100, prev + 12));
    setPetFocus((prev) => Math.min(100, prev + 5));
    setPetXP((prev) => Math.min(maxXP, prev + 25));
    showToast("success", "Served Espresso Coffee! Energy (+12%) and Focus boosted");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleTuna = () => {
    setIsInteracting(true);
    setInteractionAction("eating");
    setPetHunger((prev) => Math.min(100, prev + 15));
    setPetMood((prev) => Math.min(100, prev + 4));
    setPetXP((prev) => Math.min(maxXP, prev + 20));
    showToast("success", "Tuna treat served! Hunger satisfied and Happy (+15%)");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleRest = () => {
    setPetEnergy((prev) => Math.min(100, prev + 20));
    setPetMood((prev) => Math.min(100, prev + 10));
    showToast("info", "Quick meditation rest taken. Fatigue cleared.");
  };

  const handleToggleDesktopOverlay = () => {
    const next = !showDesktopOverlay;
    setShowDesktopOverlay(next);
    showToast("info", next ? "Desktop floating companion visible" : "Desktop floating companion hidden");
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
      event: "focus_pulse",
      message: "Coding pulse received from supervisor session. Companion gained +10 XP!",
      time: timeStr,
    };
    setEvents((prev) => [newEvt, ...prev.slice(0, 9)]);
    setPetFocus((prev) => Math.min(100, prev + 4));
    setPetXP((prev) => Math.min(maxXP, prev + 10));
    showToast("success", "Agent ping received! Companion synchronized");
  };

  const handleConfirmReset = () => {
    setPetEnergy(70);
    setPetMood(75);
    setPetFocus(60);
    setPetHunger(50);
    setPetXP(500);
    setIsResetModalOpen(false);
    showToast("info", "Companion progression and vitals reset to defaults.");
  };

  const filteredEvents = events.filter(
    (e) => feedFilter === "all" || e.category === feedFilter
  );

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 shrink-0 pb-1">
        <div className="flex items-center gap-2.5">
          <BadgeComponent variant="default" className="text-xs px-2.5 py-1 font-semibold">
            Level {petLevel} · Master Coder
          </BadgeComponent>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-white/8 text-[11px] text-slate-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-mono">~/.agentpet/agentpet.sock</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BadgeComponent variant="emerald" dot className="px-2.5 py-1 text-xs font-semibold">
            IPC Socket Active (1.2ms)
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
                    showToast("info", `Switched active companion to ${val}`);
                  }}
                  options={[
                    { label: "Code Frenzy Cat (Active)", value: "code-frenzy-cat" },
                    { label: "Boba Dog (Shiba)", value: "boba" },
                    { label: "Shinchan 3 (Action Hero)", value: "shinchan-3" },
                    { label: "Work Blue Cat (Cyber)", value: "work-blue-cat" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold shadow-sm">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>7-Day Coding Streak</span>
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
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-spin" style={{ animationDuration: "8s" }} />
                  <p className="text-xs font-medium text-slate-100 m-0 group-hover:text-sky-200 transition-colors">
                    "{currentQuote}"
                  </p>
                </div>
                {/* Speech arrow tail */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-r border-b border-sky-500/30 transform rotate-45" />
              </div>
            </div>

            {/* Character Stage & Avatar */}
            <div className="relative w-full flex-1 flex items-center justify-center select-none py-2 z-10">
              <div
                onClick={handlePet}
                className={cn(
                  "relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center cursor-pointer transition-transform duration-300 transform",
                  isInteracting && "scale-110",
                  interactionAction === "purring" && "rotate-2",
                  !isInteracting && "hover:scale-105"
                )}
                title="Click companion to interact!"
              >
                {selectedPet === "boba" ? (
                  /* Boba Dog Avatar */
                  <svg viewBox="0 0 160 160" className="w-44 h-44 drop-shadow-[0_12px_28px_rgba(0,0,0,0.6)]">
                    <circle cx="80" cy="80" r="60" fill="#f59e0b" />
                    <circle cx="55" cy="70" r="6" fill="#1e293b" />
                    <circle cx="105" cy="70" r="6" fill="#1e293b" />
                    <ellipse cx="80" cy="88" rx="14" ry="10" fill="#fef3c7" />
                    <ellipse cx="80" cy="84" rx="6" ry="4" fill="#1e293b" />
                    {/* Studio Headphones */}
                    <path d="M 30 75 A 50 50 0 0 1 130 75" fill="none" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" />
                    <rect x="25" y="70" width="12" height="20" rx="4" fill="#0284c7" />
                    <rect x="123" y="70" width="12" height="20" rx="4" fill="#0284c7" />
                    {/* Boba cup */}
                    <rect x="68" y="105" width="24" height="32" rx="4" fill="#38bdf8" opacity="0.85" />
                    <rect x="78" y="95" width="4" height="20" fill="#e0f2fe" />
                    <circle cx="74" cy="128" r="3" fill="#0f172a" />
                    <circle cx="86" cy="128" r="3" fill="#0f172a" />
                    <circle cx="80" cy="124" r="3" fill="#0f172a" />
                  </svg>
                ) : selectedPet === "shinchan-3" ? (
                  /* Shinchan 3 Avatar */
                  <svg viewBox="0 0 160 160" className="w-44 h-44 drop-shadow-[0_12px_28px_rgba(0,0,0,0.6)]">
                    <circle cx="80" cy="75" r="54" fill="#fecdd3" />
                    <ellipse cx="56" cy="68" rx="8" ry="12" fill="#0f172a" />
                    <ellipse cx="104" cy="68" rx="8" ry="12" fill="#0f172a" />
                    <path d="M 45 52 Q 56 46 66 52" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" fill="none" />
                    <path d="M 94 52 Q 104 46 115 52" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" fill="none" />
                    <ellipse cx="80" cy="92" rx="10" ry="6" fill="#e11d48" />
                    {/* Hero Scarf */}
                    <path d="M 40 120 Q 80 140 120 120" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" fill="none" />
                  </svg>
                ) : selectedPet === "work-blue-cat" ? (
                  /* Work Blue Cat (Cyber) */
                  <svg viewBox="0 0 180 180" className="w-48 h-48 drop-shadow-[0_12px_28px_rgba(0,0,0,0.6)]">
                    <polygon points="40,25 65,75 25,65" fill="#1e3a8a" />
                    <polygon points="140,25 115,75 155,65" fill="#1e3a8a" />
                    <ellipse cx="90" cy="85" rx="55" ry="45" fill="#2563eb" />
                    <ellipse cx="70" cy="80" rx="9" ry="12" fill="#38bdf8" />
                    <ellipse cx="110" cy="80" rx="9" ry="12" fill="#38bdf8" />
                    <circle cx="70" cy="80" r="4" fill="#0f172a" />
                    <circle cx="110" cy="80" r="4" fill="#0f172a" />
                    {/* Striped Green Hoodie */}
                    <path d="M 45 130 C 45 105, 135 105, 135 130 L 140 170 L 40 170 Z" fill="#059669" />
                    <line x1="45" y1="140" x2="135" y2="140" stroke="#34d399" strokeWidth="4" />
                    <line x1="42" y1="155" x2="138" y2="155" stroke="#34d399" strokeWidth="4" />
                  </svg>
                ) : (
                  /* Code Frenzy Cat (Default Hero Cat) */
                  <svg viewBox="0 0 180 180" className="w-48 h-48 drop-shadow-[0_16px_32px_rgba(0,0,0,0.7)]">
                    <defs>
                      <linearGradient id="catBody" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="100%" stopColor="#1e293b" />
                      </linearGradient>
                      <linearGradient id="laptopGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                      </linearGradient>
                    </defs>

                    {/* Ears */}
                    <polygon points="45,28 68,76 28,64" fill="url(#catBody)" />
                    <polygon points="50,38 64,70 36,62" fill="#f43f5e" opacity="0.6" />
                    <polygon points="135,28 112,76 152,64" fill="url(#catBody)" />
                    <polygon points="130,38 116,70 144,62" fill="#f43f5e" opacity="0.6" />

                    {/* Head */}
                    <ellipse cx="90" cy="80" rx="52" ry="42" fill="url(#catBody)" />

                    {/* Studio Headphones */}
                    <path d="M 42 75 A 48 48 0 0 1 138 75" fill="none" stroke="#38bdf8" strokeWidth="5.5" strokeLinecap="round" />
                    <rect x="36" y="70" width="10" height="20" rx="4" fill="#0284c7" />
                    <rect x="134" y="70" width="10" height="20" rx="4" fill="#0284c7" />

                    {/* Big Anime Eyes */}
                    <ellipse cx="72" cy="76" rx="8" ry="11" fill="#38bdf8" />
                    <circle cx="74" cy="74" r="3.5" fill="#ffffff" />
                    <ellipse cx="108" cy="76" rx="8" ry="11" fill="#38bdf8" />
                    <circle cx="110" cy="74" r="3.5" fill="#ffffff" />

                    {/* Nose and Whiskers */}
                    <polygon points="90,87 86,83 94,83" fill="#f43f5e" />
                    <path d="M 86 90 Q 90 94 94 90" stroke="#94a3b8" strokeWidth="1.5" fill="none" />
                    <line x1="46" y1="82" x2="26" y2="80" stroke="#64748b" strokeWidth="1.5" />
                    <line x1="48" y1="88" x2="28" y2="92" stroke="#64748b" strokeWidth="1.5" />
                    <line x1="134" y1="82" x2="154" y2="80" stroke="#64748b" strokeWidth="1.5" />
                    <line x1="132" y1="88" x2="152" y2="92" stroke="#64748b" strokeWidth="1.5" />

                    {/* Body */}
                    <ellipse cx="90" cy="135" rx="40" ry="32" fill="url(#catBody)" />

                    {/* Laptop with Neon Screen */}
                    <rect x="58" y="118" width="64" height="42" rx="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                    <rect x="62" y="122" width="56" height="34" rx="2" fill="url(#laptopGlow)" opacity="0.8" />
                    {/* Code lines on screen */}
                    <line x1="68" y1="128" x2="84" y2="128" stroke="#ffffff" strokeWidth="1.5" />
                    <line x1="68" y1="133" x2="108" y2="133" stroke="#e0f2fe" strokeWidth="1.5" />
                    <line x1="68" y1="138" x2="98" y2="138" stroke="#bae6fd" strokeWidth="1.5" />
                    <line x1="68" y1="143" x2="88" y2="143" stroke="#7dd3fc" strokeWidth="1.5" />

                    {/* Typing Paws */}
                    <ellipse cx="65" cy="158" rx="8" ry="6" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
                    <ellipse cx="115" cy="158" rx="8" ry="6" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
                  </svg>
                )}

                {/* Status Micro-Badge */}
                <span className="absolute bottom-1 right-2 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-950/90 border border-sky-400/40 text-sky-300 shadow-lg flex items-center gap-1.5 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    {isInteracting
                      ? interactionAction === "purring"
                        ? "Purring Happily"
                        : interactionAction === "coffee"
                        ? "Energized on Espresso"
                        : "Devouring Tuna"
                      : "Coding Frenzy (142 WPM)"}
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

          {/* Progression Bar & Vitals Cockpit */}
          <div className="rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm space-y-3.5 shrink-0">
            {/* Level & XP Progression Bar */}
            <div className="bg-slate-950/60 border border-white/6 rounded-xl p-3 px-3.5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px]">
                  <Award className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>XP Progression</span>
                </div>
                <span className="text-[11px] font-semibold text-sky-400 tabular-nums">
                  {petXP} / {maxXP} XP
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${(petXP / maxXP) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Headphones className="w-3 h-3 text-sky-400" />
                  Active Perk: Auto-Duck Audio Aura
                </span>
                <span className="text-emerald-400 font-medium">+15 XP / Git Commit</span>
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
                    <Activity className="w-3 h-3 text-sky-400" />
                    Focus
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petFocus}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-sky-300 rounded-full transition-all duration-300"
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
                  <span className="font-semibold text-slate-200 tabular-nums">{petHunger}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-300"
                    style={{ width: `${petHunger}%` }}
                  />
                </div>
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
                  <FolderGit2 className="w-3 h-3 text-sky-400" />
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
                  <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Desktop Floating Overlay</span>
                    <span className="text-[10px] text-slate-400 block">Render animated cat sticker on desktop</span>
                  </div>
                </div>
                <button
                  onClick={handleToggleDesktopOverlay}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer",
                    showDesktopOverlay ? "bg-sky-500" : "bg-slate-800"
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
          <div className="flex-1 flex flex-col rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm min-h-[260px]">
            {/* Console Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-semibold text-slate-200 tracking-tight">
                  Live Activity Stream
                </span>
              </div>

              <ButtonComponent
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2.5 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                onClick={handleSimulatePing}
                leftIcon={<Send className="w-3 h-3 text-sky-400" />}
              >
                Test Ping
              </ButtonComponent>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-slate-950/60 border border-white/6 shrink-0">
              {(["all", "coding", "audio", "vitals"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFeedFilter(cat)}
                  className={cn(
                    "flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all capitalize cursor-pointer",
                    feedFilter === cat
                      ? "bg-slate-800 text-sky-300 shadow-sm border border-white/5"
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
