import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("petMapping exports favorite roster management APIs and integration", () => {
  assert.ok(existsSync("src/lib/petMapping.ts"), "petMapping.ts exists");
  const mappingSrc = readFileSync("src/lib/petMapping.ts", "utf8");
  const settingsSrc = readFileSync("src/views/AgentPetSettingsView.svelte", "utf8");
  const overlaySrc = readFileSync("src/views/PetOverlay.svelte", "utf8");

  // Key exports in petMapping.ts
  assert.ok(mappingSrc.includes("getFavoritePets"), "exports getFavoritePets");
  assert.ok(mappingSrc.includes("setFavoritePets"), "exports setFavoritePets");
  assert.ok(mappingSrc.includes("setFavoritePetSlot"), "exports setFavoritePetSlot");
  assert.ok(mappingSrc.includes("DEFAULT_FAVORITE_PETS"), "exports DEFAULT_FAVORITE_PETS");
  assert.ok(mappingSrc.includes("FAVORITE_PETS_KEY"), "exports FAVORITE_PETS_KEY");

  // Settings view integration
  assert.ok(settingsSrc.includes("Bộ 3 Companion Yêu Thích"), "renders 3 favorites roster UI");
  assert.ok(settingsSrc.includes("setFavoritePetSlot"), "wires slot updates to setFavoritePetSlot");
  assert.ok(settingsSrc.includes("Slot 1 (Solo/Chính)"), "renders slot 1 label");
  assert.ok(settingsSrc.includes("Slot 2 (Subagent 1)"), "renders slot 2 label");
  assert.ok(settingsSrc.includes("Slot 3 (Subagent 2)"), "renders slot 3 label");

  // Overlay quick switcher
  assert.ok(overlaySrc.includes("setFavoritePetSlot(0, newPet)"), "overlay care menu switches primary pet slot 0");
});
