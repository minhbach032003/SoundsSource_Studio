import { invoke } from "@tauri-apps/api/core";
import { readPetPreferences } from "./petPreferences";
import { composeTrayTitle, IDLE_BOOST_LINES } from "./petTrayTitle";
import type { AgentSessionDto } from "@/components/pet/types";

let writes: Promise<void> = Promise.resolve();

/** All tray consumers use current persistence, never a captured checkbox value. */
export async function updatePetTrayCount(sessions?: readonly AgentSessionDto[]): Promise<void> {
  const current = sessions ?? await invoke<AgentSessionDto[]>("get_agent_sessions");
  // Câu tán gẫu đổi theo giờ chứ không theo từng lần cập nhật, nếu không thanh menu
  // nhấp nháy chữ mới mỗi lần một agent nhúc nhích.
  const idle = IDLE_BOOST_LINES[Math.floor(Date.now() / 12_000) % IDLE_BOOST_LINES.length];
  const titleFor = () => {
    const prefs = readPetPreferences();
    return composeTrayTitle(current, prefs, idle);
  };
  const update = async () => {
    let shown: string;
    do {
      shown = titleFor();
      await invoke("update_tray_title", { title: shown });
      // Another webview can change persistence while native IPC is pending.
      // Repair that write before finishing, even if its own update completed first.
    } while (shown !== titleFor());
  };
  const pending = writes.catch(() => {}).then(update);
  writes = pending;
  return pending;
}
