import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadPetTypes() {
  const typesSrc = readFileSync("src/components/pet/types.ts", "utf8")
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*["']@lucide\/svelte["'];?/,
      "const Utensils = {}, Trophy = {}, Crown = {}, Zap = {}, Flame = {}, Sparkles = {}, PawPrint = {}, Compass = {}, Shield = {}, Medal = {}, Calendar = {}, Award = {}, Moon = {};"
    );

  const js = ts.transpile(typesSrc);
  const context = vm.createContext({ exports: {} });
  vm.runInContext(js, context);
  return context.exports;
}

test("All 8 installed companions define evolution forms with existing assets", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  assert.equal(INSTALLED_PETS.length, 8, "Must have exactly 8 installed companion archetypes");

  for (const pet of INSTALLED_PETS) {
    assert.ok(pet.forms && pet.forms.length >= 3, `${pet.id} must define at least 3 evolution forms`);

    for (const form of pet.forms) {
      assert.ok(form.id, `${pet.id} form must have id`);
      assert.ok(form.name, `${pet.id} form must have name`);
      assert.ok(typeof form.minLevel === "number", `${pet.id} form must have numeric minLevel`);

      const avatarDiskPath = join(process.cwd(), "public", form.avatarUrl.replace(/^\//, ""));
      const sheetDiskPath = join(process.cwd(), "public", form.spritesheetPath.replace(/^\//, ""));

      assert.ok(
        existsSync(avatarDiskPath),
        `Avatar image for ${pet.id} form ${form.id} must exist at ${avatarDiskPath}`
      );
      assert.ok(
        existsSync(sheetDiskPath),
        `Spritesheet for ${pet.id} form ${form.id} must exist at ${sheetDiskPath}`
      );
    }
  }
});

test("resolvePetActiveForm resolves appropriate forms by level and preference across all pets", () => {
  const { INSTALLED_PETS, resolvePetActiveForm } = loadPetTypes();

  for (const pet of INSTALLED_PETS) {
    // Level 1 should resolve to base/level 1 form
    const baseForm = resolvePetActiveForm(pet.id, 1, "auto");
    assert.ok(baseForm, `Must resolve level 1 form for ${pet.id}`);
    assert.equal(baseForm.minLevel, 1, `Level 1 form must have minLevel 1`);

    // Level 25 should resolve to high-level form
    const highForm = resolvePetActiveForm(pet.id, 25, "auto");
    assert.ok(highForm, `Must resolve high level form for ${pet.id}`);
    assert.ok(highForm.minLevel >= 5, `High level form must be >= Level 5`);

    // Explicit preference lock
    const firstFormId = pet.forms[0].id;
    const locked = resolvePetActiveForm(pet.id, 50, firstFormId);
    assert.equal(locked?.id, firstFormId, `Must respect explicit form lock`);
  }
});
