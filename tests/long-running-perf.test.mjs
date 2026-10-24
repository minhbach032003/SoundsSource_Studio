import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("crates/core/src/memory.rs tests sudo privilege using -l without executing purge in can_purge_without_prompt", () => {
  const code = readFileSync("crates/core/src/memory.rs", "utf8");
  const fnMatch = code.match(/fn can_purge_without_prompt\(\) -> bool \{([\s\S]*?)\n    \}/);
  assert.ok(fnMatch, "can_purge_without_prompt function must exist");
  assert.ok(fnMatch[1].includes('"-n", "-l", "/usr/sbin/purge"'), "must use sudo -n -l to test privilege without running purge");
  assert.ok(!fnMatch[1].includes('Command::new("/usr/sbin/purge").status()'), "must never run purge directly inside can_purge_without_prompt capability test");
});

test("crates/core/src/spotify.rs and crates/app/src/spotify.rs fast-path running check and relax idle polling", () => {
  const coreCode = readFileSync("crates/core/src/spotify.rs", "utf8");
  assert.ok(coreCode.includes("pub fn is_spotify_running()"), "must expose native is_spotify_running check");
  assert.ok(coreCode.includes("if !is_spotify_running() {"), "playback must return default immediately when Spotify is not running");

  const appCode = readFileSync("crates/app/src/spotify.rs", "utf8");
  assert.ok(appCode.includes("let is_active = next.playback.playing || next.processing || tap.is_some() || local_state.playing;"), "must track active playback");
  assert.ok(appCode.includes("let slices = if is_active { 20 } else { 60 };"), "must relax polling cadence to 6s when idle/paused");
});

test("crates/pingloom/src/macos_input.rs fast-paths mouse movements and does not spin runloop", () => {
  const code = readFileSync("crates/pingloom/src/macos_input.rs", "utf8");
  assert.ok(code.includes("if is_pointer_movement && !cb_tracking.load(Ordering::Relaxed) {"), "must fast-path pointer movements when idle");
  assert.ok(code.includes("if is_game_check { fullscreen_at(point) } else { false }"), "must not query window list when game check is disabled");
  assert.ok(code.includes("Duration::from_millis(100),\n            false,"), "runloop must not exit on every single handled source");
});

test("src/shared/lib/petRenderer.ts throttles idle dynamics redraws to ~30 FPS", () => {
  const code = readFileSync("src/shared/lib/petRenderer.ts", "utf8");
  assert.ok(code.includes("const minDynamicsInterval = isIdle ? 33 : 0;"), "must cap idle dynamics at ~30 FPS");
  assert.ok(code.includes("this.hasContinuousDynamics() && (t - this.lastDrawTime >= minDynamicsInterval)"), "must throttle idle continuous redraws");
});
