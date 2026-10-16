export const NAV_TABS = ["spotify", "mixer", "timer", "pings", "voice", "pet", "settings"] as const;
export type NavTab = typeof NAV_TABS[number];

export function restoreTab(): NavTab {
  try {
    const saved = localStorage.getItem("rust_sound_active_area");
    return NAV_TABS.find(tab => tab === saved) ?? "mixer";
  } catch { return "mixer"; }
}

export function rememberTab(tab: NavTab) {
  try { localStorage.setItem("rust_sound_active_area", tab); }
  catch { /* Navigation still works when storage is unavailable. */ }
}
