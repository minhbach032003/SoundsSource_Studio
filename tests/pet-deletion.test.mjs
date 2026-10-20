import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("petMapping exports companion deletion and roster management APIs", () => {
  assert.ok(existsSync("src/lib/petMapping.ts"), "petMapping.ts exists");
  const mappingSrc = readFileSync("src/lib/petMapping.ts", "utf8");

  assert.ok(mappingSrc.includes("DELETED_PETS_KEY"), "exports DELETED_PETS_KEY");
  assert.ok(mappingSrc.includes("getDeletedPetIds"), "exports getDeletedPetIds");
  assert.ok(mappingSrc.includes("getActivePets"), "exports getActivePets");
  assert.ok(mappingSrc.includes("deletePet"), "exports deletePet");
  assert.ok(mappingSrc.includes("restorePet"), "exports restorePet");
  assert.ok(mappingSrc.includes("restoreAllPets"), "exports restoreAllPets");
});

test("PetGallery Svelte component supports deletion, confirmation modal, and restore", () => {
  assert.ok(existsSync("src/components/pet/PetGallery.svelte"), "PetGallery.svelte exists");
  const gallerySrc = readFileSync("src/components/pet/PetGallery.svelte", "utf8");

  // Uses Modal for destructive confirmation
  assert.ok(gallerySrc.includes("Modal"), "imports/uses Modal for delete confirmation");
  assert.ok(gallerySrc.includes("deletePet"), "calls deletePet on confirmation");
  assert.ok(gallerySrc.includes("restoreAllPets"), "supports restoring deleted pets");
  assert.ok(gallerySrc.includes("Trash2"), "uses Trash2 icon for deletion");
  assert.ok(gallerySrc.includes("RotateCcw"), "uses RotateCcw icon for restoration");

  // Zero emojis rule
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(gallerySrc), false, "PetGallery.svelte must contain zero emojis");
});
