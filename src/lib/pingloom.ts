export type TriggerKey =
  | "alt"
  | "g"
  | "v"
  | "ctrl"
  | "shift"
  | "win"
  | "caps_lock"
  | "mouse4"
  | "mouse5";

export interface PingloomSettings {
  version: number;
  enabled_on_start: boolean;
  trigger: string;
  emote_trigger: string | null;
  drag_threshold_px: number;
  click_ping: boolean;
  click_ping_id: string;
  game_check: boolean;
  wheel: string[];
  ping_size_px: number;
  ping_duration_s: number;
  volume: number;
  muted: boolean;
  tick_sound: boolean;
  emote_click: boolean;
  click_emote_id: string;
  emote_wheel: string[];
  emote_size_px: number;
  emote_sound: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: "tactical" | "objectives" | "emotes" | "audio" | "ping" | "emote";
  badge?: string;
}

export interface GestureResult {
  slice_index: number;
  direction: string;
  ping_id: string;
  ping_name: string;
  color: string;
}

export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type DirectionCode = (typeof DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<DirectionCode, string> = {
  N: "North",
  NE: "North-East",
  E: "East",
  SE: "South-East",
  S: "South",
  SW: "South-West",
  W: "West",
  NW: "North-West",
};

export const TRIGGERS: { value: TriggerKey; label: string }[] = [
  { value: "alt", label: "Alt / Option (LoL Smart Ping Default)" },
  { value: "g", label: "G Key (LoL Quick Ping Key)" },
  { value: "v", label: "V Key (LoL Retreat / Danger Ping)" },
  { value: "ctrl", label: "Control" },
  { value: "shift", label: "Shift" },
  { value: "win", label: "Command / Super" },
  { value: "caps_lock", label: "Caps Lock" },
  { value: "mouse4", label: "Mouse 4 (Back)" },
  { value: "mouse5", label: "Mouse 5 (Forward)" },
];

export const DEFAULT_PING_WHEEL = [
  "danger",
  "push",
  "omw",
  "allin",
  "assist",
  "needvision",
  "missing",
  "enemyvision",
];

export const DEFAULT_EMOTE_WHEEL = [
  "come_at_me",
  "now_see_here",
  "does_not_compute",
  "sweating_blitzcrank",
  "unworthy_cn",
  "gg_heart",
  "bee_happy",
  "bee_mad",
];

export const DEFAULT_PINGLOOM_SETTINGS: PingloomSettings = {
  version: 1,
  enabled_on_start: true,
  trigger: "alt",
  emote_trigger: "ctrl",
  drag_threshold_px: 86,
  click_ping: true,
  click_ping_id: "danger",
  game_check: false,
  wheel: [...DEFAULT_PING_WHEEL],
  ping_size_px: 52,
  ping_duration_s: 3.0,
  volume: 75,
  muted: false,
  tick_sound: true,
  emote_click: false,
  click_emote_id: "gg_heart",
  emote_wheel: [...DEFAULT_EMOTE_WHEEL],
  emote_size_px: 64,
  emote_sound: true,
};

export const DEFAULT_CATALOG: CatalogEntry[] = [
  // 1. Core Tactical LoL Pings
  { id: "danger", name: "Danger / Retreat", icon: "pingwheel_retreatrender", color: "#ff3b55", category: "tactical", badge: "⚠️" },
  { id: "push", name: "Push Lane", icon: "push", color: "#35d27a", category: "tactical", badge: "⏩" },
  { id: "omw", name: "On My Way", icon: "omw", color: "#2e8bff", category: "tactical", badge: "👟" },
  { id: "allin", name: "All In / Engage", icon: "all_in", color: "#f2b320", category: "tactical", badge: "⚔️" },
  { id: "assist", name: "Assist Me", icon: "assist_me", color: "#56d43c", category: "tactical", badge: "🆘" },
  { id: "needvision", name: "Need Vision", icon: "need_vision", color: "#56d43c", category: "tactical", badge: "👁️" },
  { id: "missing", name: "Enemy Missing", icon: "enemy_missing", color: "#f2c518", category: "tactical", badge: "❓" },
  { id: "enemyvision", name: "Enemy Vision Here", icon: "enemy_vision", color: "#ff4a3b", category: "tactical", badge: "⚠️👁️" },
  { id: "generic", name: "Attention / Alert", icon: "generic_alert", color: "#38bdf8", category: "tactical", badge: "🎯" },
  { id: "bait", name: "Bait Enemy", icon: "bait", color: "#f59e0b", category: "tactical", badge: "🪤" },
  { id: "visioncleared", name: "Vision Cleared", icon: "vision_cleared", color: "#ec4899", category: "tactical", badge: "✨" },
  { id: "retreat", name: "Fall Back", icon: "retreat", color: "#ef4444", category: "tactical", badge: "🛡️" },
  { id: "target_enemy", name: "Target Focus", icon: "target_focus", color: "#e11d48", category: "tactical", badge: "🎯" },
  { id: "hold_position", name: "Hold Position", icon: "hold_pos", color: "#6366f1", category: "tactical", badge: "⚓" },
  { id: "heal_me", name: "Need Heal", icon: "heal", color: "#10b981", category: "tactical", badge: "💚" },
  { id: "out_of_mana", name: "Out of Mana", icon: "mana", color: "#0ea5e9", category: "tactical", badge: "💧" },
  { id: "ult_ready", name: "Ultimate Ready", icon: "ult_ready", color: "#a855f7", category: "tactical", badge: "⚡" },

  // 2. Map Objectives & Targets
  { id: "baron", name: "Baron Nashor", icon: "baron", color: "#a855f7", category: "objectives", badge: "👾" },
  { id: "dragon", name: "Elder Dragon", icon: "dragon", color: "#f97316", category: "objectives", badge: "🐉" },
  { id: "herald", name: "Rift Herald", icon: "herald", color: "#ec4899", category: "objectives", badge: "🦀" },
  { id: "turret", name: "Tower / Turret", icon: "turret", color: "#f59e0b", category: "objectives", badge: "🏰" },
  { id: "ward_pink", name: "Control Ward", icon: "ward_pink", color: "#f43f5e", category: "objectives", badge: "🔮" },
  { id: "ward_yellow", name: "Stealth Ward", icon: "ward_yellow", color: "#eab308", category: "objectives", badge: "🏮" },
  { id: "group_up", name: "Group Up Now", icon: "group", color: "#06b6d4", category: "objectives", badge: "👥" },
  { id: "farm_wave", name: "Catch Minion Wave", icon: "farm", color: "#84cc16", category: "objectives", badge: "🌾" },

  // 3. Emotes & Expressions
  { id: "come_at_me", name: "Come At Me", icon: "come_at_me", color: "#f43f5e", category: "emotes", badge: "🥊" },
  { id: "now_see_here", name: "Now See Here", icon: "now_see_here", color: "#3b82f6", category: "emotes", badge: "🧐" },
  { id: "does_not_compute", name: "Does Not Compute", icon: "does_not_compute", color: "#8b5cf6", category: "emotes", badge: "🤖" },
  { id: "sweating_blitzcrank", name: "Sweating Blitz", icon: "sweating_blitzcrank", color: "#eab308", category: "emotes", badge: "😰" },
  { id: "unworthy_cn", name: "Unworthy", icon: "unworthy_cn", color: "#ef4444", category: "emotes", badge: "👎" },
  { id: "gg_heart", name: "GG Heart", icon: "gg_heart", color: "#ec4899", category: "emotes", badge: "💖" },
  { id: "bee_happy", name: "Bee Happy", icon: "bee_happy", color: "#fbbf24", category: "emotes", badge: "🐝" },
  { id: "bee_mad", name: "Bee Mad", icon: "bee_mad", color: "#f97316", category: "emotes", badge: "😡" },
  { id: "thumbs_up", name: "Thumbs Up", icon: "thumbs_up", color: "#22c55e", category: "emotes", badge: "👍" },
  { id: "mind_blown", name: "Mind Blown", icon: "mind_blown", color: "#ec4899", category: "emotes", badge: "🤯" },
  { id: "thinking", name: "Thinking Face", icon: "thinking", color: "#06b6d4", category: "emotes", badge: "🤔" },
  { id: "crown_champ", name: "Champion Crown", icon: "crown", color: "#eab308", category: "emotes", badge: "👑" },
  { id: "hundred", name: "100 Percent", icon: "hundred", color: "#ef4444", category: "emotes", badge: "💯" },
  { id: "flex_muscle", name: "Flex Muscle", icon: "flex", color: "#f59e0b", category: "emotes", badge: "💪" },
  { id: "skull_rip", name: "RIP Skull", icon: "skull", color: "#94a3b8", category: "emotes", badge: "💀" },

  // 4. Audio & Studio Callouts
  { id: "mic_on", name: "Mic Open", icon: "mic_on", color: "#10b981", category: "audio", badge: "🎙️" },
  { id: "mic_off", name: "Mic Muted", icon: "mic_off", color: "#f43f5e", category: "audio", badge: "🔇" },
  { id: "vol_boost", name: "Volume Boost", icon: "vol_boost", color: "#8b5cf6", category: "audio", badge: "🔊" },
  { id: "bass_kick", name: "Bass Drop", icon: "bass_kick", color: "#f59e0b", category: "audio", badge: "🎛️" },
  { id: "studio_eq", name: "Studio Acoustic", icon: "studio_eq", color: "#38bdf8", category: "audio", badge: "🎧" },
];

export function duplicateSlots(values: string[]): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      duplicates.add(index);
    } else {
      seen.add(value);
    }
  });
  return duplicates;
}

export function formatAssetName(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Annular sector path helper for circular radial wheel SVG (angles in radians, 0 = top/North, clockwise).
 */
export function sectorPath(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  aStart: number,
  aEnd: number
): string {
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  const largeArc = Math.abs(aEnd - aStart) > Math.PI ? 1 : 0;
  return `M ${p(rIn, aStart)} L ${p(rOut, aStart)} A ${rOut} ${rOut} 0 ${largeArc} 1 ${p(
    rOut,
    aEnd
  )} L ${p(rIn, aEnd)} A ${rIn} ${rIn} 0 ${largeArc} 0 ${p(rIn, aStart)} Z`;
}
