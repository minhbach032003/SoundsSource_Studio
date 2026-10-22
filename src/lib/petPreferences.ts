// One boundary for persisted pet preferences, shared by every webview and renderer.
export const PET_KEYS = {
  animate: "ap_animate_pets",
  fps: "ap_animation_fps",
  size: "rust_sound_pet_size",
  count: "ap_show_count",
  chat: "ap_show_chat",
  bubble: "ap_show_bubble",
  split: "ap_split_pet",
  notifications: "ap_notifications_enabled",
  doneSound: "ap_sound_done_enabled",
  waitingSound: "ap_sound_waiting_enabled",
  doneCustom: "ap_sound_done_custom",
  waitingCustom: "ap_sound_waiting_custom",
} as const;

export function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** Space for the 288px bubble, menu 128px above the sprite, and 1.15x interaction scale.
 * `pets` là số con hiện cạnh nhau khi bật Split pet: cửa sổ phải rộng ra theo, nếu không
 * con thứ hai trở đi bị cắt mất ở mép. */
export function petOverlayWindowSize(value: number, pets = 1) {
  const size = boundedInteger(value, 10, 300, 180);
  const count = boundedInteger(pets, 1, 3, 1);
  const sprite = Math.ceil(size * 1.15);
  const row = sprite * count + 12 * (count - 1);
  return { width: Math.max(320, row + 32), height: sprite + 240 };
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function readPetPreferences() {
  return {
    notifications: read(PET_KEYS.notifications) !== "0",
    doneSound: read(PET_KEYS.doneSound) !== "0",
    waitingSound: read(PET_KEYS.waitingSound) !== "0",
    doneCustom: read(PET_KEYS.doneCustom),
    waitingCustom: read(PET_KEYS.waitingCustom),
    animate: read(PET_KEYS.animate) !== "0",
    fps: boundedInteger(read(PET_KEYS.fps), 1, 12, 12),
    size: boundedInteger(read(PET_KEYS.size), 10, 300, 180),
    count: read(PET_KEYS.count) !== "0",
    chat: read(PET_KEYS.chat) === "1",
    bubble: read(PET_KEYS.bubble) === "1",
    split: read(PET_KEYS.split) === "1",
  };
}

/** Native storage events reach other webviews; this event also reaches this one. */
export function writePetPreference(key: Exclude<keyof typeof PET_KEYS, "doneCustom" | "waitingCustom">, value: number | boolean) {
  const normalized = key === "fps" ? boundedInteger(value, 1, 12, 12)
    : key === "size" ? boundedInteger(value, 10, 300, 180) : value === true ? "1" : "0";
  writePetStorage(PET_KEYS[key], String(normalized));
}

export function writePetStorage(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

export function subscribePetPreferences(update: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || Object.values(PET_KEYS).some(key => key === event.key)
      || event.key.startsWith("ap_bind_") || event.key === "rust_sound_pet_slug") update();
  };
  window.addEventListener("storage", onStorage);
  update();
  return () => window.removeEventListener("storage", onStorage);
}

export function readPetBinding(slug: string, state: string): number | null {
  const value = read(`ap_bind_${slug}_${state}`);
  const n = value === null || value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(n) && n >= 0 && n < 9 ? n : null;
}
