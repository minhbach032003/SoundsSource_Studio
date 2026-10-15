import type { FC } from "react";
import { Sun, Moon } from "lucide-react";
import type { ThemeMode } from "@/shared/lib/useTheme";

interface ThemeControlsProps {
  selectedTheme: string;
  resolvedThemeMode: ThemeMode;
  onSelectTheme: (palette: string) => void;
  onToggleThemeMode: () => void;
}

export const ThemeControls: FC<ThemeControlsProps> = ({
  selectedTheme,
  resolvedThemeMode,
  onSelectTheme,
  onToggleThemeMode,
}) => {
  return (
    <div className="theme-controls flex items-center gap-1.5" data-no-drag>
      <label className="sr-only" htmlFor="theme-preset">
        Color theme
      </label>
      <select
        id="theme-preset"
        className="theme-preset h-8 px-2.5 text-xs rounded-md bg-[var(--paper)] text-[var(--ink)] border border-[var(--input-line)] hover:border-[var(--focus)] focus:border-[var(--focus)] transition-colors cursor-pointer outline-none"
        value={selectedTheme}
        onChange={(e) => onSelectTheme(e.target.value)}
        aria-label="Select color theme palette"
      >
        <option value="default">Default Sapphire</option>
        <option value="latte">Catppuccin Latte</option>
        <option value="frappe">Catppuccin Frappé</option>
        <option value="macchiato">Catppuccin Macchiato</option>
        <option value="mocha">Catppuccin Mocha</option>
      </select>
      <button
        type="button"
        className="theme-toggle w-8 h-8 flex items-center justify-center rounded-md border border-[var(--input-line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--focus)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
        aria-label={
          resolvedThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        title={
          resolvedThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        aria-pressed={resolvedThemeMode === "dark"}
        onClick={onToggleThemeMode}
      >
        {resolvedThemeMode === "dark" ? (
          <Sun className="w-3.5 h-3.5 text-[var(--accent)]" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-[var(--ink)]" />
        )}
      </button>
    </div>
  );
};
