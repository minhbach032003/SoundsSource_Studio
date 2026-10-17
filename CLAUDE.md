# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `README.md` first — it has the commands and crate layout. This file only covers what it doesn't, plus where it's stale.

## Commands

Everything runs from the repo root (see README for the full list). Notes:

- `pnpm tauri ...` is the only correct entry point for Tauri — the script sets `TAURI_APP_PATH=crates/app` and `TAURI_FRONTEND_PATH=.`; bare `tauri` from root fails.
- Single Rust test: `cargo test -p sound-engine jwt`, or by file: `cargo test -p rust-sound --test pipeline_e2e`.
- Frontend has no lint/test tooling. `pnpm build` (runs `tsc` then Vite) is the only frontend check.
- macOS-only: `sound-core` is CoreAudio/CoreFoundation FFI, so nothing in the workspace builds or tests off macOS 14.2+.

## Architecture

Deps: `app → engine → core`, app also uses core directly, core never references engine. `rust_sound_lib` re-exports both as `::core` and `::engine`.

**One IPC boundary, three edits per feature.** All state lives in `AppState` (`crates/app/src/lib.rs`): `Mutex<AudioRouter>`, `Mutex<PresetStore>`, `Mutex<BreakTimerManager>`, `AuthService`. Every frontend capability is a `#[tauri::command]` fn in that same file, so adding one means: write the command, register it in `generate_handler!`, add the typed wrapper in `src/audio.ts`. Commands stay thin — DSP goes in `engine/router.rs` + `engine/eq.rs`, CoreAudio calls in `core/device.rs` + `core/process.rs`.

