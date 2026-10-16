import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("PingVectorIcon Svelte 5 component integrity", () => {
  const src = readFileSync("src/components/radial/PingVectorIcon.svelte", "utf8");

  // Props & Runes
  assert.ok(src.includes("$props()"), "uses $props() for component props");
  assert.ok(src.includes("$derived("), "uses $derived for reactive evaluation");
  assert.ok(src.includes("assetId"), "supports assetId prop");

  // Zero emojis rule
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "PingVectorIcon must contain zero emojis");

  // LoL custom SVG icons
  const customLolIds = [
    "danger",
    "omw",
    "assist",
    "missing",
    "push",
    "allin",
    "needvision",
    "enemyvision",
    "retreat",
    "bait",
    "visioncleared",
    "baron",
    "dragon",
    "turret",
  ];
  for (const id of customLolIds) {
    assert.ok(src.includes(`"${id}"`), `includes custom LoL vector path for ${id}`);
  }

  // Lucide icons import
  assert.ok(src.includes('from "@lucide/svelte"'), "imports vector icons from @lucide/svelte");
});

test("PingBurstMarker Svelte 5 component integrity", () => {
  const src = readFileSync("src/components/radial/PingBurstMarker.svelte", "utf8");

  // Props & Runes
  assert.ok(src.includes("$props()"), "uses $props() for component props");
  assert.ok(src.includes("$state<"), "uses $state for stage animation");
  assert.ok(src.includes("$effect("), "uses $effect for animation timers");

  // Animation stages
  assert.ok(src.includes('"arrive"'), "includes arrive stage");
  assert.ok(src.includes('"pulse"'), "includes pulse stage");
  assert.ok(src.includes('"fade"'), "includes fade stage");

  // Formatting helper
  assert.ok(src.includes("formatAssetName"), "uses formatAssetName helper");

  // Zero emojis rule
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "PingBurstMarker must contain zero emojis");
});

test("GlobalPingHost Svelte 5 component integrity", () => {
  const src = readFileSync("src/components/radial/GlobalPingHost.svelte", "utf8");

  // Props & Runes
  assert.ok(src.includes("$props()"), "uses $props() for component props");
  assert.ok(src.includes("$state<"), "uses $state for settings and bursts");
  assert.ok(src.includes("$derived("), "uses $derived for reactive wheel");
  assert.ok(src.includes("$effect("), "uses $effect for gesture machine lifecycle");

  // Gesture Engine & Audio Integration
  assert.ok(src.includes("LolPingGestureMachine"), "uses LolPingGestureMachine");
  assert.ok(src.includes("playPingChime"), "uses playPingChime");

  // Pingloom geometry and settings
  assert.ok(src.includes("DIRECTIONS"), "uses DIRECTIONS");
  assert.ok(src.includes("sectorPath"), "uses sectorPath");
  assert.ok(src.includes("DEFAULT_CATALOG"), "uses DEFAULT_CATALOG");
  assert.ok(src.includes("DEFAULT_PINGLOOM_SETTINGS"), "uses DEFAULT_PINGLOOM_SETTINGS");

  // Subcomponents
  assert.ok(src.includes("PingBurstMarker"), "mounts PingBurstMarker");
  assert.ok(src.includes("PingVectorIcon"), "mounts PingVectorIcon");

  // Zero emojis rule
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "GlobalPingHost must contain zero emojis");
});

