# AGENTS.md

Instructions, conventions, and operational rules for AI coding agents (Pi, Claude Code, Cursor, Codex).

## 1. UI Icon Standards — Strict Prohibition of Emojis

- **ZERO EMOJIS AS ICONS**: Never use unicode emoji characters (such as 💖, 🐝, 😡, 👍, 💯, 💪, 💀, 🎙️, ⚠️, 🎯, 🚀, 🔥, etc.) as UI icons, badges, indicators, list symbols, data table markers, or visual elements.
- **ALWAYS USE VECTOR ICONS**:
  - Always use `@lucide/svelte` (already bundled in `package.json`).
  - If a specific custom asset or graphic is required, use a clean inline SVG (`<svg>`) component.
  - Apply dynamic theme color classes (`text-(--accent)`, `text-(--ink)`, `text-(--muted)`, etc.) instead of hardcoded platform-dependent emoji glyphs.

## 2. Architecture & Modular Workspace Layout

### Dependencies flow downward only:
```
app -> engine (thin coordinator) -> {dsp, spotify, auth, pet, calendar} -> core
                                                                        ↗
                                                               pingloom (standalone)
```

- **`crates/core`**: macOS CoreAudio/CoreFoundation FFI, process audio taps, ring buffer, device volume/mute.
- **`crates/dsp`**: Pure audio DSP math: Parametric EQ (`eq.rs`), dynamic filters & noise gate (`filter.rs`), spectrum analyzer (`spectrum.rs`), PCM sample queue (`pcm_queue.rs`), audio presets (`preset.rs`). Zero network or async.
- **`crates/auth`**: JWT HMAC-SHA256, PKCE S256, Google OAuth, Keycloak RS256, DualAuth, Neon DB repository (`auth/*`).
- **`crates/pet`**: AgentPet companion engine: care progression, XP/hunger, activity themes, session tracking, hook manager, UNIX domain socket server (`pet/*`). Zero internal dependencies.
- **`crates/calendar`**: Google Calendar OAuth PKCE, event JSON parsing, today schedule sync, token storage (`calendar/*`).
- **`crates/spotify`**: Spotify Web API, PKCE authentication, and embedded Librespot local connect player with audio tap streaming (`spotify/*`).
- **`crates/engine`**: Thin coordinator crate. Keeps `router.rs` (wires DSP + Spotify spectrum + app channels), `timer.rs` (Pomodoro break timer with audio ducking), and `wheel/`. Re-exports all domain crates so `sound_engine::*` imports stay backward-compatible.
- **`crates/pingloom`**: Standalone native macOS `CGEventTap` gesture listener and radial wheel event processor.
- **`crates/app`**: Tauri shell. Application state lives in `AppState` (`crates/app/src/lib.rs`). Tauri commands are partitioned into 7 focused domain modules:
  - `cmd_audio.rs`: Volume, mute, balance, devices, EQ bands, audio filters, virtual audio, presets.
  - `cmd_spotify.rs` / `spotify.rs`: Spotify Web API and local playback commands.
  - `cmd_auth.rs`: Google OAuth login, session restore, logout, Gemini API key storage.
  - `cmd_calendar.rs`: Google Calendar login, status, sync, disconnect.
  - `cmd_pet.rs`: AgentPet care, feed, reset, sessions, hooks, desktop overlay, popover, notifications.
  - `cmd_timer.rs`: Pomodoro break timer, screen lock overlays, timeboxed todos.
  - `cmd_wheel.rs`: Pingloom overlay, mouse/keyboard gestures, wheel settings, assets catalog, audio pings.
  - `cmd_system.rs`: Performance metrics, memory trim, screen capture permissions, dock icon, window/quit.
- **Frontend**: Svelte 5 (runes `$state`, `$derived`, `$effect`) + Tailwind CSS v4 + Vite (`src/main.ts`, `src/App.svelte`, `src/views/`, `src/components/`, `src/lib/`).

## 3. Security-First & Quality Requirements

- Validate all inputs at boundaries (e.g. ranges, slice lengths, buffer sizes, URL schemes).
- Never commit secrets, connection strings, or JWT keys. `.env*` files are strictly excluded from git.
- Display a confirmation modal (`Modal`) prior to sensitive or destructive actions (such as resetting settings or audio routing).
- Display a non-blocking toast notification (`toastState`) upon completing state-changing operations.
- Avoid repetitive modal permission prompts on dev rebuilds: Spotify Keychain tokens must use open ACL (`SecAccessCreate`), and gesture listeners must check accessibility quietly without unprompted system popups.

## 4. Automated Post-Work App Rebuild & Local Deployment Rule

- **MANDATORY AUTO-REBUILD & DEPLOYMENT**: Whenever completing any feature, bug fix, UI enhancement, or requested modification, the AI Agent MUST automatically rebuild the production macOS desktop app and copy it to `/Applications/SoundsSource Studio.app`:
  ```bash
  pnpm rebuild:app
  ```
- This ensures the user can immediately open and test the updated app from Spotlight / Launchpad without needing to ask for a manual rebuild or encountering stale builds.

## 5. Automatic Commit & Push After Each Completed Functionality

- After completing each feature, bug fix, or requested modification, run the relevant tests/checks (`cargo check --workspace`, `cargo test --workspace`, `node --test tests/*.test.mjs`, `pnpm build`) and the required rebuild/deployment above. Only after all succeed, review the diff for secrets and unrelated changes, commit the task's changes with a descriptive message, and automatically push the current branch to its configured upstream without asking again.
- Stage only files or hunks belonging to the completed task; preserve unrelated user changes. With multiple subagents, the coordinating agent alone commits and pushes after integration and cross-review succeed.
- Use a normal push; never force-push, bypass hooks, or rewrite history. If verification, commit, or push fails, or the upstream is missing or ambiguous, stop and report the blocker; do not claim completion or choose another remote/branch silently.
