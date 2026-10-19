import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("petMapping module integrity and distinct split assignment logic", () => {
  assert.ok(existsSync("src/lib/petMapping.ts"), "petMapping.ts exists");
  const mappingSrc = readFileSync("src/lib/petMapping.ts", "utf8");
  const typesSrc = readFileSync("src/components/pet/types.ts", "utf8");
  const overlaySrc = readFileSync("src/views/PetOverlay.svelte", "utf8");
  const popoverSrc = readFileSync("src/views/PetPopover.svelte", "utf8");
  const viewSrc = readFileSync("src/views/AgentPetView.svelte", "utf8");

  // Key exports
  assert.ok(mappingSrc.includes("getPetForSession"), "exports getPetForSession");
  assert.ok(mappingSrc.includes("getProjectName"), "exports getProjectName");
  assert.ok(mappingSrc.includes("setProjectPetBinding"), "exports setProjectPetBinding");
  assert.ok(mappingSrc.includes("getProjectPetBinding"), "exports getProjectPetBinding");
  assert.ok(mappingSrc.includes("otherPets"), "guarantees distinct companions for split sessions");

  // PetOverlay split logic uses getPetForSession
  assert.ok(overlaySrc.includes("getPetForSession"), "PetOverlay uses getPetForSession for distinct companions");
  assert.ok(overlaySrc.includes("sessionPet.id"), "PetOverlay renders distinct sessionPet sprites");

  // PetPopover agent list displays pet avatar & name
  assert.ok(popoverSrc.includes("getPetForSession"), "PetPopover uses getPetForSession");
  assert.ok(popoverSrc.includes("agentPet.avatarUrl"), "PetPopover renders agentPet.avatarUrl");

  // AgentPetView Connected Sessions displays pet avatar & mapping dropdown
  assert.ok(viewSrc.includes("getPetForSession"), "AgentPetView uses getPetForSession");
  assert.ok(viewSrc.includes("sessionPet.avatarUrl"), "AgentPetView renders sessionPet.avatarUrl");

  // Metadata check in types.ts
  for (const slug of ["boba", "code-frenzy-cat", "eddy", "shinchan-3", "super-saiyan-goku", "wode-daodun-3d", "work-blue-cat"]) {
    assert.ok(typesSrc.includes(`/pets/${slug}/avatar.svg`), `${slug} has avatar.svg in types.ts`);
    assert.ok(existsSync(`public/pets/${slug}/avatar.svg`), `${slug} avatar.svg exists on disk`);
  }
});
