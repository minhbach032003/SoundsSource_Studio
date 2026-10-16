import { invoke, isTauri } from "@tauri-apps/api/core";

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
  vectorIcon?: string;
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
  drag_threshold_px: 38,
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
  { id: "danger", name: "Danger / Retreat", icon: "pingwheel_retreatrender", color: "#ff3b55", category: "tactical", vectorIcon: "alert-triangle" },
  { id: "push", name: "Push Lane", icon: "push", color: "#35d27a", category: "tactical", vectorIcon: "fast-forward" },
  { id: "omw", name: "On My Way", icon: "omw", color: "#2e8bff", category: "tactical", vectorIcon: "navigation" },
  { id: "allin", name: "All In / Engage", icon: "all_in", color: "#f2b320", category: "tactical", vectorIcon: "swords" },
  { id: "assist", name: "Assist Me", icon: "assist_me", color: "#56d43c", category: "tactical", vectorIcon: "life-buoy" },
  { id: "needvision", name: "Need Vision", icon: "need_vision", color: "#56d43c", category: "tactical", vectorIcon: "eye" },
  { id: "missing", name: "Enemy Missing", icon: "enemy_missing", color: "#f2c518", category: "tactical", vectorIcon: "help-circle" },
  { id: "enemyvision", name: "Enemy Vision Here", icon: "enemy_vision", color: "#ff4a3b", category: "tactical", vectorIcon: "eye-off" },
  { id: "generic", name: "Attention / Alert", icon: "generic_alert", color: "#38bdf8", category: "tactical", vectorIcon: "crosshair" },
  { id: "bait", name: "Bait Enemy", icon: "bait", color: "#f59e0b", category: "tactical", vectorIcon: "fish" },
  { id: "visioncleared", name: "Vision Cleared", icon: "vision_cleared", color: "#ec4899", category: "tactical", vectorIcon: "sparkles" },
  { id: "retreat", name: "Fall Back", icon: "retreat", color: "#ef4444", category: "tactical", vectorIcon: "shield-alert" },
  { id: "target_enemy", name: "Target Focus", icon: "target_focus", color: "#e11d48", category: "tactical", vectorIcon: "target" },
  { id: "hold_position", name: "Hold Position", icon: "hold_pos", color: "#6366f1", category: "tactical", vectorIcon: "anchor" },
  { id: "heal_me", name: "Need Heal", icon: "heal", color: "#10b981", category: "tactical", vectorIcon: "heart-pulse" },
  { id: "out_of_mana", name: "Out of Mana", icon: "mana", color: "#0ea5e9", category: "tactical", vectorIcon: "droplets" },
  { id: "ult_ready", name: "Ultimate Ready", icon: "ult_ready", color: "#a855f7", category: "tactical", vectorIcon: "zap" },

  // 2. Map Objectives & Targets
  { id: "baron", name: "Baron Nashor", icon: "baron", color: "#a855f7", category: "objectives", vectorIcon: "skull" },
  { id: "dragon", name: "Elder Dragon", icon: "dragon", color: "#f97316", category: "objectives", vectorIcon: "flame" },
  { id: "herald", name: "Rift Herald", icon: "herald", color: "#ec4899", category: "objectives", vectorIcon: "shield" },
  { id: "turret", name: "Tower / Turret", icon: "turret", color: "#f59e0b", category: "objectives", vectorIcon: "castle" },
  { id: "ward_pink", name: "Control Ward", icon: "ward_pink", color: "#f43f5e", category: "objectives", vectorIcon: "eye" },
  { id: "ward_yellow", name: "Stealth Ward", icon: "ward_yellow", color: "#eab308", category: "objectives", vectorIcon: "lamp" },
  { id: "group_up", name: "Group Up Now", icon: "group", color: "#06b6d4", category: "objectives", vectorIcon: "users" },
  { id: "farm_wave", name: "Catch Minion Wave", icon: "farm", color: "#84cc16", category: "objectives", vectorIcon: "wheat" },

  // 3. Emotes & Expressions
  { id: "come_at_me", name: "Come At Me", icon: "come_at_me", color: "#f43f5e", category: "emotes", vectorIcon: "swords" },
  { id: "now_see_here", name: "Now See Here", icon: "now_see_here", color: "#3b82f6", category: "emotes", vectorIcon: "glasses" },
  { id: "does_not_compute", name: "Does Not Compute", icon: "does_not_compute", color: "#8b5cf6", category: "emotes", vectorIcon: "bot" },
  { id: "sweating_blitzcrank", name: "Sweating Blitz", icon: "sweating_blitzcrank", color: "#eab308", category: "emotes", vectorIcon: "smile" },
  { id: "unworthy_cn", name: "Unworthy", icon: "unworthy_cn", color: "#ef4444", category: "emotes", vectorIcon: "thumbs-down" },
  { id: "gg_heart", name: "GG Heart", icon: "gg_heart", color: "#ec4899", category: "emotes", vectorIcon: "heart" },
  { id: "bee_happy", name: "Bee Happy", icon: "bee_happy", color: "#fbbf24", category: "emotes", vectorIcon: "smile" },
  { id: "bee_mad", name: "Bee Mad", icon: "bee_mad", color: "#f97316", category: "emotes", vectorIcon: "frown" },
  { id: "bee_sad", name: "Bee Sad", icon: "bee_sad", color: "#38bdf8", category: "emotes", vectorIcon: "frown" },
  { id: "angry_kitty", name: "Angry Kitty", icon: "angry_kitty", color: "#f43f5e", category: "emotes", vectorIcon: "frown" },
  { id: "call_me", name: "Call Me", icon: "call_me", color: "#06b6d4", category: "emotes", vectorIcon: "phone" },
  { id: "cheeky_poro", name: "Cheeky Poro", icon: "cheeky_poro", color: "#a855f7", category: "emotes", vectorIcon: "smile" },
  { id: "come_again", name: "Come Again", icon: "come_again", color: "#6366f1", category: "emotes", vectorIcon: "help-circle" },
  { id: "despair", name: "Despair", icon: "despair", color: "#64748b", category: "emotes", vectorIcon: "frown" },
  { id: "did_you_just", name: "Did You Just", icon: "did_you_just", color: "#f59e0b", category: "emotes", vectorIcon: "alert-circle" },
  { id: "dont_make_me_laugh", name: "Don't Make Me Laugh", icon: "dont_make_me_laugh", color: "#ec4899", category: "emotes", vectorIcon: "smile" },
  { id: "facepalm", name: "Facepalm", icon: "facepalm", color: "#ef4444", category: "emotes", vectorIcon: "hand" },
  { id: "gasp", name: "Gasp", icon: "gasp", color: "#3b82f6", category: "emotes", vectorIcon: "sparkles" },
  { id: "good_job_buddy", name: "Good Job Buddy", icon: "good_job_buddy", color: "#22c55e", category: "emotes", vectorIcon: "thumbs-up" },
  { id: "haha_hilarious", name: "Haha Hilarious", icon: "haha_hilarious", color: "#eab308", category: "emotes", vectorIcon: "smile" },
  { id: "hats_off", name: "Hats Off", icon: "hats_off", color: "#8b5cf6", category: "emotes", vectorIcon: "crown" },
  { id: "how_could_you", name: "How Could You", icon: "how_could_you", color: "#f43f5e", category: "emotes", vectorIcon: "heart-crack" },
  { id: "i_will_destroy_you", name: "Destroy You", icon: "i_will_destroy_you", color: "#ef4444", category: "emotes", vectorIcon: "flame" },
  { id: "laughing_out_loud", name: "Laughing Out Loud", icon: "laughing_out_loud", color: "#fbbf24", category: "emotes", vectorIcon: "smile" },
  { id: "let_s_do_this", name: "Let's Do This", icon: "let_s_do_this", color: "#3b82f6", category: "emotes", vectorIcon: "zap" },
  { id: "long_road_ahead", name: "Long Road Ahead", icon: "long_road_ahead", color: "#64748b", category: "emotes", vectorIcon: "compass" },
  { id: "magpie_oopsie", name: "Magpie Oopsie", icon: "magpie_oopsie", color: "#f59e0b", category: "emotes", vectorIcon: "help-circle" },
  { id: "maybe_next_time", name: "Maybe Next Time", icon: "maybe_next_time", color: "#94a3b8", category: "emotes", vectorIcon: "rotate-ccw" },
  { id: "nice", name: "Nice", icon: "nice", color: "#22c55e", category: "emotes", vectorIcon: "check" },
  { id: "nice_try", name: "Nice Try", icon: "nice_try", color: "#38bdf8", category: "emotes", vectorIcon: "thumbs-up" },
  { id: "not_today", name: "Not Today", icon: "not_today", color: "#ef4444", category: "emotes", vectorIcon: "shield-alert" },
  { id: "oh", name: "Oh", icon: "oh", color: "#06b6d4", category: "emotes", vectorIcon: "help-circle" },
  { id: "okay", name: "Okay", icon: "okay", color: "#10b981", category: "emotes", vectorIcon: "check-circle" },
  { id: "omg_love_it", name: "OMG Love It", icon: "omg_love_it", color: "#ec4899", category: "emotes", vectorIcon: "heart" },
  { id: "pain", name: "Pain", icon: "pain", color: "#f43f5e", category: "emotes", vectorIcon: "heart-crack" },
  { id: "poro_ride", name: "Poro Ride", icon: "poro_ride", color: "#a855f7", category: "emotes", vectorIcon: "smile" },
  { id: "poro_snax", name: "Poro Snax", icon: "poro_snax", color: "#f59e0b", category: "emotes", vectorIcon: "cookie" },
  { id: "sad_kitten", name: "Sad Kitten", icon: "sad_kitten", color: "#64748b", category: "emotes", vectorIcon: "frown" },
  { id: "scout_approved", name: "Scout Approved", icon: "scout_approved", color: "#22c55e", category: "emotes", vectorIcon: "check-check" },
  { id: "snoozy_poro", name: "Snoozy Poro", icon: "snoozy_poro", color: "#38bdf8", category: "emotes", vectorIcon: "moon" },
  { id: "such_foolishness", name: "Such Foolishness", icon: "such_foolishness", color: "#ef4444", category: "emotes", vectorIcon: "alert-triangle" },
  { id: "super_approved", name: "Super Approved", icon: "super_approved", color: "#22c55e", category: "emotes", vectorIcon: "sparkles" },
  { id: "teamwork", name: "Teamwork", icon: "teamwork", color: "#3b82f6", category: "emotes", vectorIcon: "users" },
  { id: "think_about_it", name: "Think About It", icon: "think_about_it", color: "#06b6d4", category: "emotes", vectorIcon: "help-circle" },
  { id: "unimpressed", name: "Unimpressed", icon: "unimpressed", color: "#64748b", category: "emotes", vectorIcon: "frown" },
  { id: "unworthy", name: "Unworthy", icon: "unworthy", color: "#ef4444", category: "emotes", vectorIcon: "thumbs-down" },
  { id: "wahaha", name: "Wahaha", icon: "wahaha", color: "#fbbf24", category: "emotes", vectorIcon: "smile" },
  { id: "woah_dizzy", name: "Woah Dizzy", icon: "woah_dizzy", color: "#8b5cf6", category: "emotes", vectorIcon: "sparkles" },
  { id: "thumbs_up", name: "Thumbs Up", icon: "thumbs_up", color: "#22c55e", category: "emotes", vectorIcon: "thumbs-up" },
  { id: "mind_blown", name: "Mind Blown", icon: "mind_blown", color: "#ec4899", category: "emotes", vectorIcon: "sparkles" },
  { id: "thinking", name: "Thinking Face", icon: "thinking", color: "#06b6d4", category: "emotes", vectorIcon: "help-circle" },
  { id: "crown_champ", name: "Champion Crown", icon: "crown", color: "#eab308", category: "emotes", vectorIcon: "crown" },
  { id: "hundred", name: "100 Percent", icon: "hundred", color: "#ef4444", category: "emotes", vectorIcon: "check-check" },
  { id: "flex_muscle", name: "Flex Muscle", icon: "flex", color: "#f59e0b", category: "emotes", vectorIcon: "dumbbell" },
  { id: "skull_rip", name: "RIP Skull", icon: "skull", color: "#94a3b8", category: "emotes", vectorIcon: "skull" },

  // 4. Audio & Studio Callouts
  { id: "mic_on", name: "Mic Open", icon: "mic_on", color: "#10b981", category: "audio", vectorIcon: "mic" },
  { id: "mic_off", name: "Mic Muted", icon: "mic_off", color: "#f43f5e", category: "audio", vectorIcon: "mic-off" },
  { id: "vol_boost", name: "Volume Boost", icon: "vol_boost", color: "#8b5cf6", category: "audio", vectorIcon: "volume-2" },
  { id: "bass_kick", name: "Bass Drop", icon: "bass_kick", color: "#f59e0b", category: "audio", vectorIcon: "sliders" },
  { id: "studio_eq", name: "Studio Acoustic", icon: "studio_eq", color: "#38bdf8", category: "audio", vectorIcon: "headphones" },
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

