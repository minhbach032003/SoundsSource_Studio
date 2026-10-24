# Bug lessons

## PET-MAPPING-001 — Unused template constant does not invalidate a sibling lookup

- **Status:** verified for frontend reactivity; production deployment pending.
- **Scope:** Svelte 5.57.2; AgentPetView, AgentPetSettingsView, PetOverlay, PetPopover; base revision `2aec059`.
- **Trigger / reproduction:** `pnpm check` reported four unused `_rev` declarations. With a stable session/index/equipped slug, changing the non-reactive mapping result and incrementing `mappingRevision` left the derived pet unchanged.
- **Confirmed cause:** each revision read lived in a separate unused template constant, outside the derived expression that calls `getPetForSession`. Reading a signal in a sibling derived value does not subscribe the pet lookup to it.
- **Fix:** read the revision within each existing lookup expression using `(void mappingRevision, getPetForSession(...))`; preserve the row key, mapping function, and subscriptions.
- **Regression:** `node --test tests/pet-mapping.test.mjs` compiles the four production lookup expressions with the installed Svelte runtime. Before: four failures (`before !== after`). After: five tests pass, including two consecutive mapping changes per view. `pnpm check`: zero errors/warnings after the fix.
- **Broader verification:** workspace Rust check/test, all 239 Node tests, frontend build, and existing settings/popover browser checks passed. Browser IPC is mocked; these checks do not prove native cross-webview event delivery.
- **Limit:** the fix responds to the existing revision notifications. No new storage/event transport is added. The fifth caller (PetSocketPanel) has no revision subscription and was outside the authorized four-diagnostic fix; its update behavior was not changed.
- **Deployment blocker:** `pnpm rebuild:app` exceeded the command's 120-second timeout while compiling the app; no build process remained and installation was not updated. No compiler error was reported in the captured tail. Retry with a sufficient timeout is pending.
- **Source change / last checked:** `fix-pet-mapping-reactivity`, working diff based on `2aec059`; four template replacements and the pet-mapping regression test. No shared-memory publication performed.

## PERF-SLOWDOWN-001 — Unchecked child process spawning and capability checks executing system purge

- **Status:** verified in code, automated test suite, and deployed build.
- **Scope:** `crates/core/src/memory.rs`, `crates/core/src/spotify.rs`, `crates/app/src/spotify.rs`, `crates/pingloom/src/macos_input.rs`, `src/shared/lib/petRenderer.ts`.
- **Trigger / reproduction:** Leaving the app running over hours causes the host computer to gradually lag, stutter mouse and keyboard input, and experience system-wide disk and CPU lockups.
- **Confirmed cause:**
  1. `can_purge_without_prompt()` called `sudo -n /usr/sbin/purge` to test for passwordless sudo, which actually executed a system-wide disk cache purge every time memory areas were queried or policy was sanitized.
  2. `SpotifyIntegration::start` called `spotify::playback()` every 2 seconds when not connected to Spotify Web, spawning `/usr/bin/osascript` in a 25ms spinloop tens of thousands of times per day even when Spotify was not running.
  3. Pingloom's `CGEventTap` called `copy_window_info` synchronously on every mouse click across macOS, and `CFRunLoop::run_in_mode` spun on every mouse move with `returnAfterSourceHandled: true`, contending for engine mutex locks and causing event tap timeouts.
  4. Idle desktop pets continuously executed `draw()` on canvas at up to 120 FPS on ProMotion displays.
- **Fix:**
  1. Test sudo capabilities with `sudo -n -l /usr/sbin/purge` without executing purge.
  2. Add native `is_spotify_running()` check to bypass `osascript` when Spotify is not running, and relax polling interval when paused.
  3. Fast-path pointer events when no gesture is active in `CGEventTap`, set `returnAfterSourceHandled: false`, and guard `fullscreen_at` by `game_check`.
  4. Throttle idle pet dynamics redraws to ~30 FPS.
- **Regression:** `node --test tests/long-running-perf.test.mjs` verifies all 4 fixes.

