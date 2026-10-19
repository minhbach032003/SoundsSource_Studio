# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `README.md` first — it has high-level commands and design principles. This file covers architecture, operational rules, and development details.

## Commands

Everything runs from the repository root:

- `pnpm dev`: Starts the Vite frontend dev server (port 1420 default).
- `pnpm tauri dev`: Runs the full desktop app in Tauri dev mode (`TAURI_APP_PATH=crates/app TAURI_FRONTEND_PATH=.`).
- `pnpm check`: Svelte 5 and TypeScript check (`svelte-check --tsconfig ./tsconfig.json`).
- `pnpm build`: Full frontend production bundle compilation (`tsc && vite build`).
- `pnpm rebuild:app`: Rebuilds the production macOS app, applies ad-hoc codesign, and deploys directly to `/Applications/SoundsSource Studio.app`.
- Single Rust crate test:
  - `cargo test -p sound-dsp`
  - `cargo test -p sound-auth`
  - `cargo test -p sound-pet`
  - `cargo test -p sound-calendar`
  - `cargo test -p sound-spotify`
  - `cargo test -p sound-engine`
  - `cargo test -p rust-sound`
- Full test suites:
  - `cargo test --workspace` (Rust workspace unit + integration tests)
  - `node --test tests/*.test.mjs` (203+ Node unit tests for frontend,IPC, integration)
  - `node --test tests/*-browser.mjs` (8 browser test suites via agent-browser)
- macOS-only: `sound-core` depends on CoreAudio / CoreFoundation FFI, requiring macOS 14.2+.

## Modular Workspace Architecture

The workspace follows strict downward-only dependency boundaries:
```
app -> engine (thin coordinator) -> {dsp, spotify, auth, pet, calendar} -> core
                                                                        ↗
                                                               pingloom (standalone)
```

- **`crates/core`**: Low-level macOS audio hardware FFI, CoreAudio process taps, high-performance ring buffer, volume/mute hardware control.
- **`crates/dsp` (`sound-dsp`)**: Pure audio DSP math: Parametric EQ (`eq.rs`), dynamic filters & noise gate (`filter.rs`), spectrum analyzer (`spectrum.rs`), PCM sample queue (`pcm_queue.rs`), presets (`preset.rs`). Pure computation; zero network, zero async.
- **`crates/auth` (`sound-auth`)**: JWT HMAC-SHA256, PKCE S256, Google OAuth verifier, Keycloak RS256, DualAuth validator, Neon Postgres user repo (`db.rs`).
- **`crates/pet` (`sound-pet`)**: AgentPet companion engine: care progression, XP/hunger vitals, activity themes, session tracking, hook manager, UNIX domain socket server (`/tmp/rust-sound-agent-pet.sock`). Zero internal dependencies.
- **`crates/calendar` (`sound-calendar`)**: Google Calendar OAuth PKCE, event parsing, today's schedule sync, token storage. Depends on `sound-core` (Keychain) and `sound-auth` (PKCE).
- **`crates/spotify` (`sound-spotify`)**: Spotify Web API, OAuth PKCE, and embedded Librespot local connect player. Depends on `sound-core` and `sound-auth`.
- **`crates/engine` (`sound-engine`)**: Thin coordinator crate. Keeps `router.rs` (wires DSP channels + Spotify spectrum), `timer.rs` (Pomodoro break timer with audio ducking), and `wheel/`. Re-exports all domain crates so all `sound_engine::*` imports across the codebase remain 100% backward-compatible.
- **`crates/pingloom`**: Native macOS `CGEventTap` gesture listener and radial wheel event processor.
- **`crates/app` (`rust-sound`)**: Tauri desktop shell. Application state lives in `AppState` (`crates/app/src/lib.rs`). Tauri commands are partitioned into 7 focused domain modules:
  - `cmd_audio.rs`: Volume, mute, balance, devices, EQ bands, audio filters, virtual audio, presets, app audio tap.
  - `cmd_spotify.rs` / `spotify.rs`: 18 Spotify Web API and local playback commands.
  - `cmd_auth.rs`: Google OAuth login, session restore, logout, Gemini API key storage.
  - `cmd_calendar.rs`: Google Calendar login, status, sync, disconnect.
  - `cmd_pet.rs`: AgentPet care, feed, reset, sessions, hooks, desktop overlay, popover, notifications.
  - `cmd_timer.rs`: Pomodoro break timer, screen lock overlays, timeboxed todos.
  - `cmd_wheel.rs`: Pingloom overlay, mouse/keyboard gestures, wheel settings, assets catalog, audio pings.
  - `cmd_system.rs`: Performance metrics, memory trim, screen capture permissions, dock icon, window/quit.
