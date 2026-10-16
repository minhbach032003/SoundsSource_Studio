# AGENTS.md

Instructions, conventions, and operational rules for AI coding agents (Pi, Claude Code, Cursor, Codex).

## 1. UI Icon Standards — Strict Prohibition of Emojis

- **ZERO EMOJIS AS ICONS**: Never use unicode emoji characters (such as 💖, 🐝, 😡, 👍, 💯, 💪, 💀, 🎙️, ⚠️, 🎯, 🚀, 🔥, etc.) as UI icons, badges, indicators, list symbols, data table markers, or visual elements.
- **ALWAYS USE VECTOR ICONS**:
  - Always use `@lucide/svelte` (already bundled in `package.json`).
  - If a specific game or custom asset is required, use a clean inline SVG (`<svg>`) component.
  - Apply dynamic theme color classes (`text-[var(--accent)]`, `text-[var(--ink)]`, `text-[var(--muted)]`, etc.) instead of hardcoded platform-dependent emoji glyphs.

## 2. Architecture & IPC Boundaries

- Dependencies: `app -> engine -> core`.
- All shared application state lives in `AppState` (`crates/app/src/lib.rs`).
- Commands stay thin — DSP math belongs in `engine/`, CoreAudio calls in `core/`.
- Frontend is Svelte 5 + Tailwind v4 + Vite (`src/main.ts`, `src/App.svelte`, `src/views/`, `src/components/`).

## 3. Security-First & Quality Requirements

- Validate all inputs at boundaries (e.g. ranges, slice lengths, buffer sizes).
- Never commit secrets, connection strings, or JWT keys. `.env*` files are strictly excluded from git.
- Display a confirmation modal (`Modal`) prior to sensitive or destructive actions (such as resetting settings or audio routing).
- Display a toast notification (`toastState`) upon completing state-changing operations.

## 4. Automated Post-Work App Rebuild & Local Deployment Rule

- **MANDATORY AUTO-REBUILD & DEPLOYMENT**: Whenever completing any feature, bug fix, UI enhancement, or requested modification, the AI Agent MUST automatically rebuild the production macOS desktop app and copy it to `/Applications/rust-sound.app`:
  ```bash
  pnpm rebuild:app
  ```
- This ensures the user can immediately open and test the updated app from Spotlight / Launchpad without needing to ask for a manual rebuild or encountering stale builds.

