import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("PetAnimationPicker Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/pet/PetAnimationPicker.svelte"), "PetAnimationPicker exists");
  const src = readFileSync("src/components/pet/PetAnimationPicker.svelte", "utf8");

  // Props & Runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("selectedState"), "tracks selectedState");
  assert.ok(src.includes("hoveredClip"), "tracks hoveredClip for live preview");

  // States: Idle, Working, Waiting, Done, Celebrate, Sleepy, Level up
  assert.ok(src.includes('"idle"'), "includes idle state");
  assert.ok(src.includes('"working"'), "includes working state");
  assert.ok(src.includes('"waiting"'), "includes waiting state");
  assert.ok(src.includes('"done"'), "includes done state");
  assert.ok(src.includes('"celebrate"'), "includes celebrate state");
  assert.ok(src.includes('"sleepy"'), "includes sleepy state");
  assert.ok(src.includes('"levelup"'), "includes levelup state");

  // UI copy
  assert.ok(src.includes("Animations"), "contains Animations header");
  assert.ok(src.includes("Hover a clip to preview it."), "contains hover preview instruction text");
  assert.ok(src.includes("Clip"), "renders clip label cards");

  // Persistence
  assert.ok(src.includes("ap_bind_"), "reads and saves ap_bind_ overrides to localStorage");

  // Zero emojis
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "PetAnimationPicker must contain zero emojis");
});

test("AgentPetView integrates PetAnimationPicker", () => {
  const src = readFileSync("src/views/AgentPetView.svelte", "utf8");
  assert.ok(src.includes("PetAnimationPicker"), "imports and mounts PetAnimationPicker");
});
