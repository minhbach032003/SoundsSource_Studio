import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("Pet spritesheet Cloudinary CDN resolver and upload script integrity", () => {
  assert.ok(existsSync("scripts/upload-pets-cloudinary.mjs"), "upload script exists");
  assert.ok(existsSync("src/shared/lib/petRenderer.ts"), "petRenderer exists");

  const rendererSrc = readFileSync("src/shared/lib/petRenderer.ts", "utf8");
  const pickerSrc = readFileSync("src/components/pet/PetAnimationPicker.svelte", "utf8");
  const uploadSrc = readFileSync("scripts/upload-pets-cloudinary.mjs", "utf8");

  // Cloudinary configuration & resolver in petRenderer
  assert.ok(rendererSrc.includes("CLOUDINARY_PETS_BASE"), "defines CLOUDINARY_PETS_BASE");
  assert.ok(rendererSrc.includes("https://res.cloudinary.com/mvvfpbof/image/upload/pets"), "targets correct Cloudinary cloud");
  assert.ok(rendererSrc.includes("resolvePetSpritesheetUrls"), "exports resolvePetSpritesheetUrls");
  assert.ok(rendererSrc.includes("fallbackUrl"), "supports automatic local fallback on load error");

  // PetAnimationPicker integration
  assert.ok(pickerSrc.includes("resolvePetSpritesheetUrls"), "PetAnimationPicker uses resolvePetSpritesheetUrls");

  // Upload script integrity
  assert.ok(uploadSrc.includes("mvvfpbof"), "upload script targets mvvfpbof cloud");
  assert.ok(uploadSrc.includes("pets/${pet.id}/spritesheet.webp"), "uploads with structured public_id");
  assert.ok(uploadSrc.includes('upload("pets/catalog.json"'), "publishes public catalog after image uploads");
});
