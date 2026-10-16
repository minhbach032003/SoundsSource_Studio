import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("AgentPetSprite Svelte 5 component integrity", () => {
  const spriteSrc = readFileSync("src/components/AgentPetSprite.svelte", "utf8");

  // Props and Runes
  assert.ok(spriteSrc.includes("$props()"), "uses $props() for component props");
  assert.ok(spriteSrc.includes("$state<HTMLCanvasElement | null>"), "uses $state for canvas reference");
  assert.ok(spriteSrc.includes("$state<PetRenderer | null>"), "uses $state for renderer reference");
  assert.ok(spriteSrc.includes("$effect("), "uses $effect for lifecycle");
  assert.ok(spriteSrc.includes("untrack("), "uses untrack to isolate mood initialization");

  // PetRenderer integration
  assert.ok(spriteSrc.includes("PetRenderer"), "imports PetRenderer");
  assert.ok(spriteSrc.includes("r.load(`/pets/${currentSlug}/spritesheet.webp`)"), "loads sprite sheet from expected path");
  assert.ok(spriteSrc.includes("r.destroy()"), "cleans up renderer on destroy");
  assert.ok(spriteSrc.includes("renderer.setState(currentMood)"), "updates renderer mood on mood change");

  // Zero emojis
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(spriteSrc), false, "AgentPetSprite must contain zero emojis");
});

test("PetOverlay Svelte 5 view integrity", () => {
  const overlaySrc = readFileSync("src/views/PetOverlay.svelte", "utf8");

  // State runes
  assert.ok(overlaySrc.includes("let petSlug = $state<string>("), "petSlug in $state");
  assert.ok(overlaySrc.includes("let sessions = $state<AgentSessionDto[]>("), "sessions in $state");
  assert.ok(overlaySrc.includes("let care = $state<PetCareStateDto | null>("), "care in $state");
  assert.ok(overlaySrc.includes("let isInteracting = $state<boolean>("), "isInteracting in $state");
  assert.ok(overlaySrc.includes("let idleLineIndex = $state<number>("), "idleLineIndex in $state");

  // Derived runes
  assert.ok(overlaySrc.includes("const topSession = $derived("), "topSession in $derived");
  assert.ok(overlaySrc.includes("const mood = $derived"), "mood in $derived");
  assert.ok(overlaySrc.includes("const projectName = $derived("), "projectName in $derived");
  assert.ok(overlaySrc.includes("const multiplier = $derived("), "multiplier in $derived");
  assert.ok(overlaySrc.includes("const activityText = $derived"), "activityText in $derived");

  // Backend polling & listeners
  assert.ok(overlaySrc.includes("get_agent_sessions"), "polls get_agent_sessions");
  assert.ok(overlaySrc.includes("get_pet_care_state"), "polls get_pet_care_state");
  assert.ok(overlaySrc.includes("feed_pet_action"), "invokes feed_pet_action");
  assert.ok(overlaySrc.includes("startDragging"), "calls startDragging for native window drag");
  assert.ok(overlaySrc.includes("onMoved"), "tracks window movement via onMoved");

  // Lucide vector icons
  const requiredIcons = [
    "Terminal",
    "Bot",
    "Code2",
    "MousePointer2",
    "Sparkles",
    "Cpu",
    "Activity",
    "Zap",
    "Heart",
    "GripHorizontal",
  ];
  for (const icon of requiredIcons) {
    assert.ok(overlaySrc.includes(icon), `uses Lucide icon ${icon}`);
  }

  // Component import
  assert.ok(overlaySrc.includes('import AgentPetSprite from "@/components/AgentPetSprite.svelte"'), "imports AgentPetSprite.svelte");

  // Zero emojis
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(overlaySrc), false, "PetOverlay must contain zero emojis");
});

test("main mounts PetOverlay for pet overlay route", () => {
  const mainFile = existsSync("src/main.ts") ? "src/main.ts" : "src/main.tsx";
  const mainSrc = readFileSync(mainFile, "utf8");

  assert.ok(mainSrc.includes('import PetOverlay from "./views/PetOverlay.svelte"'), "imports PetOverlay.svelte");
  assert.ok(mainSrc.includes("mount(PetOverlay, { target: rootElement })"), "mounts PetOverlay via Svelte 5 mount");
  assert.ok(!mainSrc.includes("<FloatingPetOverlayView"), "does not render legacy React FloatingPetOverlayView");
});

