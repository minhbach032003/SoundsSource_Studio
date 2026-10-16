import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("AgentPetView Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/views/AgentPetView.svelte"), "src/views/AgentPetView.svelte exists");
  const src = readFileSync("src/views/AgentPetView.svelte", "utf8");

  // Svelte 5 Runes
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses $state");
  assert.ok(src.includes("$derived<") || src.includes("$derived("), "uses $derived");
  assert.ok(src.includes("$effect("), "uses $effect");

  // Hero companion with AgentPetSprite
  assert.ok(src.includes("AgentPetSprite"), "uses AgentPetSprite component");

  // The 5 rank hues preserved verbatim
  const rankHues = ["#10b981", "#14b8a6", "#fb7185", "#a855f7", "#f59e0b"];
  for (const hue of rankHues) {
    assert.ok(src.includes(hue), `preserves rank hue ${hue} verbatim`);
  }

  // 5 stage names present
  for (const stage of ["Hatchling", "Companion", "Scout", "Hero", "Legend"]) {
    assert.ok(src.includes(stage), `includes progression stage ${stage}`);
  }

  // Vitals & Progression metrics
  assert.ok(src.includes("careState"), "tracks pet care state");
  assert.ok(src.includes("petEnergy"), "tracks energy vitals");
  assert.ok(src.includes("petMood"), "tracks mood vitals");
  assert.ok(src.includes("petFocus"), "tracks focus vitals");
  assert.ok(src.includes("streak_days"), "tracks streak days");
  assert.ok(src.includes("tokens_today"), "tracks tokens today");
  assert.ok(src.includes("meals_today"), "tracks meals today");

  // Action buttons calling backend feed_pet_action
  assert.ok(src.includes("feed_pet_action"), "invokes backend feed_pet_action");
  assert.ok(src.includes("handlePetAction"), "provides Pet action handler");
  assert.ok(src.includes("handleFeedAction"), "provides Feed action handler");
  assert.ok(src.includes("handleSleepAction"), "provides Sleep action handler");
  assert.ok(src.includes("handleCelebrateAction"), "provides Celebrate action handler");

  // Desktop overlay toggle
  assert.ok(src.includes("open_pet_overlay_window"), "implements open_pet_overlay_window toggle");

  // Sub-tabs or sections embedding PetGallery, PetSocketPanel, and PetActivityStream
  assert.ok(src.includes("<PetGallery"), "embeds PetGallery component");
  assert.ok(src.includes("<PetSocketPanel"), "embeds PetSocketPanel component");
  assert.ok(src.includes("<PetActivityStream"), "embeds PetActivityStream component");

  // Vector icons only from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports vector icons from @lucide/svelte");
  const requiredIcons = [
    "Heart",
    "Zap",
    "Coffee",
    "Sparkles",
    "Utensils",
    "Bot",
    "Laptop",
    "Radio",
    "Crown",
    "Award",
    "Trophy",
    "RotateCcw",
    "Send",
    "Terminal",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `uses vector icon ${icon}`);
  }

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "AgentPetView.svelte must contain zero emojis");
});

test("PetGallery Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/pet/PetGallery.svelte"), "PetGallery.svelte exists");
  const src = readFileSync("src/components/pet/PetGallery.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses $state");
  assert.ok(src.includes("$derived("), "uses $derived");

  // Sprite preview using AgentPetSprite
  assert.ok(src.includes("AgentPetSprite"), "uses AgentPetSprite for preview");

  // Roster checks
  assert.ok(src.includes("INSTALLED_PETS"), "references installed pets roster");
  assert.ok(src.includes("onSelectPet") || src.includes("handleEquip"), "supports pet equip/select");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "PetGallery.svelte must contain zero emojis");
});

