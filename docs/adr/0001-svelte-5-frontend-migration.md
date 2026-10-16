# 0001: Migrate frontend from React 19 to Svelte 5

We are migrating the desktop UI from React 19 to Svelte 5 (using runes) with named CSS classes in `src/styles.css` and a flat component architecture matching pingloom.

Bundle size reduction (~55 kB gzip) is not the justification; the goal is codebase clarity, elimination of multi-layer component-wrapping abstractions, and replacing long Tailwind utility strings with semantic named CSS.

The migration proceeds incrementally by Tauri window roots (overlays first, then main shell and views), governed by a formal review gate after the three overlay windows (Task 06) before touching the main window.
