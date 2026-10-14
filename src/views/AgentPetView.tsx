import { useState, useEffect, type FC } from "react";
import {
  CardComponent,
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
    message: "Refactoring UI component architecture to Tailwind & custom primitives",
    time: "10:52 AM",
  },
  {
    id: "2",
    category: "vitals",
    source: "agentpet.sock",
    event: "mood_boost",
    message: "Cat gained +15 Focus from clean cargo test run",
    time: "10:50 AM",
  },
  {
    id: "3",
    category: "audio",
    source: "rust-sound",
    event: "registered",
    message: "Desktop audio mixer session connected to AgentPet IPC",
    time: "10:45 AM",
  },
  {
    id: "4",
    category: "coding",
    source: "git:commit",
    event: "milestone",
    message: "Committed core CoreAudio audio tap bindings (+50 XP)",
    time: "10:30 AM",
  },
  {
    id: "5",
    category: "audio",
    source: "audio:router",
    event: "auto_duck",
    message: "Background audio ducked during high-focus coding burst",
    time: "10:15 AM",
  },
];

const SPEECH_QUOTES: Record<string, string[]> = {
  "code-frenzy-cat": [
    "Clacking away on these Rust traits! Purrrfect!",
    "Zero compiler warnings, maximum happiness!",
    "Remember to hydrate between compiler passes!",
    "Need another espresso to optimize this hot loop ☕",
    "Tail is wagging to the beat of your music!",
  ],
  boba: [
    "Slurping boba tea while reading your pull request!",
    "Such clean code! Much wow, very elegant!",
    "Boba level is 100%, ready to assist!",
  ],
  "shinchan-3": [
    "Hehehe! Is this bug hiding behind the semicolon?",
    "Action Kamen says: Ship it on Friday!",
    "Snack time! Can we have Chocobi biscuits?",
  ],
  "work-blue-cat": [
    "Cyber-link established. Audio EQ aligned to 48kHz.",
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
    showToast("success", "Pet companion! Mood boosted (+6%) & gained +15 XP ❤️");
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
    showToast("success", "Served Espresso Coffee! Energy (+12%) & Focus boosted ☕⚡");
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
    showToast("success", "Tuna treat devoured! Hunger satisfied & Happy (+15%) 🐟");
    setTimeout(() => {
      setIsInteracting(false);
      setInteractionAction(null);
    }, 1000);
  };

  const handleRest = () => {
    setPetEnergy((prev) => Math.min(100, prev + 20));
    setPetMood((prev) => Math.min(100, prev + 10));
    showToast("info", "Quick meditation rest taken. Fatigue cleared 🧘");
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
      message: "Coding pulse received from supervisor session. Cat gained +10 XP!",
      time: timeStr,
    };
    setEvents((prev) => [newEvt, ...prev.slice(0, 7)]);
    setPetFocus((prev) => Math.min(100, prev + 4));
    setPetXP((prev) => Math.min(maxXP, prev + 10));
    showToast("success", "Agent ping received! Companion synchronized 🚀");
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
    <div className="w-full select-none space-y-5 max-w-6xl mx-auto">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-white/8 gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold tracking-tight text-slate-100 m-0">
              Agent Pet Companion
            </h2>
            <BadgeComponent variant="default" className="text-[10px] px-2 py-0.5">
              Level {petLevel} · Master Coder
            </BadgeComponent>
          </div>
          <p className="text-xs text-slate-400 mt-1 m-0">
            Interactive virtual companion reacting to your coding sessions, git workflows & CoreAudio audio streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <BadgeComponent variant="emerald" dot className="px-2.5 py-1 text-xs font-semibold">
            IPC Socket Active
          </BadgeComponent>
          <ButtonComponent
            variant="ghost"
            size="sm"
            onClick={() => setIsResetModalOpen(true)}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-400" />}
            title="Reset companion stats"
          >
            Reset
          </ButtonComponent>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): Companion Character & Vitals */}
        <div className="lg:col-span-7 space-y-4">
          <CardComponent
            variant="default"
            padding="lg"
            className="flex flex-col items-center relative overflow-hidden bg-gradient-to-b from-[#141b26] via-[#10141d] to-[#0c0f17] border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
          >
            {/* Header: Selector & Streak */}
            <div className="flex items-center justify-between w-full mb-3 gap-2">
              <div className="w-56 min-w-0">
                <SelectComponent
                  value={selectedPet}
                  onChange={(val) => {
                    setSelectedPet(val);
                    showToast("info", `Switched active companion to ${val}`);
                  }}
                  options={[
                    { label: "Code Frenzy Cat (Active)", value: "code-frenzy-cat" },
                    { label: "Boba Dog (Shiba)", value: "boba" },
                    { label: "Shinchan 3 (Action)", value: "shinchan-3" },
                    { label: "Work Blue Cat (Cyber)", value: "work-blue-cat" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>7d Streak 🔥</span>
              </div>
            </div>

            {/* Interactive Speech Bubble */}
            <div className="relative max-w-md w-full my-1 z-10">
              <div
                onClick={() => setCurrentQuoteIndex((prev) => (prev + 1) % activeQuotes.length)}
                className="relative bg-slate-900/90 border border-sky-500/30 rounded-2xl p-3 px-4 shadow-[0_4px_20px_rgba(56,189,248,0.15)] backdrop-blur-md cursor-pointer hover:border-sky-400/50 transition-all text-center group"
                title="Click to hear another thought!"
              >
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-spin" style={{ animationDuration: "6s" }} />
                  <p className="text-xs font-medium text-slate-100 m-0 group-hover:text-sky-200 transition-colors">
                    "{currentQuote}"
                  </p>
                </div>
                {/* Speech tail */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-r border-b border-sky-500/30 transform rotate-45" />
              </div>
            </div>

            {/* Visual Avatar Character Display */}
            <div className="relative w-full max-w-sm h-56 flex items-center justify-center my-3 select-none">
              {/* Ambient radial aura */}
              <div
                className={cn(
                  "absolute inset-0 rounded-full blur-3xl transition-all duration-700 pointer-events-none",
                  audioReactive
                    ? "bg-gradient-to-tr from-sky-500/20 via-emerald-500/15 to-purple-500/20 animate-pulse"
                    : "bg-sky-500/10"
                )}
              />

              {/* Character Illustration */}
              <div
                onClick={handlePet}
                className={cn(
                  "relative w-48 h-48 flex items-center justify-center cursor-pointer transition-transform duration-300 transform",
                  isInteracting && "scale-110",
                  interactionAction === "purring" && "rotate-2",
                  !isInteracting && "hover:scale-105"
                )}
                title="Click to pet!"
              >
                {selectedPet === "boba" ? (
                  /* Boba Dog Avatar */
                  <svg viewBox="0 0 160 160" className="w-40 h-40 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]">
                    <circle cx="80" cy="80" r="60" fill="#f59e0b" />
                    <circle cx="55" cy="70" r="6" fill="#1e293b" />
                    <circle cx="105" cy="70" r="6" fill="#1e293b" />
                    <ellipse cx="80" cy="88" rx="14" ry="10" fill="#fef3c7" />
                    <ellipse cx="80" cy="84" rx="6" ry="4" fill="#1e293b" />
                    {/* Boba cup */}
                    <rect x="68" y="105" width="24" height="32" rx="4" fill="#38bdf8" opacity="0.85" />
                    <rect x="78" y="95" width="4" height="20" fill="#e0f2fe" />
                    <circle cx="74" cy="128" r="3" fill="#0f172a" />
                    <circle cx="86" cy="128" r="3" fill="#0f172a" />
                    <circle cx="80" cy="124" r="3" fill="#0f172a" />
                  </svg>
                ) : selectedPet === "shinchan-3" ? (
                  /* Shinchan Style Avatar */
                  <svg viewBox="0 0 160 160" className="w-40 h-40 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]">
                    <ellipse cx="80" cy="80" rx="55" ry="50" fill="#fed7aa" />
                    {/* Eyebrows */}
                    <rect x="42" y="52" width="24" height="8" rx="4" fill="#0f172a" transform="rotate(-6 54 56)" />
                    <rect x="94" y="52" width="24" height="8" rx="4" fill="#0f172a" transform="rotate(6 106 56)" />
                    {/* Eyes */}
                    <circle cx="54" cy="72" r="7" fill="#0f172a" />
                    <circle cx="56" cy="70" r="2.5" fill="#ffffff" />
                    <circle cx="106" cy="72" r="7" fill="#0f172a" />
                    <circle cx="108" cy="70" r="2.5" fill="#ffffff" />
                    {/* Blush */}
                    <circle cx="42" cy="85" r="9" fill="#f43f5e" opacity="0.4" />
                    <circle cx="118" cy="85" r="9" fill="#f43f5e" opacity="0.4" />
                    {/* Grin */}
                    <path d="M 70 95 Q 80 108 90 95" stroke="#0f172a" strokeWidth="3" fill="none" />
                  </svg>
                ) : selectedPet === "work-blue-cat" ? (
                  /* Cyber Blue Cat with Headphones */
                  <svg viewBox="0 0 160 160" className="w-40 h-40 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]">
                    {/* Ears */}
                    <polygon points="40,25 65,65 25,65" fill="#0284c7" />
                    <polygon points="120,25 95,65 135,65" fill="#0284c7" />
                    {/* Face */}
                    <ellipse cx="80" cy="80" rx="52" ry="46" fill="#0ea5e9" />
                    {/* Eyes glowing */}
                    <ellipse cx="58" cy="76" rx="8" ry="10" fill="#38bdf8" />
                    <ellipse cx="102" cy="76" rx="8" ry="10" fill="#38bdf8" />
                    {/* Headphones band */}
                    <path d="M 30 75 Q 80 10 130 75" stroke="#38bdf8" strokeWidth="8" fill="none" />
                    <rect x="22" y="65" width="16" height="30" rx="6" fill="#0369a1" />
                    <rect x="122" y="65" width="16" height="30" rx="6" fill="#0369a1" />
                  </svg>
                ) : (
                  /* Code Frenzy Cat (Desktop Pet Style) */
                  <svg viewBox="0 0 180 180" className="w-44 h-44 drop-shadow-[0_14px_30px_rgba(0,0,0,0.7)]">
                    {/* Cat Ears */}
                    <polygon points="48,25 72,65 32,65" fill="#475569" />
                    <polygon points="48,32 66,62 36,62" fill="#f472b6" opacity="0.75" />
                    <polygon points="132,25 108,65 148,65" fill="#475569" />
                    <polygon points="132,32 114,62 144,62" fill="#f472b6" opacity="0.75" />

                    {/* Cat Head */}
                    <ellipse cx="90" cy="75" rx="55" ry="48" fill="#64748b" />
                    <ellipse cx="90" cy="82" rx="30" ry="22" fill="#94a3b8" />

                    {/* Cat Eyes */}
                    <ellipse cx="68" cy="72" rx="7" ry="9" fill="#0f172a" />
                    <circle cx="70" cy="70" r="2.5" fill="#ffffff" />
                    <ellipse cx="112" cy="72" rx="7" ry="9" fill="#0f172a" />
                    <circle cx="114" cy="70" r="2.5" fill="#ffffff" />

                    {/* Snout & Whiskers */}
                    <polygon points="90,83 86,79 94,79" fill="#ec4899" />
                    <line x1="42" y1="80" x2="22" y2="76" stroke="#94a3b8" strokeWidth="2" />
                    <line x1="42" y1="86" x2="20" y2="88" stroke="#94a3b8" strokeWidth="2" />
                    <line x1="138" y1="80" x2="158" y2="76" stroke="#94a3b8" strokeWidth="2" />
                    <line x1="138" y1="86" x2="160" y2="88" stroke="#94a3b8" strokeWidth="2" />

                    {/* Green Knit Sweater (like the sticker) */}
                    <path
                      d="M 52 110 Q 90 102 128 110 L 138 165 L 42 165 Z"
                      fill="#10b981"
                      stroke="#059669"
                      strokeWidth="2"
                    />
                    {/* Sweater collar stitches */}
                    <path d="M 68 110 Q 90 120 112 110" stroke="#047857" strokeWidth="3" fill="none" />

                    {/* Mini Laptop */}
                    <rect
                      x="56"
                      y="126"
                      width="68"
                      height="38"
                      rx="4"
                      fill="#0f172a"
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />
                    {/* Laptop Screen glowing */}
                    <rect x="60" y="130" width="60" height="26" rx="2" fill="#0369a1" />
                    {/* Code lines on screen */}
                    <line x1="64" y1="136" x2="80" y2="136" stroke="#38bdf8" strokeWidth="1.5" />
                    <line x1="64" y1="141" x2="105" y2="141" stroke="#a7f3d0" strokeWidth="1.5" />
                    <line x1="64" y1="146" x2="95" y2="146" stroke="#fbcfe8" strokeWidth="1.5" />
                    <line x1="64" y1="151" x2="75" y2="151" stroke="#fde047" strokeWidth="1.5" />

                    {/* Fast Typing Cat Paws */}
                    <ellipse cx="65" cy="158" rx="8" ry="6" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
                    <ellipse cx="115" cy="158" rx="8" ry="6" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
                  </svg>
                )}

                {/* Status Float Badge */}
                <span className="absolute bottom-1 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/80 border border-white/10 text-sky-400 shadow-md">
                  {isInteracting
                    ? interactionAction === "purring"
                      ? "Purring... 🐾"
                      : interactionAction === "coffee"
                      ? "Energized! ☕"
                      : "Nom Nom 🐟"
                    : "Coding Frenzy"}
                </span>
              </div>
            </div>

            {/* Level & XP Progression Bar */}
            <div className="w-full max-w-md bg-slate-950/60 border border-white/6 rounded-xl p-3 px-3.5 mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
                  <Award className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>XP Progress</span>
                </div>
                <span className="text-[11px] font-semibold text-sky-400 tabular-nums">
                  {petXP} / {maxXP} XP
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${(petXP / maxXP) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10px] text-slate-400">
                <span>Active Perk: Auto-Duck Audio Aura</span>
                <span className="text-emerald-400 font-medium">+15 XP / Commit</span>
              </div>
            </div>

            {/* 4 Core Vitals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-md">
              {/* Energy */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Energy
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petEnergy}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${petEnergy}%` }}
                  />
                </div>
              </div>

              {/* Mood */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-rose-400" />
                    Mood
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petMood}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-400 rounded-full transition-all duration-300"
                    style={{ width: `${petMood}%` }}
                  />
                </div>
              </div>

              {/* Focus */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-sky-400" />
                    Focus
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petFocus}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full transition-all duration-300"
                    style={{ width: `${petFocus}%` }}
                  />
                </div>
              </div>

              {/* Hunger */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Fish className="w-3 h-3 text-emerald-400" />
                    Hunger
                  </span>
                  <span className="font-semibold text-slate-200 tabular-nums">{petHunger}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${petHunger}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tactical Pet Care Actions */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-3 border-t border-white/8 w-full max-w-md">
              <ButtonComponent
                variant="primary"
                size="sm"
                onClick={handlePet}
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-slate-950" />}
              >
                Pet Companion
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleCoffee}
                leftIcon={<Coffee className="w-3.5 h-3.5 text-amber-400" />}
              >
                Give Coffee (+12%)
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleTuna}
                leftIcon={<Fish className="w-3.5 h-3.5 text-emerald-400" />}
              >
                Feed Tuna (+15%)
              </ButtonComponent>

              <ButtonComponent
                variant="ghost"
                size="sm"
                onClick={handleRest}
                leftIcon={<Moon className="w-3.5 h-3.5 text-purple-400" />}
              >
                Rest
              </ButtonComponent>
            </div>
          </CardComponent>
        </div>

        {/* Right Column (5 cols): Socket Bridge Settings & Real-Time Feed */}
        <div className="lg:col-span-5 space-y-4">
          {/* Socket & Desktop Floating Integration Card */}
          <CardComponent
            title="IPC Socket & Desktop Bridge"
            subtitle="Unix Domain Socket ~/.agentpet/agentpet.sock"
            extra={<Radio className="w-4 h-4 text-emerald-400 animate-pulse" />}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                <div>
                  <span className="text-[10px] text-slate-400 block">Connection State</span>
                  <span className="text-emerald-400 font-semibold text-[11px]">Connected (1.2 ms)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Target Agent</span>
                  <span className="text-slate-200 font-semibold text-[11px]">pi:coding-agent</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                {/* Desktop Floating Overlay Toggle */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-white/4">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">Desktop Floating Overlay</span>
                      <span className="text-[10px] text-slate-400 block">Render cat sticker on desktop</span>
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
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-white/4">
                  <div className="flex items-center gap-2">
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
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-white/4">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">Break Timer Sync</span>
                      <span className="text-[10px] text-slate-400 block">Duck audio & rest during breaks</span>
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
          </CardComponent>

          {/* Activity Feed with Category Filtering */}
          <CardComponent
            title="Live Activity Stream"
            subtitle="Recent IPC events and workflow signals"
            extra={
              <ButtonComponent
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2 text-sky-400"
                onClick={handleSimulatePing}
                leftIcon={<Send className="w-3 h-3 text-sky-400" />}
              >
                Test Ping
              </ButtonComponent>
            }
          >
            {/* Filter Pills */}
            <div className="flex items-center gap-1 mb-3 p-1 rounded-lg bg-slate-950/60 border border-white/6">
              {(["all", "coding", "audio", "vitals"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFeedFilter(cat)}
                  className={cn(
                    "flex-1 py-1 text-[11px] font-semibold rounded-md transition-all capitalize cursor-pointer",
                    feedFilter === cat
                      ? "bg-[#1f2838] text-sky-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Event List */}
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-xl bg-slate-950/60 border border-white/6 flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-white/12"
                >
                  <div className="flex items-start gap-2 min-w-0">
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
          </CardComponent>
        </div>
      </div>

      {/* Confirmation Modal for Resetting Progression */}
      <ModalComponent
        open={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Companion Progression?"
        description="Are you sure you want to reset your pet's Level, XP, and vitals back to default levels? This action cannot be undone."
        confirmText="Reset Progress"
        confirmVariant="destructive"
        onConfirm={handleConfirmReset}
      />
    </div>
  );
};
