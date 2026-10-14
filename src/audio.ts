export interface AudioProcess {
  object_id: number;
  pid: number;
  bundle_id: string;
  name: string;
  is_running_output: boolean;
  is_regular_app: boolean;
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
]);

export function isAudibleApplication(process: AudioProcess): boolean {
  if (process.is_running_output) return true;
  if (!process.is_regular_app) return false;
  if (NON_AUDIO_UTILITIES.has(process.bundle_id)) return false;
  if (/rust-sound|activity monitor|terminal|finder/i.test(process.name)) return false;
  return true;
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
