import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("PingsWheelView Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/views/PingsWheelView.svelte"), "src/views/PingsWheelView.svelte exists");
  const src = readFileSync("src/views/PingsWheelView.svelte", "utf8");

  // 1. Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // 2. Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "PingsWheelView.svelte must contain zero emojis");

  // 3. Required Lucide vector icons
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = [
    "Target",
    "Volume2",
    "VolumeX",
    "RotateCcw",
    "Sliders",
    "Sparkles",
    "Shield",
    "Search",
    "Check",
    "Flame",
    "Zap",
    "Crosshair",
    "Smile",
    "AlertTriangle",
    "Gamepad2",
    "GripVertical",
    "Radio",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required vector icon ${icon}`);
  }

  // 4. Subcomponents & utilities
  assert.ok(src.includes("PingVectorIcon"), "uses PingVectorIcon component");
  assert.ok(src.includes("Modal"), "uses Modal component for reset confirmation");
  assert.ok(src.includes("toastState"), "integrates toastState notifications");

  // 5. Interactive preview wheel with real-time mouse angle and hover sector highlight
  assert.ok(src.includes("mouseAngleDeg"), "tracks real-time mouse angle degrees");
  assert.ok(src.includes("hoverSlice"), "tracks hover slice index");
  assert.ok(src.includes("handleWheelPointerMove"), "implements real-time pointer tracking on wheel");
  assert.ok(src.includes("sectorPath"), "renders sectors using sectorPath helper");
  assert.ok(src.includes("DIRECTIONS"), "enumerates 8 directional slices");

  // 6. Drag-and-drop & click assignment from catalog
  assert.ok(src.includes("dragOverSlice"), "tracks drag-over slice target");
  assert.ok(src.includes("draggedAssetId"), "tracks dragged asset identifier");
  assert.ok(src.includes("handleAssignAssetToSlice"), "handles assigning asset to slice");
  assert.ok(src.includes("handleAssignAsset"), "handles assigning asset to focused slice");

  // 7. Hotkey trigger selector & emote wheel trigger
  assert.ok(src.includes("TRIGGERS"), "uses TRIGGERS list");
  assert.ok(src.includes("settings.trigger"), "binds primary trigger key");
  assert.ok(src.includes("settings.emote_trigger"), "binds emote wheel trigger key");

  // 8. Sliders & audio / gesture feedback
  assert.ok(src.includes("drag_threshold_px"), "supports drag threshold slider");
  assert.ok(src.includes("settings.volume"), "supports chime volume slider");
  assert.ok(src.includes("settings.click_ping"), "supports quick alert click ping toggle");
  assert.ok(src.includes("settings.tick_sound"), "supports transition tick sound toggle");
  assert.ok(src.includes("volume-slider"), "applies Pingloom volume-slider class");
  assert.ok(src.includes("playSectorTick"), "plays tick sound on sector transition");
  assert.ok(src.includes("playPingChime"), "plays harmonic chime audio on test fire");

  // 9. Icon catalog browser with categories and search
  assert.ok(src.includes("filteredCatalog"), "filters catalog dynamically");
  assert.ok(src.includes("catalogCategory"), "supports category filtering");
  assert.ok(src.includes("searchQuery"), "supports text search filtering");

  // 10. Reset confirmation modal & Backend Save Settings
  assert.ok(src.includes("isResetModalOpen"), "manages reset confirmation modal open state");
  assert.ok(src.includes("DEFAULT_PINGLOOM_SETTINGS"), "restores DEFAULT_PINGLOOM_SETTINGS on reset");
  assert.ok(src.includes("save_ping_settings"), "persists settings via save_ping_settings invoke");
  assert.ok(src.includes("toggle_ping_overlay"), "supports desktop transparent overlay toggle");
});

test("App.svelte integrates PingsWheelView on pings tab", () => {
  const appSrc = readFileSync("src/App.svelte", "utf8");
  assert.ok(appSrc.includes("PingsWheelView"), "imports and references PingsWheelView");
  assert.ok(
    appSrc.includes('activeTab === "pings"') && appSrc.includes("<PingsWheelView"),
    "renders PingsWheelView when activeTab === 'pings'"
  );
  assert.equal(emojiRegex.test(appSrc), false, "App.svelte must contain zero emojis");
});

test("PingsWheelView integrates Pingloom settings, manifest, emote wheel and sound previews", () => {
  const src = readFileSync("src/views/PingsWheelView.svelte", "utf8");

  // Pingloom settings commands
  assert.ok(src.includes("get_pingloom_settings"), "invokes get_pingloom_settings");
  assert.ok(src.includes("save_pingloom_settings"), "invokes save_pingloom_settings");

  // Manifest and full catalog
  assert.ok(src.includes("getPingloomAssetsManifest"), "fetches Pingloom assets manifest");
  assert.ok(src.includes("createEmoteCatalogEntry"), "integrates manifest emotes into catalog");

  // WebP emote preview and switching
  assert.ok(src.includes("/pingloom/emotes/"), "renders emote WebP previews");
  assert.ok(src.includes('activeSubTab === "emotes"'), "supports switching between tactical ping and emote wheel");

  // Audio preview playback
  assert.ok(src.includes("playAudioPreview") || src.includes("playPingSound"), "plays sound preview on clicks");
});
