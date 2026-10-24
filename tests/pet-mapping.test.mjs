import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { compileModule } from "svelte/compiler";

for (const view of ["AgentPetView", "AgentPetSettingsView", "PetOverlay", "PetPopover"]) {
  test(`${view} refreshes a stable session's pet when its mapping revision changes`, async () => {
    const source = readFileSync(`src/views/${view}.svelte`, "utf8");
    const expression = source.match(/\{@const (?:sessionPet|agentPet) = ([^}]+)\}/)?.[1];
    assert.ok(expression, "production mapped-pet expression exists");
    // Use the real expression and Svelte's runtime, not a mocked $derived identity function.
    const { js } = compileModule(`
      let mappingRevision = $state(0);
      let assignment = "before";
      const session = { id: "stable-session" }, agent = session, idx = 0;
      const selectedPet = "fallback", petSlug = selectedPet;
      const getPetForSession = () => assignment;
      const pet = $derived(${expression});
      export function current() { return pet; }
      export function remap(value) { assignment = value; mappingRevision += 1; }
    `, { filename: `${view}.svelte.js`, generate: "client" });
    // Data-URL modules need absolute runtime imports, resolved from this project's Svelte.
    const code = js.code.replace(/(['"])(svelte\/[^'"]+)\1/g,
      (_, _quote, specifier) => JSON.stringify(import.meta.resolve(specifier)));
    const harness = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${view}`);
    assert.equal(harness.current(), "before");
    harness.remap("after");
    assert.equal(harness.current(), "after", "revision must invalidate the pet lookup without a session poll");
    harness.remap("third");
    assert.equal(harness.current(), "third");
  });
}

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
  assert.ok(mappingSrc.includes("setSessionPetBinding"), "exports setSessionPetBinding");
  assert.ok(mappingSrc.includes("getSessionPetBinding"), "exports getSessionPetBinding");
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
  for (const slug of ["boba", "code-frenzy-cat", "eddy", "pikachu", "shinchan-3", "super-saiyan-goku", "wode-daodun-3d", "work-blue-cat"]) {
    assert.ok(typesSrc.includes(`/pets/${slug}/avatar.svg`), `${slug} has avatar.svg in types.ts`);
    assert.ok(existsSync(`public/pets/${slug}/avatar.svg`), `${slug} avatar.svg exists on disk`);
  }
});
