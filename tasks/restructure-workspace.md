# Task: Restructure rust-sound Workspace

## Problem

`crates/app/src/lib.rs` is a 2,400-line god file containing all Tauri commands, AppState, break overlay window management, screen capture, dock icon updates, and Pingloom event wiring. `crates/engine` is a junk drawer mixing audio DSP (`eq.rs`, `filter.rs`, `spectrum.rs`), Spotify integration, auth (JWT/Keycloak/Google), Google Calendar, break timer, AgentPet care/sessions/hooks, and the Pingloom gesture wheel — domains that share no data.

The current shape:

```
core     → macOS audio hardware, process taps, ring buffer, device control
engine   → EVERYTHING ELSE (DSP + Spotify + auth + calendar + pet + wheel + timer)
app      → one giant lib.rs with ~120 Tauri commands + setup + overlays
pingloom → native macOS gesture EventTap listener (this crate is fine)
```

## Target shape

Split `engine` by domain and break `app/src/lib.rs` into modules. Do NOT rename any public API or Tauri command — the Svelte frontend must keep working with zero changes.

```
crates/
  core/           ← KEEP AS-IS. macOS audio hardware, taps, ring buffer, device
  dsp/            ← NEW. eq.rs, filter.rs, spectrum.rs, pcm_queue.rs, preset.rs
                     from engine. Pure audio DSP, no network, no async.
                     Depends on: core (for AudioDevice types only)
  spotify/        ← NEW. engine/spotify.rs, engine/spotify_player.rs,
                     app/spotify.rs, app/spotify_sink.rs merged.
                     All librespot + Spotify Web API logic in one place.
                     Depends on: core, dsp
  auth/           ← NEW. engine/auth/* as-is. JWT, PKCE, Google, Keycloak, DB.
                     Depends on: nothing internal (pure HTTP/crypto)
  pet/            ← NEW. engine/pet/* + engine/timer.rs.
                     AgentPet care, sessions, hooks, break clock, timer, todos.
                     Depends on: nothing internal
  calendar/       ← NEW. engine/google_calendar.rs.
                     Depends on: nothing internal (pure HTTP)
  pingloom/       ← KEEP AS-IS. Native gesture listener.
  engine/         ← THIN COORDINATOR. Re-exports dsp, spotify, pet, auth, calendar.
                     Holds router.rs (which wires DSP + Spotify spectrum + app channels).
                     Depends on: core, dsp, spotify, auth, pet, calendar
  app/            ← Tauri shell. Split lib.rs into modules by domain:
                     app/src/lib.rs        → just run(), AppState, setup
                     app/src/cmd_audio.rs  → volume/mute/device/EQ/filter commands
                     app/src/cmd_spotify.rs
                     app/src/cmd_pet.rs    → pet care, break timer, todos, overlays
                     app/src/cmd_auth.rs
                     app/src/cmd_calendar.rs
                     app/src/cmd_system.rs → performance, memory, screen capture, dock icon
                     app/src/cmd_ping.rs   → pingloom gesture/overlay/sound commands
                     app/src/app_tap.rs    → keep
                     app/src/spotify_sink.rs → move to crates/spotify/ or keep as bridge
```

## Rules

1. **Zero frontend breakage.** Every `#[tauri::command]` keeps its exact name, parameters, and return type. The Svelte `invoke()` calls must not change. Run `pnpm build` to verify.
2. **Zero public API rename.** Types re-exported from `engine/src/lib.rs` today keep the same path (add `pub use` re-exports from `engine` if a type moved to a child crate).
3. **Dependency direction is downward only:**
   ```
   app → engine → {dsp, spotify, auth, pet, calendar} → core
                                                       ↗
                                              pingloom (standalone)
   ```
   No crate may depend on a higher layer. `dsp` must NOT depend on `spotify`. `auth` must NOT depend on `dsp`. Verify: no circular deps in `cargo check`.
4. **Move, don't rewrite.** `git mv` files where possible. Keep the exact Rust code; only change `use`/`mod` paths and `Cargo.toml` dependencies. This is a mechanical refactor — do not refactor logic, rename functions, or "improve" code.
5. **Tests must pass.** `cargo test --workspace` and `cargo clippy --workspace` clean. If a test references a moved module, fix the import path only.
6. **One commit per crate extraction.** So the history is bisectable:
   - Commit 1: extract `crates/dsp` from engine
   - Commit 2: extract `crates/auth` from engine
   - Commit 3: extract `crates/pet` from engine
   - Commit 4: extract `crates/calendar` from engine
   - Commit 5: extract `crates/spotify` (may need dsp + core)
   - Commit 6: split `app/src/lib.rs` into `cmd_*.rs` modules
   - Commit 7: update workspace Cargo.toml, clean up engine re-exports
   Each commit must compile and pass tests on its own.

## Verification checklist per commit

```bash
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
pnpm build          # Svelte frontend still compiles
pnpm rebuild:app    # full Tauri build succeeds
```

## What NOT to do

- Do NOT add new features, abstractions, traits, or error types
- Do NOT rename any function, struct, enum, or command
- Do NOT touch any `.svelte`, `.ts`, or `.css` file
- Do NOT change the Pingloom crate
- Do NOT add workspace-level lints or clippy configs
- Do NOT force-push or rewrite git history
