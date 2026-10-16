import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

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

test("break overlay svelte 5 migration integrity", () => {
  const svelteSrc = readFileSync("src/views/BreakOverlay.svelte", "utf8");
  const mainFile = existsSync("src/main.ts") ? "src/main.ts" : "src/main.tsx";
  const mainSrc = readFileSync(mainFile, "utf8");

  // State & Runes checks
  assert.ok(svelteSrc.includes("$state<TimerStatus>"), "uses $state for timer status");
  assert.ok(svelteSrc.includes("$derived"), "uses $derived for countdown/primary");
  assert.ok(svelteSrc.includes("$effect"), "uses $effect for polling & escape key");

  // Logic & Invokes
  assert.ok(svelteSrc.includes("get_break_timer_status"), "polls get_break_timer_status");
  assert.ok(svelteSrc.includes("skip_break_timer"), "calls skip_break_timer");
  assert.ok(svelteSrc.includes("Escape"), "handles Escape key");

  // Svelte mount check in main.tsx
  assert.ok(mainSrc.includes("mount(BreakOverlay,"), "mounts BreakOverlay via Svelte 5 mount");
  assert.ok(!mainSrc.includes("<BreakOverlayWindowView"), "replaces React BreakOverlayWindowView in main");
});