test("PingOverlay Svelte 5 view integrity", () => {
  const src = readFileSync("src/views/PingOverlay.svelte", "utf8");

  // Gesture handling belongs to the host, never a modifier-only second recognizer.
  const host = readFileSync("src/components/radial/GlobalPingHost.svelte", "utf8");
  const backend = readFileSync("crates/app/src/lib.rs", "utf8");
  for (const source of [src, host, backend]) {
    assert.ok(!source.includes("global-modifier-changed"));
    assert.ok(!source.includes("global-modifier-released"));
  }
  assert.ok(host.includes("if (isNativeOverlay && enabled)"), "only desktop overlay consumes native actions");
  assert.ok(host.includes("enabled: enabled && !isDesktop"), "no competing local desktop recognizer");
  assert.ok(host.includes("Number.isInteger(slot)"), "native selections are bounded");
  assert.ok(host.includes("if (disposed) unsub()"), "late subscriptions are cleaned up");

  // Transparent document styling
  assert.ok(src.includes("transparent"), "sets document/body styles to transparent");

  // Subcomponent mount
  assert.ok(src.includes("GlobalPingHost"), "mounts GlobalPingHost");

  // Zero emojis rule
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "PingOverlay must contain zero emojis");
});

test("main mounts all three overlays with Svelte 5 mount()", () => {
  const mainFile = existsSync("src/main.ts") ? "src/main.ts" : "src/main.tsx";
  const mainSrc = readFileSync(mainFile, "utf8");

  // Svelte 5 imports
  assert.ok(mainSrc.includes('import BreakOverlay from "./views/BreakOverlay.svelte"'), "imports BreakOverlay.svelte");
  assert.ok(mainSrc.includes('import PetOverlay from "./views/PetOverlay.svelte"'), "imports PetOverlay.svelte");
  assert.ok(mainSrc.includes('import PingOverlay from "./views/PingOverlay.svelte"'), "imports PingOverlay.svelte");

  // mount calls
  assert.ok(mainSrc.includes("mount(BreakOverlay, { target: rootElement })"), "mounts BreakOverlay via Svelte 5 mount");
  assert.ok(mainSrc.includes("mount(PetOverlay, { target: rootElement })"), "mounts PetOverlay via Svelte 5 mount");
  assert.ok(mainSrc.includes("mount(PingOverlay, { target: rootElement })"), "mounts PingOverlay via Svelte 5 mount");

  // All 3 overlays are handled before React root fallback
  assert.ok(mainSrc.includes("isBreakOverlay"), "checks isBreakOverlay");
  assert.ok(mainSrc.includes("isPetOverlay"), "checks isPetOverlay");
  assert.ok(mainSrc.includes("isPingOverlay"), "checks isPingOverlay");
});

test("GlobalPingHost and PingOverlay integrate native pingloom:action and emote animations", () => {
  const hostSrc = readFileSync("src/components/radial/GlobalPingHost.svelte", "utf8");
  const overlaySrc = readFileSync("src/views/PingOverlay.svelte", "utf8");
  const markerSrc = readFileSync("src/components/radial/PingBurstMarker.svelte", "utf8");

  // pingloom:action event listeners
  assert.ok(hostSrc.includes('"pingloom:action"'), "GlobalPingHost listens to pingloom:action event");
  assert.ok(!overlaySrc.includes('"pingloom:action"'), "view delegates native event handling to one host");

  // Lifecycle event branches
  assert.ok(hostSrc.includes("wheel_open"), "handles wheel_open action");
  assert.ok(hostSrc.includes("wheel_slice") || hostSrc.includes("wheel_move"), "handles wheel_slice / move action");
  assert.ok(hostSrc.includes("select"), "handles select action");
  assert.ok(hostSrc.includes("click"), "handles click action");
  assert.ok(hostSrc.includes("wheel_close") || hostSrc.includes("cancel"), "handles wheel_close / cancel action");

  // Emote WebP asset rendering & spring burst
  assert.ok(hostSrc.includes("/pingloom/emotes/"), "GlobalPingHost renders WebP emotes from /pingloom/emotes/");
  assert.ok(markerSrc.includes("/pingloom/emotes/"), "PingBurstMarker renders WebP emotes from /pingloom/emotes/");
  assert.ok(markerSrc.includes("spring-burst") || markerSrc.includes("ping-spring-arrive"), "PingBurstMarker uses spring animation");
});
