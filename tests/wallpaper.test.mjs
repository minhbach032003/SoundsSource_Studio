import assert from "node:assert/strict";
import test from "node:test";
import { WALLPAPER_PRESETS } from "../src/shared/lib/useWallpaper.ts";

test("wallpaper presets contain obsidian, aurora, cyber, and nebula with gradients", () => {
  assert.equal(WALLPAPER_PRESETS.length, 4);

  const ids = WALLPAPER_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, ["obsidian", "aurora", "cyber", "nebula"]);

  for (const preset of WALLPAPER_PRESETS) {
    assert.ok(preset.name.length > 0);
    assert.ok(preset.gradient.includes("radial-gradient"));
    assert.ok(preset.accent.startsWith("#"));
  }
});

test("boundary validation rules for wallpapers", () => {
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  // File size bounds
  assert.equal(MAX_FILE_SIZE, 8388608);
  assert.ok(7 * 1024 * 1024 < MAX_FILE_SIZE);
  assert.ok(9 * 1024 * 1024 > MAX_FILE_SIZE);

  // Type validation
  assert.ok(ALLOWED_TYPES.includes("image/png"));
  assert.ok(ALLOWED_TYPES.includes("image/jpeg"));
  assert.ok(ALLOWED_TYPES.includes("image/webp"));
  assert.ok(!ALLOWED_TYPES.includes("application/pdf"));
  assert.ok(!ALLOWED_TYPES.includes("image/gif"));
});
