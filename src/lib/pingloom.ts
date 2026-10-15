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
  category: "ping" | "emote";
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
  { id: "danger", name: "Danger", icon: "pingwheel_retreatrender", color: "#ff3b55", category: "ping" },
  { id: "push", name: "Push", icon: "push", color: "#35d27a", category: "ping" },
  { id: "omw", name: "On My Way", icon: "omw", color: "#2e8bff", category: "ping" },
  { id: "allin", name: "All In", icon: "all_in", color: "#f2b320", category: "ping" },
  { id: "assist", name: "Assist Me", icon: "assist_me", color: "#56d43c", category: "ping" },
  { id: "needvision", name: "Need Vision", icon: "need_vision", color: "#56d43c", category: "ping" },
  { id: "missing", name: "Enemy Missing", icon: "enemy_missing", color: "#f2c518", category: "ping" },
  { id: "enemyvision", name: "Enemy Vision", icon: "enemy_vision", color: "#ff4a3b", category: "ping" },
  { id: "generic", name: "Attention Ping", icon: "generic_alert", color: "#38bdf8", category: "ping" },
  { id: "bait", name: "Bait", icon: "bait", color: "#f59e0b", category: "ping" },
  { id: "visioncleared", name: "Vision Cleared", icon: "vision_cleared", color: "#ec4899", category: "ping" },

  { id: "come_at_me", name: "Come At Me", icon: "come_at_me", color: "#f43f5e", category: "emote" },
  { id: "now_see_here", name: "Now See Here", icon: "now_see_here", color: "#3b82f6", category: "emote" },
  { id: "does_not_compute", name: "Does Not Compute", icon: "does_not_compute", color: "#8b5cf6", category: "emote" },
  { id: "sweating_blitzcrank", name: "Sweating Blitzcrank", icon: "sweating_blitzcrank", color: "#eab308", category: "emote" },
  { id: "unworthy_cn", name: "Unworthy", icon: "unworthy_cn", color: "#ef4444", category: "emote" },
  { id: "gg_heart", name: "GG Heart", icon: "gg_heart", color: "#ec4899", category: "emote" },
  { id: "bee_happy", name: "Bee Happy", icon: "bee_happy", color: "#fbbf24", category: "emote" },
  { id: "bee_mad", name: "Bee Mad", icon: "bee_mad", color: "#f97316", category: "emote" },
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
