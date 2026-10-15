import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLPAPER_PRESETS,
  validateWallpaperFile,
  computeBackgroundStyle,
  MAX_FILE_SIZE,
} from "../src/shared/lib/useWallpaper.ts";

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

test("boundary validation rules for wallpapers via validateWallpaperFile", () => {
  // Valid files
  assert.deepEqual(
    validateWallpaperFile({ name: "background.png", type: "image/png", size: 1024 }),
    { valid: true }
  );
  assert.deepEqual(
    validateWallpaperFile({ name: "photo.JPG", type: "image/jpeg", size: 2 * 1024 * 1024 }),
    { valid: true }
  );
  assert.deepEqual(
    validateWallpaperFile({ name: "graphic.webp", type: "image/webp", size: 500 }),
    { valid: true }
  );

  // Fallback when type is empty (Finder / WebKit drag-drop edgecase)
  assert.deepEqual(
    validateWallpaperFile({ name: "drop-image.png", type: "", size: 2048 }),
    { valid: true }
  );
  assert.deepEqual(
    validateWallpaperFile({ name: "DROP_IMAGE.JPEG", type: "", size: 2048 }),
    { valid: true }
  );

  // File size bounds (> 8MB)
  const oversized = validateWallpaperFile({
    name: "huge.png",
    type: "image/png",
    size: MAX_FILE_SIZE + 10,
  });
  assert.equal(oversized.valid, false);
  assert.match(oversized.error, /exceeds/i);

  // Invalid formats
  const invalidType = validateWallpaperFile({
    name: "doc.pdf",
    type: "application/pdf",
    size: 1024,
  });
  assert.equal(invalidType.valid, false);
  assert.match(invalidType.error, /invalid file format/i);

  const invalidExt = validateWallpaperFile({
    name: "script.sh",
    type: "",
    size: 1024,
  });
  assert.equal(invalidExt.valid, false);
});

test("computeBackgroundStyle wraps custom image in proper CSS quotes", () => {
  const customDataUrl = "data:image/jpeg;base64,sampleBase64StringWithCommas,andSemicolons;";
  const style = computeBackgroundStyle({
    mode: "custom",
    customImage: customDataUrl,
    presetId: "obsidian",
  });

  assert.equal(style.backgroundImage, `url("${customDataUrl}")`);
  assert.equal(style.backgroundSize, "cover");
  assert.equal(style.backgroundPosition, "center center");
});

test("computeBackgroundStyle falls back to preset gradient when in preset mode", () => {
  const style = computeBackgroundStyle({
    mode: "preset",
    customImage: "data:image/jpeg;base64,abc",
    presetId: "aurora",
  });

  assert.ok(style.backgroundImage.includes("radial-gradient"));
  assert.equal(style.backgroundSize, "cover");
});
