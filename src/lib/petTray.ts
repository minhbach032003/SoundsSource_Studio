import { invoke } from "@tauri-apps/api/core";
import { readPetPreferences } from "./petPreferences";
import type { AgentSessionDto } from "@/components/pet/types";

let writes: Promise<void> = Promise.resolve();

/** All tray consumers use current persistence, never a captured checkbox value. */
export async function updatePetTrayCount(sessions?: readonly AgentSessionDto[]): Promise<void> {
  const current = sessions ?? await invoke<AgentSessionDto[]>("get_agent_sessions");
  const count = String(current.filter(session => session.state === "working").length);
  const update = async () => {
    let shown: boolean;
    do {
      shown = readPetPreferences().count;
      await invoke("update_tray_title", { title: shown ? count : "" });
      // Another webview can change persistence while native IPC is pending.
      // Repair that write before finishing, even if its own update completed first.
    } while (shown !== readPetPreferences().count);
  };
  const pending = writes.catch(() => {}).then(update);
  writes = pending;
  return pending;
}
