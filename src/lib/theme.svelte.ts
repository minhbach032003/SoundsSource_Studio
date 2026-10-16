export type ThemeMode = "light" | "dark";
export type ThemeFamily = "default" | "catppuccin";
export type DarkFlavor = "frappe" | "macchiato" | "mocha";

export interface ThemePreference {
  family: ThemeFamily;
  mode: ThemeMode;
  darkFlavor: DarkFlavor;
}

export const THEME_STORAGE_KEY = "rust-sound.ui-theme";

export function readThemePreference(): ThemePreference | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null;
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { family, mode, darkFlavor } = value as Record<string, unknown>;
    if (
      (family !== "default" && family !== "catppuccin") ||
      (mode !== "light" && mode !== "dark") ||
      !["frappe", "macchiato", "mocha"].includes(String(darkFlavor))
    ) {
      return null;
    }
    return {
      family: family as ThemeFamily,
      mode: mode as ThemeMode,
      darkFlavor: darkFlavor as DarkFlavor,
    };
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

import { syncDockIconToTheme } from "./dockIcon";

export function updateFavicon(): void {
  if (typeof document === "undefined") return;
  try {
    const computed = getComputedStyle(document.documentElement);
    const bg = computed.getPropertyValue("--paper").trim() || "currentColor";
    const accent = computed.getPropertyValue("--accent").trim() || "currentColor";
    const strong = computed.getPropertyValue("--strong").trim() || accent;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'><rect width='36' height='36' rx='9' fill='${bg}'/><rect x='6.5' y='13' width='3.2' height='10' rx='1.6' fill='${accent}' opacity='0.8'/><rect x='11.8' y='8' width='3.2' height='20' rx='1.6' fill='${strong}' opacity='0.92'/><rect x='17.1' y='4.5' width='3.2' height='27' rx='1.6' fill='${accent}'/><rect x='22.4' y='8' width='3.2' height='20' rx='1.6' fill='${strong}' opacity='0.92'/><rect x='27.7' y='13' width='3.2' height='10' rx='1.6' fill='${accent}' opacity='0.8'/></svg>`;
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (link) {
      link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  } catch {
    // Ignore DOM errors
  }
}

export function applyTheme(preference: ThemePreference | null, isDark: boolean): string {
  if (typeof document === "undefined") return "default-dark";
  const mode = preference?.mode ?? (isDark ? "dark" : "light");
  const palette =
    preference?.family === "catppuccin"
      ? mode === "light"
        ? "latte"
        : preference.darkFlavor
      : `default-${mode}`;

  document.documentElement.dataset.themeFamily = preference?.family ?? "default";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.themePalette = palette;
  updateFavicon();
  syncDockIconToTheme().catch(() => {});
  return palette;
}

export class ThemeState {
  themePreference = $state<ThemePreference | null>(readThemePreference());
  osDark = $state<boolean>(systemPrefersDark());

  constructor() {
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        this.osDark = e.matches;
        applyTheme(this.themePreference, this.osDark);
      };
      mq.addEventListener("change", handler);

      // sync DOM initially
      applyTheme(this.themePreference, this.osDark);
    }
  }

  get resolvedThemeMode(): ThemeMode {
    return this.themePreference?.mode ?? (this.osDark ? "dark" : "light");
  }

  get selectedTheme(): string {
    if (this.themePreference?.family === "catppuccin") {
      return this.resolvedThemeMode === "light" ? "latte" : this.themePreference.darkFlavor;
    }
    return "default";
  }

  saveThemePreference(next: ThemePreference) {
    this.themePreference = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore local storage errors
    }
    applyTheme(this.themePreference, this.osDark);
  }

  selectTheme(value: string) {
    const darkFlavor = this.themePreference?.darkFlavor ?? "frappe";
    if (value === "default") {
      this.saveThemePreference({ family: "default", mode: this.resolvedThemeMode, darkFlavor });
    } else if (value === "latte") {
      this.saveThemePreference({ family: "catppuccin", mode: "light", darkFlavor });
    } else if (value === "frappe" || value === "macchiato" || value === "mocha") {
      this.saveThemePreference({ family: "catppuccin", mode: "dark", darkFlavor: value });
    }
  }

  toggleThemeMode() {
    this.saveThemePreference({
      family: this.themePreference?.family ?? "default",
      mode: this.resolvedThemeMode === "dark" ? "light" : "dark",
      darkFlavor: this.themePreference?.darkFlavor ?? "frappe",
    });
  }
}

export const themeState = new ThemeState();
