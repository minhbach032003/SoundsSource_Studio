<script lang="ts">
  import { Sun, Moon } from "@lucide/svelte";
  import { themeState, type ThemeMode } from "@/lib/theme.svelte";

  interface Props {
    selectedTheme?: string;
    resolvedThemeMode?: ThemeMode;
    onSelectTheme?: (palette: string) => void;
    onToggleThemeMode?: () => void;
  }

  let {
    selectedTheme,
    resolvedThemeMode,
    onSelectTheme,
    onToggleThemeMode,
  }: Props = $props();

  const currentTheme = $derived(selectedTheme ?? themeState.selectedTheme);
  const currentMode = $derived(resolvedThemeMode ?? themeState.resolvedThemeMode);

  function handleSelect(palette: string) {
    if (onSelectTheme) {
      onSelectTheme(palette);
    } else {
      themeState.selectTheme(palette);
    }
  }

  function handleToggle() {
    if (onToggleThemeMode) {
      onToggleThemeMode();
    } else {
      themeState.toggleThemeMode();
    }
  }
</script>

<div class="theme-controls flex items-center gap-1.5" data-no-drag>
  <label class="sr-only" for="theme-preset">
    Color theme
  </label>
  <select
    id="theme-preset"
    class="theme-preset h-8 px-2 text-[11px] sm:text-xs rounded-md bg-(--paper) text-(--ink) border border-(--input-line) hover:border-(--focus) focus:border-(--focus) transition-colors cursor-pointer outline-none w-28 sm:w-36 md:w-40 truncate"
    value={currentTheme}
    onchange={(e) => handleSelect((e.target as HTMLSelectElement).value)}
    aria-label="Select color theme palette"
  >
    <option value="default">Pingloom Rose</option>
    <option value="latte">Latte (Light)</option>
    <option value="frappe">Frappé (Dark)</option>
    <option value="macchiato">Macchiato</option>
    <option value="mocha">Mocha (Dark)</option>
  </select>
  <button
    type="button"
    class="theme-toggle w-8 h-8 flex items-center justify-center rounded-md border border-(--input-line) bg-(--paper) text-(--ink) hover:border-(--focus) hover:bg-(--surface) transition-colors cursor-pointer"
    aria-label={currentMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    title={currentMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    aria-pressed={currentMode === "dark"}
    onclick={handleToggle}
  >
    {#if currentMode === "dark"}
      <Sun class="w-3.5 h-3.5 text-(--accent)" />
    {:else}
      <Moon class="w-3.5 h-3.5 text-(--ink)" />
    {/if}
  </button>
</div>
