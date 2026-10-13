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

export function displayName(process: AudioProcess): string {
  const names: Record<string, string> = {
    "com.spotify.client": "Spotify", "com.brave.Browser": "Brave Browser",
    "com.google.Chrome": "Google Chrome", "com.discordapp.Discord": "Discord",
    "com.apple.Safari": "Safari", "com.apple.Music": "Apple Music",
  };
  return names[process.bundle_id] || process.name || process.bundle_id || `Process ${process.pid}`;
}
