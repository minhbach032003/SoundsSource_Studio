# AGENTS.md

Instructions, conventions, and operational rules for AI coding agents (Pi, Claude Code, Cursor, Codex).

## 1. UI Icon Standards — Strict Prohibition of Emojis

- **ZERO EMOJIS AS ICONS**: Never use unicode emoji characters (such as 💖, 🐝, 😡, 👍, 💯, 💪, 💀, 🎙️, ⚠️, 🎯, 🚀, 🔥, etc.) as UI icons, badges, indicators, list symbols, data table markers, or visual elements.
- **ALWAYS USE VECTOR ICONS**:
  - Always use `lucide-react` (already bundled in `package.json`).
  - If a specific game or custom asset is required, use a clean inline SVG (`<svg>`) component.
  - Apply dynamic theme color classes (`text-[var(--accent)]`, `text-[var(--ink)]`, `text-[var(--muted)]`, etc.) instead of hardcoded platform-dependent emoji glyphs.

## 2. Architecture & IPC Boundaries

- Dependencies: `app -> engine -> core`.
- All shared application state lives in `AppState` (`crates/app/src/lib.rs`).
- Commands stay thin — DSP math belongs in `engine/`, CoreAudio calls in `core/`.
- Frontend is React 19 + Tailwind v4 + Vite (`src/App.tsx`, `src/views/`, `src/components/`, `src/shared/ui/`).

## 3. Security-First & Quality Requirements

- Validate all inputs at boundaries (e.g. ranges, slice lengths, buffer sizes).
- Never commit secrets, connection strings, or JWT keys. `.env*` files are strictly excluded from git.
- Display a confirmation modal (`ModalComponent`) prior to sensitive or destructive actions (such as resetting settings or audio routing).
- Display a toast notification (`useToast`) upon completing state-changing operations.
