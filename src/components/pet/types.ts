import {
  Utensils,
  Trophy,
  Crown,
  Zap,
  Flame,
  PawPrint,
  Compass,
  Shield,
  Award,
  Sparkles,
  Medal,
  Calendar,
  Moon,
} from "@lucide/svelte";

export interface PetEvent {
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
  unlockLevel: number;
}

export type PetMood = "idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy";

export const INSTALLED_PETS: PetArchetype[] = [
  {
    id: "code-frenzy-cat",
    name: "Code Frenzy Cat",
    tag: "Creature",
    description: "Animated cat frantically typing code on a neon laptop in Codex.",
    unlockLevel: 1,
  },
  {
    id: "boba",
    name: "Boba Otter",
    tag: "Creature",
    description: "Tiny otter sipping bubble tea while keeping you company.",
    unlockLevel: 1,
  },
  {
    id: "shinchan-3",
    name: "Shinchan 3",
    tag: "Character",
    description: "Action Hero Crayon Shin-chan checking every line of code.",
    unlockLevel: 2,
  },
  {
    id: "work-blue-cat",
    name: "Cyber Coding Cat",
    tag: "Creature",
    description: "Adult blue cat in striped green hoodie typing at high speed.",
    unlockLevel: 3,
  },
  {
    id: "super-saiyan-goku",
    name: "Super Saiyan Goku",
    tag: "Character",
    description: "Super Saiyan martial artist with golden hair and teal eyes.",
    unlockLevel: 5,
  },
  {
    id: "wode-daodun-3d",
    name: "Sword & Shield Guardian",
    tag: "Creature",
    description: "Goofy guardian with code sword and defensive tech shield.",
    unlockLevel: 8,
  },
  {
    id: "eddy",
    name: "Eddy Educator Bear",
    tag: "Creature",
    description: "Calm educator yellow bear in round glasses and green hoodie.",
    unlockLevel: 10,
  },
];

export interface AchievementMeta {
  id: string;
  name: string;
  description: string;
  icon: typeof Utensils;
}

export const ACHIEVEMENTS_METADATA: AchievementMeta[] = [
  { id: "firstMeal", name: "First Meal", description: "1st finished session", icon: Utensils },
  { id: "sessions100", name: "100 Sessions", description: "Completed 100 sessions", icon: Trophy },
  { id: "sessions500", name: "500 Sessions", description: "Completed 500 sessions", icon: Crown },
  { id: "tokens1M", name: "1M Tokens", description: "Consumed 1,000,000 tokens", icon: Zap },
  { id: "tokens10M", name: "10M Tokens", description: "Consumed 10,000,000 tokens", icon: Flame },
  { id: "tokens50M", name: "50M Tokens", description: "Consumed 50,000,000 tokens", icon: Sparkles },
  { id: "level5", name: "Companion", description: "Evolution Stage 2", icon: PawPrint },
  { id: "level10", name: "Scout", description: "Evolution Stage 3", icon: Compass },
  { id: "level20", name: "Hero", description: "Evolution Stage 4", icon: Shield },
  { id: "level35", name: "Legend", description: "Evolution Stage 5", icon: Medal },
  { id: "streak7", name: "7-Day Streak", description: "7 consecutive days active", icon: Flame },
  { id: "streak14", name: "14-Day Streak", description: "14 consecutive days active", icon: Calendar },
  { id: "streak30", name: "30-Day Streak", description: "30 consecutive days active", icon: Award },
  { id: "nightOwl", name: "Night Owl", description: "Completed task between midnight and 6 AM", icon: Moon },
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

export const SPEECH_QUOTES: Record<string, string[]> = {
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
    "Watching the build pipeline turn green line by line.",
    "Bubble tea refills fuel cleaner code refactors.",
  ],
  "shinchan-3": [
    "Checking every semicolon in the workspace!",
    "Hero mode activated: Let's ship this audio hub update!",
    "Energy is high, keeping the studio console active.",
    "Action hero debugging in progress!",
    "Nobody breaks the build while Action Shin-chan is on watch!",
  ],
  "work-blue-cat": [
    "Cyber-link established. 10-band DSP parametric EQ aligned.",
    "Neon buffer synchronized with active stream routing.",
    "Focus aura at maximum throughput.",
    "CoreAudio pipeline streaming with zero latency jitter.",
    "Coding matrix locked. Compiling release binaries.",
  ],
  "super-saiyan-goku": [
    "Pushing past limits! Kaio-ken compilation speed!",
    "Feel the power of clean code and zero runtime panics!",
    "Train hard, refactor harder. Let's conquer this feature!",
  ],
  "wode-daodun-3d": [
    "Defensive shield raised against null pointers and segfaults!",
    "Sword of static types swinging through the codebase.",
    "Standing guard over your audio routing state.",
  ],
  eddy: [
    "Patience and clarity. Every great codebase is built step by step.",
    "Observing memory allocations with calm focus.",
    "Reviewing test coverage metrics with serene satisfaction.",
  ],
};

export const INITIAL_EVENTS: PetEvent[] = [
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
