import { invoke, isTauri } from "@tauri-apps/api/core";

export interface AudioProcess {
  object_id: number;
  pid: number;
  bundle_id: string;
  name: string;
  is_running_output: boolean;
  is_regular_app: boolean;
  /// macOS can only drive volume for apps with their own scripting interface.
  supports_volume: boolean;
}

export function processKey(process: AudioProcess): string {
  return process.bundle_id || `pid:${process.pid}`;
}

// Helpers belonging to one application share a single mixer channel.
export function groupProcesses(processes: AudioProcess[]): AudioProcess[] {
  const groups = new Map<string, AudioProcess>();
  for (const process of processes) {
    const key = processKey(process);
    const existing = groups.get(key);
    if (existing) {
      existing.is_running_output ||= process.is_running_output;
      if (/helper|renderer/i.test(existing.name) && !/helper|renderer/i.test(process.name)) {
        existing.name = process.name;
      }
    } else {
      groups.set(key, { ...process });
    }
  }
  return [...groups.values()].sort((a, b) =>
    Number(b.is_running_output) - Number(a.is_running_output) || a.name.localeCompare(b.name),
  );
}

export const NON_AUDIO_UTILITIES = new Set([
  "com.apple.finder",
  "com.apple.ActivityMonitor",
  "com.apple.Terminal",
  "com.apple.loginwindow",
  "com.apple.controlcenter",
  "com.apple.universalaccessd",
  "com.apple.accessibility.heard",
  "systemsoundserverd",
  "com.apple.audio.AudioComponentRegistrar",
  "com.apple.TextEdit",
  "com.apple.Preview",
  "com.apple.Calculator",
  "com.apple.Notes",
  "com.apple.reminders",
  "com.apple.systempreferences",
  "com.apple.Preferences",
  "com.apple.AppStore",
  "com.apple.dt.Xcode",
  "com.apple.Photos",
  "com.apple.Clock",
  "com.apple.Maps",
  "com.apple.weather",
  "com.apple.stocks",
  "com.apple.Home",
  "com.apple.FontBook",
  "com.apple.keychainaccess",
  "com.apple.DiskUtility",
  "com.apple.Console",
  "com.apple.Screenshot",
  "com.apple.ArchiveUtility",
]);

export function isAudibleApplication(process: AudioProcess): boolean {
  if (process.is_running_output) return true;
  if (!process.is_regular_app) return false;
  if (NON_AUDIO_UTILITIES.has(process.bundle_id)) return false;
  if (
    /textedit|calculator|notes|reminders|preview|xcode|rust-sound|activity monitor|terminal|finder|system settings/i.test(
      process.name
    )
  ) {
    return false;
  }
  return true;
}

export function isMediaOrCommunicationApp(process: AudioProcess): boolean {
  const b = (process.bundle_id || "").toLowerCase();
  const n = (process.name || "").toLowerCase();
  return (
    b.includes("spotify") ||
    b.includes("music") ||
    b.includes("podcasts") ||
    b.includes("quicktime") ||
    b.includes("chrome") ||
    b.includes("safari") ||
    b.includes("brave") ||
    b.includes("firefox") ||
    b.includes("edge") ||
    b.includes("arc") ||
    b.includes("opera") ||
    b.includes("discord") ||
    b.includes("telegram") ||
    b.includes("zalo") ||
    b.includes("slack") ||
    b.includes("teams") ||
    b.includes("zoom") ||
    b.includes("skype") ||
    b.includes("whatsapp") ||
    b.includes("vlc") ||
    b.includes("iina") ||
    b.includes("youtube") ||
    b.includes("netflix") ||
    b.includes("audacity") ||
    b.includes("logic") ||
    b.includes("ableton") ||
    b.includes("reaper") ||
    n.includes("spotify") ||
    n.includes("music") ||
    n.includes("browser") ||
    n.includes("chrome") ||
    n.includes("safari") ||
    n.includes("brave") ||
    n.includes("telegram") ||
    n.includes("zalo") ||
    n.includes("discord") ||
    n.includes("slack") ||
    n.includes("teams") ||
    n.includes("zoom") ||
    n.includes("vlc") ||
    n.includes("player")
  );
}

export function displayName(process: AudioProcess): string {
  const names: Record<string, string> = {
    "com.spotify.client": "Spotify",
    "com.brave.Browser": "Brave Browser",
    "com.google.Chrome": "Google Chrome",
    "com.discordapp.Discord": "Discord",
    "com.apple.Safari": "Safari",
    "com.apple.Music": "Apple Music",
    "com.apple.Terminal": "Terminal",
    "com.apple.finder": "Finder",
    "com.apple.ActivityMonitor": "Activity Monitor",
    "com.vng.zalo": "Zalo",
    "com.agentpet.app": "AgentPet",
  };
  return names[process.bundle_id] || process.name || process.bundle_id || `Process ${process.pid}`;
}

export async function getMasterBalance(): Promise<number> {
  if (!isTauri()) return 0;
  try {
    return await invoke<number>("get_master_balance");
  } catch {
    return 0;
  }
}

export async function setMasterBalance(balance: number): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("set_master_balance", { balance });
  } catch (err) {
    console.error("Failed to set master balance:", err);
  }
}

export async function testHeadphoneChannel(channel: "left" | "right"): Promise<string> {
  if (!isTauri()) return `Testing ${channel === "left" ? "Left" : "Right"} Headphone Channel`;
  try {
    return await invoke<string>("test_headphone_channel", { channel });
  } catch {
    return `Testing ${channel === "left" ? "Left" : "Right"} Channel`;
  }
}


/**
 * macOS Screen Recording (TCC) grant for this app. `null` outside the desktop
 * app, where the browser's own picker owns the permission.
 */
export async function checkScreenCapturePermission(): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<boolean>("check_screen_capture_permission");
  } catch {
    return null;
  }
}

/** Shows the macOS prompt the first time; a new grant needs an app restart. */
export async function requestScreenCapturePermission(): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<boolean>("request_screen_capture_permission");
  } catch {
    return null;
  }
}

export async function openScreenCaptureSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_screen_capture_settings");
}