**Gemini Live voice call** is frontend-only: `src/lib/geminiLive.svelte.ts` holds the WebSocket session (v1beta endpoint, `gemini-3.1-flash-live-preview` default; 16 kHz PCM via `realtimeInput.audio`, 24 kHz downlink, 1 fps JPEG of camera *or* shared screen via `realtimeInput.video`; audio transcription fills the transcript; `sessionResumption` handles keep context across persona switch/reconnect). The Live API rejects bad setups by *closing* the socket (clean 1007/1008), not with an `error` frame, and closes 1007 on the deprecated `mediaChunks` — keep both in mind when touching the protocol. Free-tier keys get a clean 1011 "exceeded your current quota" at setup when `googleSearch` is declared on `gemini-3.1-flash-live-preview` (2.5 native audio accepts it); the service drops search for that model and retries. Screen share in the desktop app does **not** use `getDisplayMedia`: WKWebView hands this app an all-black stream even with the Screen Recording grant in place (verified: TCC record `auth_value=2`, cdhash matching the installed bundle). Frames come from `capture_screen_jpeg` (`/usr/sbin/screencapture` of the main display, inherits the app's TCC grant) and are drawn through the same canvas as the camera path; `nativeScreenFrame` is also what the stage previews, at the 1 fps uplink rate. `getDisplayMedia` and the black-frame detector remain for the browser path. The TCC grant is still required and still checked first via `check_screen_capture_permission` / `request_screen_capture_permission` / `open_screen_capture_settings` (CoreGraphics FFI in `crates/app/src/lib.rs`). Note the bundle is ad-hoc linker-signed with no sealed resources, so `Entitlements.plist` is not applied and every rebuild changes the cdhash — a Screen Recording grant has to be re-given after some rebuilds. A re-open (persona switch, setup fallback, goAway) swaps only the WebSocket and keeps mic, camera, screen and AudioContexts alive — re-acquiring them is what left WebKit with a silent mic. `ws.onerror` must not decide status; `onclose` does (WebKit can fire `error` before a clean 1011). The in-app "Chẩn đoán" panel (`diagnosticsReport()`) is the way to get evidence from the real WKWebView. `src/lib/geminiAudioTools.ts` is its function-calling layer — Gemini's tool calls are executed against existing mixer commands (`set_app_volume`, `set_master_eq_band`, …), never new ones, and are gated by the Agent Control toggle in `src/views/VoiceAiView.svelte`. The Rust side only stores the API key (`get_gemini_api_key` / `set_gemini_api_key`).

`AuthService` (`crates/engine/src/auth/`) composes four verifiers behind one facade: internal HS256 JWT (`jwt.rs`), Google ID tokens (`google.rs`), Keycloak (`keycloak.rs`), either-of-the-two (`dual_auth.rs`), plus PKCE S256 (`pkce.rs`) and a Neon Postgres repo (`db.rs`). Frontend side is `src/lib/googleAuth.svelte.ts`.

**README is out of date on two points:** Frontend is Svelte 5 + Tailwind v4 + Vite (`src/main.ts`, `src/App.svelte`, `src/views/`, `src/components/`); and `engine` also holds `timer.rs` (break/focus timer) and `auth/`.

Its "Trạng thái thực tế" section is still accurate and important: there is no live capture → DSP → output pipeline. Volume/mute/EQ commands mutate router state; the `*_e2e` tests assert on synthetic buffers and system queries, not real audio. Don't describe audio changes as verified end-to-end.

System volume/mute/device commands bypass the router entirely and drive CoreAudio (and AppleScript for per-app media volume) directly.

## openspec/

Spec-driven workflow. `openspec/specs/<capability>/spec.md` are the live requirements (SHALL + WHEN/THEN scenarios); `openspec/changes/<name>/` holds in-flight proposals (`proposal.md`, `design.md`, `tasks.md`) that get archived into specs when done. When changing behavior a spec covers, update the spec too.

## Required env vars

`AuthService` is built from `RUST_SOUND_JWT_SECRET` and `RUST_SOUND_NEON_URL` (`env_secret` in `crates/app/src/lib.rs`), and the app panics at startup if either is missing. Export both before `pnpm tauri dev`. The live-DB test in `crates/app/tests/auth_integration_test.rs` skips itself when `RUST_SOUND_NEON_URL` is unset.

## Git workflow & Automated Rebuild Rule

Whenever finishing a self-contained piece of work, feature, or bug fix (**step 1 is macOS-only — see "Cloud / Linux sessions" below**):
1. Automatically rebuild the production macOS desktop app into `/Applications/rust-sound.app` so the user's installed application is immediately up-to-date:
   ```bash
   pnpm rebuild:app
   ```
2. Then commit and push to `origin` without asking:
   ```bash
   git add -A && git commit -m "feat/fix: <what changed>" && git push
   ```

Commit messages follow the conventional prefixes already in the history (`feat:`, `fix:`, `refactor:`). Work happens directly on `main` — don't branch unless asked. Push once per finished unit of work, not per file edit.

## Cloud / Linux sessions

Claude Code cloud sessions run on **Ubuntu 24.04 x86_64**; the base image cannot be swapped. Three of the four crates cannot build there, so on any non-macOS host:

- **Skip `pnpm rebuild:app` entirely.** There is no macOS SDK and no `/Applications`. Finish at the commit-and-push step.
- **Never run `cargo test --workspace` or `cargo build` at the root.** `sound-core` is CoreAudio FFI, `rust-sound` is a macOS Tauri app, `pingloom` is CGEventTap.
- **Do not claim an audio change works.** Verifying this project's DSP needs real CoreAudio devices, process taps and a running Spotify. None of that exists in a container. Say what you could not verify.

What a Linux session can legitimately build, run and verify:

```bash
cargo test -p sound-engine          # 16 files, zero macOS cfgs: eq, filter, preset,
                                    # router, spectrum, spotify (Web API), timer, auth/*
pnpm install --frozen-lockfile
pnpm build                          # tsc + vite over all of src/
for f in tests/*.test.mjs; do node "$f"; done
npx @fission-ai/openspec validate --specs
```

Anything touching `crates/core`, `crates/app` or `crates/pingloom` is read-only work in the cloud: review, refactor proposals, specs and docs. Hand the build and the listening test back to a macOS machine.

## UI conventions & Vector Icon Standard

**STRICT RULE — NO UNICODE EMOJIS AS ICONS:**
Never use unicode emoji characters (e.g. 💖, 🐝, 😡, 👍, 💯, 💪, 💀, 🎙️, ⚠️, 🎯, etc.) as UI icons, labels, badges, data tables, commit messages, or console output. Always use `@lucide/svelte` (bundled in dependencies) or clean inline SVG components with theme-aware styling. All previous emoji violations in `src/lib/pingloom.ts`, `src/components/AudioBuses.tsx`, and `src/views/AgentPetView.tsx` have been eliminated and must never be reintroduced.

