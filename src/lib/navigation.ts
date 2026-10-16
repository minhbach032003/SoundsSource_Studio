export const NAV_TABS = ["spotify", "mixer", "timer", "pings", "voice", "pet", "pet-settings", "settings"] as const;
export type NavTab = typeof NAV_TABS[number];

export function restoreTab(): NavTab {
  try {
    const saved = localStorage.getItem("rust_sound_active_area");
    return NAV_TABS.find(tab => tab === saved) ?? "mixer";
  } catch { return "mixer"; }
}

const REQUEST_KEY = "rust_sound_navigation_request";

const LOCAL_EVENT = "rust-sound:navigate";

/** Mounted main accepts local destinations without requiring persistence. */
export function navigateTo(tab: NavTab) {
  if (!NAV_TABS.some(candidate => candidate === tab)) throw new Error("Invalid navigation destination");
  const local = new CustomEvent(LOCAL_EVENT, { detail: tab, cancelable: true });
  if (!window.dispatchEvent(local)) return; // Main acknowledged local delivery.
  // No main here: persistence is required for cross-window/new-main delivery.
  // Let failures reach the popover's error toast; do not open/close windows on failure.
  localStorage.setItem(REQUEST_KEY, JSON.stringify({ tab, nonce: crypto.randomUUID() }));
  window.dispatchEvent(new StorageEvent("storage", { key: REQUEST_KEY }));
}

export function takeNavigationRequest(): NavTab | null {
  try {
    const request = JSON.parse(localStorage.getItem(REQUEST_KEY) || "null");
    const tab = NAV_TABS.find(tab => tab === request?.tab) ?? null;
    localStorage.removeItem(REQUEST_KEY);
    if (tab) rememberTab(tab);
    return tab;
  } catch { return null; }
}

/** Only main subscribes, so popovers cannot consume their own destination. */
export function subscribeNavigation(select: (tab: NavTab) => void): () => void {
  const update = () => { const tab = takeNavigationRequest(); if (tab) select(tab); };
  const onStorage = (event: StorageEvent) => { if (event.key === REQUEST_KEY) update(); };
  const onLocal = (event: Event) => {
    const tab = NAV_TABS.find(tab => tab === (event as CustomEvent<unknown>).detail);
    if (!tab) return;
    event.preventDefault();
    select(tab);
    rememberTab(tab);
  };
  window.addEventListener(LOCAL_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  update();
  return () => {
    window.removeEventListener(LOCAL_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function rememberTab(tab: NavTab) {
  try { localStorage.setItem("rust_sound_active_area", tab); }
  catch { /* Navigation still works when storage is unavailable. */ }
}