export function isEmoteId(id: string): boolean {
  return (
    DEFAULT_CATALOG.some(
      (c) => c.id === id && (c.category === "emotes" || c.category === "emote")
    ) || DEFAULT_EMOTE_WHEEL.includes(id)
  );
}

export function createEmoteCatalogEntry(emoteId: string): CatalogEntry {
  return {
    id: emoteId,
    name: formatAssetName(emoteId),
    icon: emoteId,
    color: "#ec4899",
    category: "emotes",
    vectorIcon: "smile",
  };
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

export interface PingloomManifest {
  counts: {
    pings: number;
    emotes: number;
    sounds: number;
    textures: number;
  };
  pings_count: number;
  emotes_count: number;
  sounds_count: number;
  textures_count: number;
  pings: string[];
  emotes: string[];
  sounds: string[];
  textures: string[];
  pings_details?: Array<{
    id: string;
    name: string;
    sound: string;
    sound_file: string;
    icon: string;
    color: string;
  }>;
}

export async function getPingloomAssetsManifest(): Promise<PingloomManifest | null> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        return await invoke<PingloomManifest>("get_pingloom_assets_manifest");
      }
    } catch {}
  }
  return null;
}

export async function playPingSound(sound: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        return await invoke<boolean>("play_ping_sound", { sound });
      }
    } catch {}
  }
  return false;
}