test("PetSocketPanel Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/pet/PetSocketPanel.svelte"), "PetSocketPanel.svelte exists");
  const src = readFileSync("src/components/pet/PetSocketPanel.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses $state");

  // Socket IPC status with specified path
  assert.ok(src.includes("/tmp/rust-sound-agent-pet.sock"), "references /tmp/rust-sound-agent-pet.sock");

  // Active sessions, simulator, connection state
  assert.ok(src.includes("agentSessions"), "displays active agent sessions");
  assert.ok(src.includes("onSimulatePing"), "supports event simulator/sender");
  assert.ok(src.includes("showDesktopOverlay"), "supports desktop bridge controls");
  assert.ok(src.includes("onToggleHook"), "supports agent hook integrations");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "PetSocketPanel.svelte must contain zero emojis");
});

test("PetActivityStream Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/pet/PetActivityStream.svelte"), "PetActivityStream.svelte exists");
  const src = readFileSync("src/components/pet/PetActivityStream.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses $state");
  assert.ok(src.includes("$derived("), "uses $derived");

  // Filterable categories: coding, audio, vitals, system
  for (const cat of ["coding", "audio", "vitals", "system"]) {
    assert.ok(src.includes(cat), `supports category ${cat}`);
  }

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "PetActivityStream.svelte must contain zero emojis");
});

test("App.svelte integrates AgentPetView on pet tab", () => {
  const appSrc = readFileSync("src/App.svelte", "utf8");

  assert.ok(
    appSrc.includes('import AgentPetView from "@/views/AgentPetView.svelte"') ||
      appSrc.includes("import AgentPetView from './views/AgentPetView.svelte'"),
    "App.svelte imports AgentPetView"
  );
  assert.ok(
    appSrc.includes('<AgentPetView />') || appSrc.includes('<AgentPetView/>'),
    "App.svelte renders <AgentPetView /> on pet tab"
  );
});

test("Full 14 Achievements system definitions and metadata", () => {
  const typesSrc = readFileSync("src/components/pet/types.ts", "utf8");

  const requiredAchievements = [
    "firstMeal",
    "sessions100",
    "sessions500",
    "tokens1M",
    "tokens10M",
    "tokens50M",
    "level5",
    "level10",
    "level20",
    "level35",
    "streak7",
    "streak14",
    "streak30",
    "nightOwl",
  ];

  for (const ach of requiredAchievements) {
    assert.ok(typesSrc.includes(`id: "${ach}"`), `ACHIEVEMENTS_METADATA includes achievement ${ach}`);
  }

  // Zero emojis rule
  assert.equal(emojiRegex.test(typesSrc), false, "types.ts must contain zero emojis");
});

test("PetAudio Web Audio synthesizers and desktop notification triggers", () => {
  assert.ok(existsSync("src/lib/petAudio.ts"), "src/lib/petAudio.ts exists");
  const audioSrc = readFileSync("src/lib/petAudio.ts", "utf8");

  assert.ok(audioSrc.includes("playPetDoneChime"), "exports playPetDoneChime");
  assert.ok(audioSrc.includes("playPetWaitingChime"), "exports playPetWaitingChime");
  assert.ok(audioSrc.includes("sendDesktopNotification"), "exports sendDesktopNotification");
  assert.ok(audioSrc.includes("shouldTriggerPetAlert"), "exports shouldTriggerPetAlert");
  assert.ok(audioSrc.includes("AudioContext"), "uses Web Audio API synthesizers");

  const viewSrc = readFileSync("src/views/AgentPetView.svelte", "utf8");
  assert.ok(viewSrc.includes("playPetDoneChime"), "AgentPetView connects playPetDoneChime");
  assert.ok(viewSrc.includes("playPetWaitingChime"), "AgentPetView connects playPetWaitingChime");
  assert.ok(viewSrc.includes("sendDesktopNotification"), "AgentPetView connects sendDesktopNotification");

  // Zero emojis
  assert.equal(emojiRegex.test(audioSrc), false, "petAudio.ts must contain zero emojis");
});

