import { useState, useEffect, useCallback, useMemo } from "react";

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
  return palette;
}

export function useTheme() {
  const [themePreference, setThemePreference] = useState<ThemePreference | null>(() => readThemePreference());
  const [osDark, setOsDark] = useState<boolean>(() => systemPrefersDark());

  // Listen to OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setOsDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedThemeMode: ThemeMode = useMemo(() => {
    return themePreference?.mode ?? (osDark ? "dark" : "light");
  }, [themePreference?.mode, osDark]);

  const selectedTheme = useMemo(() => {
    if (themePreference?.family === "catppuccin") {
      return resolvedThemeMode === "light" ? "latte" : themePreference.darkFlavor;
    }
    return "default";
  }, [themePreference, resolvedThemeMode]);

  // Synchronize DOM attributes whenever preference or OS mode changes
  useEffect(() => {
    applyTheme(themePreference, osDark);
  }, [themePreference, osDark]);

  const saveThemePreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore local storage errors
    }
  }, []);

  const selectTheme = useCallback(
    (value: string) => {
      const darkFlavor = themePreference?.darkFlavor ?? "frappe";
      if (value === "default") {
        saveThemePreference({ family: "default", mode: resolvedThemeMode, darkFlavor });
      } else if (value === "latte") {
        saveThemePreference({ family: "catppuccin", mode: "light", darkFlavor });
      } else if (value === "frappe" || value === "macchiato" || value === "mocha") {
        saveThemePreference({ family: "catppuccin", mode: "dark", darkFlavor: value });
      }
    },
    [themePreference?.darkFlavor, resolvedThemeMode, saveThemePreference]
  );

  const toggleThemeMode = useCallback(() => {
    saveThemePreference({
      family: themePreference?.family ?? "default",
      mode: resolvedThemeMode === "dark" ? "light" : "dark",
      darkFlavor: themePreference?.darkFlavor ?? "frappe",
    });
  }, [themePreference, resolvedThemeMode, saveThemePreference]);

  return {
    themePreference,
    resolvedThemeMode,
    selectedTheme,
    selectTheme,
    toggleThemeMode,
    saveThemePreference,
  };
}