export async function checkAccessibilityPermission(): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        return await invoke<boolean>("check_accessibility_permission");
      }
    } catch {}
  }
  return false;
}

export async function requestAccessibilityPermission(): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        return await invoke<boolean>("request_accessibility_permission");
      }
    } catch {}
  }
  return false;
}

export async function getPingloomSettings(): Promise<PingloomSettings> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        try {
          return await invoke<PingloomSettings>("get_pingloom_settings");
        } catch {
          return await invoke<PingloomSettings>("get_ping_settings");
        }
      }
    } catch {}
  }
  return DEFAULT_PINGLOOM_SETTINGS;
}

export async function savePingloomSettings(settings: PingloomSettings): Promise<PingloomSettings> {
  if (typeof window !== "undefined") {
    try {
      if (isTauri() || ("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window)) {
        try {
          return await invoke<PingloomSettings>("save_pingloom_settings", { settings });
        } catch {
          return await invoke<PingloomSettings>("save_ping_settings", { settings });
        }
      }
    } catch {}
  }
  return settings;
}

export type PingloomWheelKind = "ping" | "emote";

export interface PingloomPoint {
  x: number;
  y: number;
}

export interface PingloomActionData {
  wheel?: PingloomWheelKind;
  origin?: PingloomPoint;
  point?: PingloomPoint;
  slot?: number | null;
  enabled?: boolean;
  sound?: string;
}

export interface PingloomAction {
  type: "wheel_open" | "wheel_move" | "select" | "click" | "cancel" | "toggled" | "sound";
  data?: PingloomActionData;
}

export interface PingloomActionPayload {
  action: PingloomAction;
  origin?: PingloomPoint | null;
  scale?: number;
  event_type: "wheel_open" | "wheel_slice" | "select" | "click" | "wheel_close" | "toggled" | "sound";
}

