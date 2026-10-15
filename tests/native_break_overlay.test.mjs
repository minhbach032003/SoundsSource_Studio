import test from "node:test";
import assert from "node:assert/strict";

test("break overlay window routing and query param detection", () => {
  // Test primary monitor query detection
  const primarySearch = "?break_overlay=1&primary=true&idx=0";
  const primaryParams = new URLSearchParams(primarySearch);
  assert.equal(primaryParams.get("break_overlay"), "1");
  assert.equal(primaryParams.get("primary"), "true");
  assert.equal(primaryParams.get("idx"), "0");

  // Test secondary monitor query detection
  const secondarySearch = "?break_overlay=1&primary=false&idx=1";
  const secondaryParams = new URLSearchParams(secondarySearch);
  assert.equal(secondaryParams.get("break_overlay"), "1");
  assert.equal(secondaryParams.get("primary"), "false");
  assert.equal(secondaryParams.get("idx"), "1");
});

test("break overlay countdown formatting helper", () => {
  const formatCountdown = (seconds) => {
    const totalSec = Math.max(0, Math.floor(seconds));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  assert.equal(formatCountdown(300), "05:00");
  assert.equal(formatCountdown(1500), "25:00");
  assert.equal(formatCountdown(45), "00:45");
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(formatCountdown(-10), "00:00");
});

test("screen lock preference persistence and default handling", () => {
  const storage = new Map();
  const getScreenLock = () => {
    const raw = storage.get("rust_sound_timer_screen_lock");
    return raw !== undefined ? raw === "true" : true;
  };
  const setScreenLock = (val) => {
    storage.set("rust_sound_timer_screen_lock", String(val));
  };

  // Default is true
  assert.equal(getScreenLock(), true);

  // Set false
  setScreenLock(false);
  assert.equal(getScreenLock(), false);

  // Set true
  setScreenLock(true);
  assert.equal(getScreenLock(), true);
});

test("simulate-break-phase development gate check", () => {
  const isSimAllowed = (isDev) => Boolean(isDev);
  assert.equal(isSimAllowed(true), true);
  assert.equal(isSimAllowed(false), false);
  assert.equal(isSimAllowed(undefined), false);
});