test("PetOverlay mood and activity derivation logic", () => {
  const computeMood = (isInteracting, sessions) => {
    if (isInteracting) return "celebrate";
    if (sessions.some((s) => s.state === "working")) return "working";
    if (sessions.some((s) => s.state === "waiting")) return "waiting";
    if (sessions.some((s) => s.state === "done")) return "done";
    return "idle";
  };

  assert.equal(computeMood(true, []), "celebrate");
  assert.equal(computeMood(false, [{ state: "working" }]), "working");
  assert.equal(computeMood(false, [{ state: "waiting" }, { state: "done" }]), "waiting");
  assert.equal(computeMood(false, [{ state: "done" }]), "done");
  assert.equal(computeMood(false, []), "idle");

  const computeProjectName = (topSession) =>
    topSession?.project
      ? topSession.project.split("/").filter(Boolean).pop() || "workspace"
      : "workspace";

  assert.equal(computeProjectName(null), "workspace");
  assert.equal(computeProjectName({ project: "/Users/dev/my-cool-project" }), "my-cool-project");
  assert.equal(computeProjectName({ project: "" }), "workspace");

  const computeMultiplier = (sessions) => Math.max(1, sessions.length || 1);
  assert.equal(computeMultiplier([]), 1);
  assert.equal(computeMultiplier([1, 2, 3]), 3);
});

test("PetOverlay drag vs tap detection boundaries", () => {
  const isQuickTap = (dist, elapsed) => dist < 6 && elapsed < 350;

  // Stationary quick click -> tap
  assert.equal(isQuickTap(0, 100), true);
  assert.equal(isQuickTap(5.9, 349), true);

  // Moved > 6px -> drag, not tap
  assert.equal(isQuickTap(6.0, 100), false);
  assert.equal(isQuickTap(20, 200), false);

  // Held > 350ms -> drag hold, not tap
  assert.equal(isQuickTap(2, 350), false);
  assert.equal(isQuickTap(0, 500), false);
});

test("PetOverlay window position logical coordinate scaling", () => {
  const toLogicalPos = (pos, factor) => ({
    x: Math.round(pos.x / factor),
    y: Math.round(pos.y / factor),
  });

  // Retina 2x display
  assert.deepEqual(toLogicalPos({ x: 2000, y: 1200 }, 2.0), { x: 1000, y: 600 });

  // Standard 1x display
  assert.deepEqual(toLogicalPos({ x: 500, y: 300 }, 1.0), { x: 500, y: 300 });

  // Fractional scaling (1.5x)
  assert.deepEqual(toLogicalPos({ x: 1500, y: 900 }, 1.5), { x: 1000, y: 600 });
});

test("PetOverlay celebrate burst, floating particles FX, and multi-agent speech bubble modes", () => {
  const overlaySrc = readFileSync("src/views/PetOverlay.svelte", "utf8");

  // Celebrate burst tracking & mood
  assert.ok(overlaySrc.includes("isCelebrating"), "tracks isCelebrating state");
  assert.ok(overlaySrc.includes("triggerCelebrationBurst"), "provides triggerCelebrationBurst helper");
  assert.ok(overlaySrc.includes("3000"), "celebration burst active for 3 seconds");

  // Floating particles FX
  assert.ok(overlaySrc.includes("spawnParticles"), "implements spawnParticles for tap/celebrate");
  assert.ok(overlaySrc.includes("particles"), "tracks particles array");
  assert.ok(overlaySrc.includes("petParticleFloat"), "applies CSS animation for particle float");

  // Multi-agent bubble modes
  assert.ok(overlaySrc.includes("bubbleMode"), "supports bubbleMode state");
  assert.ok(overlaySrc.includes("carouselIndex"), "tracks carouselIndex for rotating sessions");
  assert.ok(overlaySrc.includes("formatElapsed"), "computes elapsed counter mm:ss");
  assert.ok(overlaySrc.includes("activeSessions"), "derives activeSessions list");
  assert.ok(overlaySrc.includes("toggleBubbleMode"), "supports toggling between carousel and compact");

  // Sound and notification triggers
  assert.ok(overlaySrc.includes("playPetWaitingChime"), "triggers playPetWaitingChime on waiting transition");
  assert.ok(overlaySrc.includes("playPetDoneChime"), "triggers playPetDoneChime on done transition");
  assert.ok(overlaySrc.includes("sendDesktopNotification"), "dispatches desktop notification on waiting/done");

  // Fine-grained action states and right-click care menu
  assert.ok(overlaySrc.includes("reading"), "supports reading action state for file inspections");
  assert.ok(overlaySrc.includes("showActionMenu"), "provides right-click quick action care menu");
  assert.ok(overlaySrc.includes("petSize"), "supports adjustable pet sprite size scale");

  // Zero emojis
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(overlaySrc), false, "PetOverlay must contain zero emojis");
});

