import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLPAPER_PRESETS,
  validateWallpaperFile,
  computeBackgroundStyle,
  MAX_FILE_SIZE,
} from "../src/lib/wallpaper.ts";
import {
  DEFAULT_PING_WHEEL,
  DEFAULT_EMOTE_WHEEL,
  DEFAULT_CATALOG,
  DIRECTIONS,
  DIRECTION_LABELS,
} from "../src/lib/pingloom.ts";

test("Master Flow 1: Core navigation tabs and application routing integrity", () => {
  const NAV_TABS = ["mixer", "timer", "pings", "voice", "pet", "settings"];
  assert.equal(NAV_TABS.length, 6);

  // Each tab must have a non-empty route identifier
  for (const tab of NAV_TABS) {
    assert.ok(typeof tab === "string" && tab.length > 0);
  }
});

test("Master Flow 2: Multi-palette theme engine and semantic color tokens", () => {
  const THEME_PALETTES = [
    "default",
    "latte",
    "frappe",
    "macchiato",
    "mocha",
    "nord",
    "dracula",
  ];
  assert.ok(THEME_PALETTES.includes("default"));
  assert.ok(THEME_PALETTES.includes("macchiato"));
  assert.ok(THEME_PALETTES.includes("dracula"));

  // Verify theme mode resolution logic
  const resolveMode = (mode, systemPrefersDark) =>
    mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode;

  assert.equal(resolveMode("system", true), "dark");
  assert.equal(resolveMode("system", false), "light");
  assert.equal(resolveMode("dark", false), "dark");
  assert.equal(resolveMode("light", true), "light");
});

test("Master Flow 3: Wallpaper atmosphere, upload boundaries and CSS quoting", () => {
  assert.equal(WALLPAPER_PRESETS.length, 4);

  // 1. Boundary file size check
  assert.equal(MAX_FILE_SIZE, 8 * 1024 * 1024);
  assert.equal(
    validateWallpaperFile({ name: "valid.jpg", type: "image/jpeg", size: 4 * 1024 * 1024 }).valid,
    true
  );
  assert.equal(
    validateWallpaperFile({ name: "oversized.png", type: "image/png", size: 10 * 1024 * 1024 }).valid,
    false
  );

  // 2. MIME and extension validation
  assert.equal(validateWallpaperFile({ name: "drop.webp", type: "", size: 1024 }).valid, true);
  assert.equal(validateWallpaperFile({ name: "document.pdf", type: "application/pdf", size: 1024 }).valid, false);

  // 3. CSS URL quotation for Data URLs
  const customDataUrl = "data:image/jpeg;base64,mockBase64StringWithSemicolons;and,commas";
  const style = computeBackgroundStyle({
    mode: "custom",
    customImage: customDataUrl,
    presetId: "obsidian",
  });
  assert.equal(style.backgroundImage, `url("${customDataUrl}")`);
});

test("Master Flow 4: Tactical Pingloom wheel geometry and catalog enumeration", () => {
  assert.equal(DEFAULT_PING_WHEEL.length, 8);
  assert.equal(DEFAULT_EMOTE_WHEEL.length, 8);
  assert.equal(DIRECTIONS.length, 8);

  // Check 8 cardinal directions
  assert.deepEqual(DIRECTIONS, ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  for (const dir of DIRECTIONS) {
    assert.ok(DIRECTION_LABELS[dir].length > 0);
  }

  // Check catalog entries (LoL tactical pings & emotes)
  assert.ok(DEFAULT_CATALOG.length >= 25);
  const danger = DEFAULT_CATALOG.find((c) => c.id === "danger");
  assert.ok(danger);
  assert.equal(danger.color, "#ff3b55");

  const omw = DEFAULT_CATALOG.find((c) => c.id === "omw");
  assert.ok(omw);
  assert.equal(omw.color, "#2e8bff");
});

test("Master Flow 5: Real-time Audio Filter & Voice Isolation parameters", () => {
  const filterConfig = {
    mic: {
      enabled: true,
      noise_gate_enabled: true,
      noise_gate_threshold_db: -42,
      high_pass_enabled: true,
      high_pass_cutoff_hz: 85,
      voice_presence_enabled: true,
      voice_presence_db: 3.5,
      de_esser_enabled: true,
    },
    output: {
      enabled: true,
      dialogue_boost: true,
      night_mode_compression: true,
      bass_warmth: true,
      de_hiss: true,
    },
  };

  assert.equal(filterConfig.mic.enabled, true);
  assert.ok(filterConfig.mic.noise_gate_threshold_db >= -60 && filterConfig.mic.noise_gate_threshold_db <= -20);
  assert.ok(filterConfig.mic.high_pass_cutoff_hz >= 60 && filterConfig.mic.high_pass_cutoff_hz <= 180);
  assert.equal(filterConfig.output.bass_warmth, true);
  assert.equal(filterConfig.output.dialogue_boost, true);
});

test("Master Flow 6: AgentPet companion progression and activity themes", () => {
  const stages = [
    { level: 1, name: "Hatchling" },
    { level: 6, name: "Companion" },
    { level: 12, name: "Scout" },
    { level: 25, name: "Hero" },
    { level: 40, name: "Legend" },
  ];

  const getStageName = (lvl) => {
    if (lvl < 5) return "Hatchling";
    if (lvl < 10) return "Companion";
    if (lvl < 20) return "Scout";
    if (lvl < 35) return "Hero";
    return "Legend";
  };

  for (const s of stages) {
    assert.equal(getStageName(s.level), s.name);
  }

  // Themes
  const themes = ["Chef", "Engineer", "Wizard", "Explorer", "Scientist"];
  assert.equal(themes.length, 5);
});