- **Frontend**: Svelte 5 (runes `$state`, `$derived`, `$effect`) + Tailwind CSS v4 + Vite (`src/main.ts`, `src/App.svelte`, `src/views/`, `src/components/`, `src/lib/`).

## Gemini Live Voice Call

Frontend-only integration in `src/lib/geminiLive.svelte.ts`:
- WebSocket session (v1beta endpoint, `gemini-3.8-live` default with automatic fallback to `gemini-3.1-flash-live-preview`).
- 16 kHz PCM uplink via `realtimeInput.audio`, 24 kHz downlink audio.
- 1 fps JPEG of camera or shared screen via `realtimeInput.video`.
- Screen share in the desktop app does **not** use `getDisplayMedia` (which returns black frames in macOS WKWebView); it uses `capture_screen_jpeg` (`/usr/sbin/screencapture` of main display).
- Function calling layer in `src/lib/geminiAudioTools.ts` executes against existing mixer commands, gated by the Agent Control toggle.
- Rust side only stores the API key (`get_gemini_api_key` / `set_gemini_api_key` in `cmd_auth.rs`).

## openspec/

Spec-driven workflow:
- `openspec/specs/<capability>/spec.md`: Current live requirements (SHALL + WHEN/THEN scenarios).
- `openspec/changes/<name>/`: In-flight proposals (`proposal.md`, `design.md`, `tasks.md`).
- When changing behavior a spec covers, update the spec too.

## Required Environment Variables

- `RUST_SOUND_JWT_SECRET` and `RUST_SOUND_NEON_URL` can be provided for live Neon DB authentication.
- `GEMINI_API_KEY`: Google Gemini API key for Live audio calls and vision tools.
- `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`: (Optional) for uploading pet spritesheets to CDN via `pnpm pets:upload`. Never commit secrets to git.

## Git Workflow & Automated Post-Work App Rebuild Rule

Whenever completing any feature, bug fix, UI enhancement, or requested modification (**step 1 is macOS-only**):
1. **MANDATORY REBUILD & DEPLOYMENT**: Rebuild the production macOS desktop app and deploy to `/Applications/SoundsSource Studio.app`:
   ```bash
   pnpm rebuild:app
   ```
2. Verify all tests pass:
   ```bash
   cargo check --workspace
   cargo test --workspace
   node --test tests/*.test.mjs
   pnpm build
   ```
3. Commit and push to `origin` without asking:
   ```bash
   git add <staged files> && git commit -m "type(scope): description" && git push
   ```

## Cloud / Linux Sessions

Claude Code cloud sessions run on **Ubuntu 24.04 x86_64** without macOS CoreAudio/CoreGraphics:
- **Skip `pnpm rebuild:app` entirely** on Linux/CI (no macOS SDK).
- `cargo test -p sound-dsp`, `cargo test -p sound-auth`, `cargo test -p sound-pet`, `cargo test -p sound-calendar` can build and test on Linux.
- Frontend checks (`pnpm build`, `node --test tests/*.test.mjs`) work cross-platform.
- Hand desktop app verification back to a macOS machine.

## UI Conventions & Strict Zero Emoji Standard

- **ZERO EMOJIS AS ICONS**: Never use unicode emoji characters (e.g. 💖, 🐝, 😡, 👍, 💯, 💪, 💀, 🎙️, ⚠️, 🎯, etc.) as UI icons, labels, badges, data tables, or visual elements.
- **ALWAYS USE VECTOR ICONS**: Use `@lucide/svelte` or clean inline SVG components with dynamic theme color classes (`text-(--accent)`, `text-(--ink)`, `text-(--muted)`).
