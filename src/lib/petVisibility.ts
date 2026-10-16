import { invoke } from "@tauri-apps/api/core";

export function savedPetPosition(): { x?: number; y?: number } {
  try {
    const pos = JSON.parse(localStorage.getItem("rust_sound_pet_overlay_pos") || "null");
    if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) return { x: pos.x, y: pos.y };
  } catch {}
  return {};
}

/** Native result is authoritative; a rejected command must not change persistence. */
export async function setDesktopPetVisible(enable: boolean): Promise<boolean> {
  const visible = await invoke<boolean>("toggle_pet_overlay", { enable, ...savedPetPosition() });
  localStorage.setItem("rust_sound_show_desktop_pet", String(visible));
  return visible;
}

/** Shell lifetime, not the conditionally mounted Pet tab. */
export async function restoreDesktopPet(): Promise<boolean> {
  return setDesktopPetVisible(localStorage.getItem("rust_sound_show_desktop_pet") !== "false");
}
