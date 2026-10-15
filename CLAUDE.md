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

`AuthService` (`crates/engine/src/auth/`) composes four verifiers behind one facade: internal HS256 JWT (`jwt.rs`), Google ID tokens (`google.rs`), Keycloak (`keycloak.rs`), either-of-the-two (`dual_auth.rs`), plus PKCE S256 (`pkce.rs`) and a Neon Postgres repo (`db.rs`). Frontend side is `src/shared/lib/useGoogleAuth.ts`.

**README is out of date on two points:** the frontend is React 19 + Tailwind v4 (`src/App.tsx`, `src/views/`, `src/components/`), not `src/main.ts`; and `engine` also holds `timer.rs` (break/focus timer) and `auth/`.

Its "Trạng thái thực tế" section is still accurate and important: there is no live capture → DSP → output pipeline. Volume/mute/EQ commands mutate router state; the `*_e2e` tests assert on synthetic buffers and system queries, not real audio. Don't describe audio changes as verified end-to-end.

System volume/mute/device commands bypass the router entirely and drive CoreAudio (and AppleScript for per-app media volume) directly.

## openspec/

Spec-driven workflow. `openspec/specs/<capability>/spec.md` are the live requirements (SHALL + WHEN/THEN scenarios); `openspec/changes/<name>/` holds in-flight proposals (`proposal.md`, `design.md`, `tasks.md`) that get archived into specs when done. When changing behavior a spec covers, update the spec too.

## Known

`NEON_CONNECTION_STRING` and `JWT_SECRET` are hardcoded constants in `crates/app/src/lib.rs`. Treat that connection string as compromised; move both to env/keychain before any release.

## Git workflow

After finishing a self-contained piece of work, commit and push to `origin` without asking:

```bash
git add -A && git commit -m "feat: <what changed>" && git push
```

Commit messages follow the conventional prefixes already in the history (`feat:`, `refactor:`). Work happens directly on `main` — don't branch unless asked. Push once per finished unit of work, not per file edit.
