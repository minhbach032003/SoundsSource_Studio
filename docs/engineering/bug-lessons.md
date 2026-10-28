# Bug lessons

## MACOS-SIGNING-001 — Enabled privacy switch can refer to an older build identity

- **Status:** fixed and deployed; certificate identity stability verified; native capture/rebuild acceptance pending user interaction.
- **Scope / trigger:** macOS local production rebuilds; Settings shows Screen Recording enabled, while Voice AI's preflight reports no usable grant for the running process. Base revision `a0d20d5`.
- **Evidence:** the installed bundle's signature was ad-hoc and its designated requirement was a changing cdhash. No valid configured signing identity existed. This establishes an identity mismatch risk, not proof that every denied preflight is caused by signing; stale running processes and OS consent policy remain possible.
- **Cause / fix:** rebuild previously fell back to ad-hoc deployment when no certificate was found. It now checks a valid stable identity before building and verifies the signed bundle before replacement. Provisioning uses user-domain code-signing-only trust, restrictive temporary files, exact identity-name matching, and no bulk private-key ACL changes. The denied UI now explains existing-but-unavailable grants and displays the signing hint before capture.
- **Provisioning regression:** the original empty-password PKCS#12 import failed with `MAC verification failed`. Changing only the export/import password to a nonempty random temporary value made import succeed; later setup reused the existing identity. Never ask for the user's login password in chat or commit the certificate's private key.
- **Automated regression:** `node --test tests/screen-share.test.mjs` (11 tests) executes production rebuild control flow with stub tools: missing identity does not build/deploy; invalid signature does not replace the app; valid signing verifies before replacement; exact-name lookup rejects prefix/suffix matches. Compiled production Svelte panel tests fail on the old panel and pass on the fix. `node tests/screen-permission-browser.mjs` checks both signing states, keyboard recheck, unclipped controls and dismissal with mocked handlers.
- **Native signing evidence:** two different compiled binaries signed with the same local certificate produced identical certificate-based designated requirements. `pnpm rebuild:app` passed; installed Studio signature verified with `Authority=SoundsSource Local Dev`, not an ad-hoc cdhash-only requirement. No TCC reset or automatic capture was performed.
- **Limits:** a transition to the new certificate may need a new user grant and full relaunch. To verify privacy persistence, grant access, capture in the installed app, rebuild using the same certificate, relaunch, then capture without another grant. Browser tests and the signing probe do not establish that native acceptance.
- **Related history:** local shared snapshot `shell-macos-signing-permission-reset`; not republished. OpenSpec `fix-stable-screen-permissions` remains active until native acceptance.

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


## PET-RENDER-001 — Pet frame fit edge-to-edge, clipping effects and washing colours

- **Status:** fixed and verified in automated + scratch browser render; deployed via `pnpm rebuild:app` (stable identity) 2026-10-28; OpenSpec archive `2026-10-28-improve-pet-canvas-rendering`.
- **Scope:** `src/shared/lib/petRenderer.ts` (`drawPetFrame`), `src/components/AgentPetSprite.svelte`; base `b75c692` plus the uncommitted Pikachu envelope work.
- **Reproduction:** render 7 pets x 4 states at 200/56 px (scratch harness driving `drawPetFrame` via Vite + agent-browser). Goku SS3 hair and auras cut at the top/sides, floor shadow half below the canvas, Wode/Eddy bleached when celebrating, fixed 2x canvas aliased on a 1x display, Pikachu sparks fixed in pixels.
- **Cause:** fit used `min(W/r.w, H/r.h)` with `y = H - h` on envelopes that already fill 95% of the 192x208 cell; lighting stops reached 0.55 x 1.35 alpha with `source-atop`, also landing on the earlier-drawn shadow; effect literals were tuned for a ~400 px sprite.
- **Fix:** stage inset (top 8%, sides 5%, bottom 6%); shadow composited last with `destination-over` and bounded by the bottom inset; lighting stops capped at 0.2; effects/motion scaled by `h / 400`; canvas backing store `size x devicePixelRatio` with a resolution media query.
- **Regression:** `node --test tests/pet-render-stage.test.mjs` (6 tests): all failed before the fix (inset, shadow order, wash, size drift, DPR, envelope reach), all pass after. `tests/pet-motion.test.mjs` expectation updated from full-canvas to stage fit (intended).
- **Limits:** pets render ~14% smaller in the same box. Native multi-display DPR switching was not exercised.

## PET-BROWSER-001 — Two pet browser suites fail on clean HEAD

- **Status:** suspected, out of scope, pending.
- **Observation (2026-10-28, HEAD `b75c692` in a clean worktree):** `node tests/pet-motion-browser.mjs` times out waiting for 49 renderers to load (25 s); `node tests/pet-animation-identity-browser.mjs` cannot find Gallery buttons `button[title^="Cyber Coding Cat —"]` / `"Code Frenzy Cat —"`. Identical failures with and without `improve-pet-canvas-rendering`.
- **Cause:** unknown. Hypotheses only: the first loads the Cloudinary URL before the local fallback; the second may depend on renamed gallery titles.
