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
    assert.equal(pet.forms?.length, 10, `${pet.id} must define exactly 10 evolution forms`);

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

  // Level 30 Goku specifically resolves to Blue Kaio-ken x20 (minLevel 30)
  const gokuLv30 = resolvePetActiveForm("super-saiyan-goku", 30, "auto");
  assert.ok(gokuLv30, "Goku level 30 must resolve active form");
  assert.equal(gokuLv30.id, "blue-kaioken", "Goku level 30 must be Blue Kaio-ken x20");
  assert.equal(gokuLv30.minLevel, 30);
  assert.ok(gokuLv30.spritesheetPath.includes("blue-kaioken"), "Spritesheet path must point to blue-kaioken");
});

test("PetOverlay splitPets passes resolved evolution forms to AgentPetSprite", () => {
  const overlaySrc = readFileSync("src/views/PetOverlay.svelte", "utf8");
  assert.ok(overlaySrc.includes("formId={sForm?.id}"), "Split pets loop must pass formId");
  assert.ok(overlaySrc.includes("spritesheetPath={sForm?.spritesheetPath}"), "Split pets loop must pass spritesheetPath");
  assert.ok(overlaySrc.includes("resolvePetActiveForm(sessionPet.id"), "Split pets loop must resolve form per sessionPet");
});

test("AgentPetSprite imports resolvePetActiveForm for robust fallback", () => {
  const spriteSrc = readFileSync("src/components/AgentPetSprite.svelte", "utf8");
  assert.ok(spriteSrc.includes("resolvePetActiveForm"), "AgentPetSprite imports resolvePetActiveForm");
  assert.ok(spriteSrc.includes("INSTALLED_PETS"), "AgentPetSprite imports INSTALLED_PETS");
});

// Goku forms are built by scripts/build-goku-forms.py; the manifest records what each sheet contains.
const GOKU_MANIFEST = JSON.parse(readFileSync("public/pets/super-saiyan-goku/forms/manifest.json", "utf8"));

function hexLightness(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return (Math.max(...c) + Math.min(...c)) / 2;
}

function hexHue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test("every Goku form sheet is built from its own hair silhouette, not a recolour", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  const goku = INSTALLED_PETS.find((p) => p.id === "super-saiyan-goku");
  assert.deepEqual(Object.keys(GOKU_MANIFEST.forms).sort(), Array.from(goku.forms, (f) => f.id).sort());

  const forms = GOKU_MANIFEST.forms;
  const silhouettes = new Set(["base", "ss1", "ss2", "ss3", "god"].map((id) => forms[id].alphaHash));
  assert.equal(silhouettes.size, 5, "base, SSJ1, SSJ2, SSJ3 and God must not share one alpha mask");
  assert.equal(forms.ss3.hairShape, "ssj3");
  assert.equal(forms.ss3.browsVisible, false, "Super Saiyan 3 has no eyebrows");
  assert.ok(forms.ss3.opaquePixels > forms.ss1.opaquePixels * 1.25, "SSJ3 waist/thigh-length mane adds a massive cascading silhouette (>1.25x SSJ1)");
  assert.ok(forms.ss3.opaquePixels > 1150000, "SSJ3 mane must have >1.15M opaque pixels across the spritesheet");
  assert.equal(forms.base.hairShape, "base");
  assert.equal(forms["ui-sign"].hairShape, "base", "Ultra Instinct -Sign- keeps base hair");
});

test("Goku form palettes follow the character, and only hair, eyes and skin change", () => {
  const forms = GOKU_MANIFEST.forms;
  for (const id of ["base", "kaioken", "ui-sign"]) {
    assert.ok(hexLightness(forms[id].hair[1]) < 0.2, `${id} hair must be black`);
  }
  for (const id of ["ss1", "ss2", "ss3"]) {
    const hue = hexHue(forms[id].hair[2]);
    assert.ok(hue >= 38 && hue <= 60, `${id} hair must be gold, got hue ${hue}`);
  }
  const godIris = hexHue(forms.god.iris[1]);
  assert.ok(godIris >= 340 || godIris <= 15, "Super Saiyan God eyes must be red");
  for (const id of ["ssblue", "blue-kaioken"]) {
    const hue = hexHue(forms[id].iris[1]);
    assert.ok(hue >= 190 && hue <= 230, `${id} eyes must be blue`);
  }
  assert.ok(hexLightness(forms.mui.hair[2]) > 0.8, "Mastered Ultra Instinct hair must be silver");
  assert.ok(forms.kaioken.skinTint && forms["blue-kaioken"].skinTint, "Kaio-ken forms tint the skin");
  for (const id of ["base", "ss1", "god", "ssblue", "mui"]) {
    assert.equal(forms[id].skinTint, null, `${id} must not tint the skin`);
  }
});

function loadRenderer() {
  const source = ["src/lib/petPreferences.ts", "src/shared/lib/petRenderer.ts"]
    .map((path) => readFileSync(path, "utf8").replace(/^import .*;\n/gm, "").replaceAll("export ", ""))
    .join("\n");
  const ops = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    { globalCompositeOperation: "source-over", canvas: { width: 200, height: 200 } },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          ops.push({ op: key, composite: target.globalCompositeOperation, args });
          return key.startsWith("create") ? gradient : undefined;
        };
      },
      set(target, key, value) {
        target[key] = value;
        if (key === "globalCompositeOperation") ops.push({ op: "composite", composite: value });
        if (key === 'strokeStyle') ops.push({ op: 'strokeStyle', args: [value] });
        return true;
      },
    }
  );
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null },
    performance: { now: () => 1000 },
    pikachuAnchors: JSON.parse(readFileSync("public/pets/pikachu/forms/anchors.json", "utf8")),
  });
  vm.runInContext(ts.transpile(source + "\nglobalThis.api = { drawPetFrame, petFormAura, FORM_AURAS, ARCHETYPE_STATE_ROW, resolvePetSpritesheetUrls };"), context);
  return { api: context.api, ctx, ops, window: context.window };
}

test("Goku forms draw their aura behind the sprite and never wash the sprite pixels", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  const { api, ctx, ops } = loadRenderer();
  const goku = INSTALLED_PETS.find((p) => p.id === "super-saiyan-goku");
  for (const form of goku.forms) assert.ok(api.petFormAura(goku.id, form.id), `${form.id} must define an aura`);
  assert.ok(api.FORM_AURAS["super-saiyan-goku/ss2"].sparks && api.FORM_AURAS["super-saiyan-goku/ss3"].sparks);
  assert.equal(api.FORM_AURAS["super-saiyan-goku/ss1"].sparks, undefined, "only SSJ2 and SSJ3 crackle");
  assert.ok(api.FORM_AURAS["super-saiyan-goku/blue-kaioken"].outer, "Blue Kaio-ken has a red envelope over blue");
  assert.equal(api.ARCHETYPE_STATE_ROW["super-saiyan-goku"].levelup, 4, "level up is its own clip, not Waiting");

  const img = { naturalWidth: 1536, naturalHeight: 1872 };
  const rect = { x: 0, y: 0, w: 192, h: 208 };
  api.drawPetFrame(ctx, img, rect, goku.id, ctx.canvas, undefined, "working", api.petFormAura(goku.id, "god"));
  const drawAt = ops.findIndex((o) => o.op === "drawImage");
  assert.ok(drawAt > 0);
  assert.ok(ops.slice(0, drawAt).some((o) => o.op === "createRadialGradient"), "aura is painted before the sprite");
  assert.ok(!ops.some((o) => o.composite === "source-atop"), "no gold/cyan wash on a form's own colours");

  ops.length = 0;
  api.drawPetFrame(ctx, img, rect, goku.id, ctx.canvas, undefined, "sleepy", api.petFormAura(goku.id, "ss1"));
  const sleepyDraw = ops.findIndex((o) => o.op === "drawImage");
  assert.ok(!ops.slice(0, sleepyDraw).some((o) => o.op === "moveTo"), "a sleeping Super Saiyan drops the aura");
});

// Work Blue Cat (Cyber Coding Cat) manifest and aura assertions
const WORK_BLUE_CAT_MANIFEST = JSON.parse(
  readFileSync("public/pets/work-blue-cat/forms/manifest.json", "utf8")
);

test("every Work Blue Cat form sheet is built with distinct silhouette or accessories", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  const cat = INSTALLED_PETS.find((p) => p.id === "work-blue-cat");
  assert.deepEqual(
    Object.keys(WORK_BLUE_CAT_MANIFEST.forms).sort(),
    Array.from(cat.forms, (f) => f.id).sort()
  );

  const forms = WORK_BLUE_CAT_MANIFEST.forms;
  const silhouettes = new Set(
    ["classic", "midnight", "indigo", "deep-work", "lofi-study", "aurora", "amber-flow", "synthwave", "astral", "timeless"].map(
      (id) => forms[id].alphaHash
    )
  );
  assert.equal(
    silhouettes.size,
    10,
    "All 10 Work Blue Cat forms must have distinct alpha mask silhouettes"
  );
  assert.equal(forms.classic.shape, "none");
  assert.equal(forms.midnight.shape, "mug");
  assert.equal(forms.indigo.shape, "glasses");
  assert.equal(forms["deep-work"].shape, "headphones");
  assert.equal(forms["lofi-study"].shape, "lofi");
  assert.equal(forms.aurora.shape, "goggles");
  assert.equal(forms["amber-flow"].shape, "antennae");
  assert.equal(forms.synthwave.shape, "synth_shades");
  assert.equal(forms.astral.shape, "astral_horns");
  assert.equal(forms.timeless.shape, "halo");
});

// Pikachu manifest and aura assertions
const PIKACHU_MANIFEST = JSON.parse(
  readFileSync("public/pets/pikachu/forms/manifest.json", "utf8")
);

test("every Pikachu form sheet is built with clean assets matching form specs", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  const pikachu = INSTALLED_PETS.find((p) => p.id === "pikachu");
  assert.deepEqual(
    Object.keys(PIKACHU_MANIFEST.forms).sort(),
    Array.from(pikachu.forms, (f) => f.id).sort()
  );

  const forms = PIKACHU_MANIFEST.forms;
  assert.equal(forms.pichu.shapeKey, "pichu");
  assert.equal(forms.classic.shapeKey, "classic");
  assert.equal(forms["concept-white-belly"].shapeKey, "concept-white-belly");
  assert.equal(forms["concept-long-tail"].shapeKey, "concept-long-tail");
  assert.equal(forms.raichu.shapeKey, "raichu");
  assert.equal(forms["alolan-raichu"].shapeKey, "alolan-raichu");
  assert.equal(forms.gigantamax.shapeKey, "gigantamax");
  assert.equal(forms["mega-raichu-x"].shapeKey, "mega-raichu-x");
  assert.equal(forms["mega-raichu-y"].shapeKey, "mega-raichu-y");
  assert.equal(forms.gorochu.shapeKey, "gorochu");

  // Distinct shape groups must have distinct silhouette alpha hashes (10 out of 10)
  const shapeGroupHashes = new Set(
    Object.values(forms).map((f) => f.alphaHash)
  );
  assert.equal(
    shapeGroupHashes.size,
    10,
    "All 10 Pikachu lineage forms must have distinct silhouette alpha hashes"
  );
});

test("Pikachu form palettes follow Pokémon canon lore", () => {
  const forms = PIKACHU_MANIFEST.forms;
  // Pichu has pale yellow fur
  assert.ok(hexLightness(forms.pichu.fur[2]) > 0.75, "Pichu fur must be pale yellow");
  // Pichu has pink cheeks
  const pichuCheekHue = hexHue(forms.pichu.cheeks[1]);
  assert.ok(pichuCheekHue >= 335 || pichuCheekHue <= 15, "Pichu cheeks must be pink/rose");
  // Raichu has warm orange fur
  const raichuFurHue = hexHue(forms.raichu.fur[1]);
  assert.ok(raichuFurHue >= 20 && raichuFurHue <= 45, `Raichu fur must be orange, got hue ${raichuFurHue}`);
  // Raichu has yellow cheeks in canon lore!
  const raichuCheekHue = hexHue(forms.raichu.cheeks[1]);
  assert.ok(raichuCheekHue >= 40 && raichuCheekHue <= 65, `Raichu cheeks must be yellow, got hue ${raichuCheekHue}`);
  // Alolan Raichu has psychic blue eyes
  assert.ok(forms["alolan-raichu"].eyes, "Alolan Raichu must define psychic eyes palette");
  const alolanEyeHue = hexHue(forms["alolan-raichu"].eyes[1]);
  assert.ok(alolanEyeHue >= 190 && alolanEyeHue <= 240, `Alolan Raichu eyes must be psychic blue, got hue ${alolanEyeHue}`);
});

test("Pikachu forms define levelup animation and custom FORM_AURAS", () => {
  const { INSTALLED_PETS } = loadPetTypes();
  const { api } = loadRenderer();
  const pikachu = INSTALLED_PETS.find((p) => p.id === "pikachu");
  assert.equal(api.ARCHETYPE_STATE_ROW.pikachu.levelup, 4, "Pikachu level up must be Celebrate jump (row 4)");

  // FORM_AURAS entries exist for all 10 Pikachu forms
  for (const form of pikachu.forms) {
    const aura = api.petFormAura(pikachu.id, form.id);
    assert.ok(aura, `Pikachu form ${form.id} must define an entry in FORM_AURAS`);
    assert.ok(aura.inner, `Pikachu form ${form.id} aura must define an inner color`);
  }

  // Canon color aura traits
  assert.ok(
    api.FORM_AURAS["pikachu/gigantamax"].inner.includes("ef4444") ||
    api.FORM_AURAS["pikachu/gigantamax"].outer?.includes("f59e0b"),
    "Gigantamax has Dynamax crimson/gold aura"
  );
  assert.ok(
    api.FORM_AURAS["pikachu/alolan-raichu"].inner.includes("38bdf8") ||
    api.FORM_AURAS["pikachu/alolan-raichu"].outer?.includes("818cf8"),
    "Alolan Raichu has psychic cyan/blue aura"
  );
  assert.ok(
    api.FORM_AURAS["pikachu/mega-raichu-x"].outer?.includes("38bdf8") ||
    api.FORM_AURAS["pikachu/mega-raichu-x"].sparks?.includes("ef4444"),
    "Mega Raichu X has high-voltage combat aura"
  );
  assert.ok(
    api.FORM_AURAS["pikachu/gorochu"].inner.includes("c2410c"),
    "Gorochu has fierce crimson-amber thunder aura"
  );
});

test("Pikachu auto milestones progression and manual cosmetic unlock branching", () => {
  const { INSTALLED_PETS, resolvePetActiveForm } = loadPetTypes();
  const pikachu = INSTALLED_PETS.find((p) => p.id === "pikachu");

  // Automatic progression milestones: Level 1 -> pichu, Level 5+ -> classic
  // Auto NEVER transforms into Raichu, Megas, or Concepts (no false biological ladder)
  for (const [level, id] of [
    [1, "pichu"],
    [3, "pichu"],
    [4, "pichu"],
    [5, "classic"],
    [10, "classic"],
    [15, "classic"],
    [20, "classic"],
    [35, "classic"],
    [50, "classic"],
    [99, "classic"],
  ]) {
    assert.equal(resolvePetActiveForm(pikachu, level, "auto")?.id, id);
  }

  // Manual-only unlock forms:
  const manualForms = [
    "concept-white-belly",
    "concept-long-tail",
    "raichu",
    "alolan-raichu",
    "gigantamax",
    "mega-raichu-x",
    "mega-raichu-y",
    "gorochu",
  ];
  for (const id of manualForms) {
    const meta = pikachu.forms.find((f) => f.id === id);
    assert.ok(meta, `Must define form meta for ${id}`);
    assert.equal(meta.manualOnly, true, `${id} must be manualOnly: true`);
    assert.equal(resolvePetActiveForm(pikachu, 99, id)?.id, id, `Explicit preference for ${id} resolves to ${id}`);
  }

  // Legacy aliases map cleanly to canon/concept forms
  assert.equal(resolvePetActiveForm(pikachu, 99, "thunderbolt")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "z-move")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "original-cap")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "hoenn-cap")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "kalos-cap")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "alola-cap")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "ash-cap")?.id, "classic");
  assert.equal(resolvePetActiveForm(pikachu, 99, "white-belly")?.id, "concept-white-belly");
  assert.equal(resolvePetActiveForm(pikachu, 99, "long-tail")?.id, "concept-long-tail");
  assert.equal(resolvePetActiveForm(pikachu, 99, "gmax")?.id, "gigantamax");
  assert.equal(resolvePetActiveForm(pikachu, 99, "mega-x")?.id, "mega-raichu-x");
  assert.equal(resolvePetActiveForm(pikachu, 99, "mega-y")?.id, "mega-raichu-y");
  assert.equal(resolvePetActiveForm(pikachu, 99, "horned-raichu")?.id, "gorochu");

  // All 10 forms point to existing authored assets
  for (const form of pikachu.forms) {
    assert.ok(form.avatarUrl.startsWith("/pets/pikachu/forms/"));
    assert.ok(form.spritesheetPath.startsWith("/pets/pikachu/forms/"));
  }
});

test("Pikachu actual form draws white-core lightning instead of filled ki flames", () => {
  const { api, ctx, ops } = loadRenderer();
  const img = { naturalWidth: 1536, naturalHeight: 1872 };
  const rect = { x:0, y:0, w:192, h:208 };
  for (const state of ['idle','working','celebrate','levelup']) {
    ops.length = 0;
    api.drawPetFrame(ctx, img, rect, 'pikachu', ctx.canvas, undefined, state, api.petFormAura('pikachu','classic'));
    const at = ops.findIndex(o => o.op === 'drawImage');
    assert.ok(ops.slice(0,at).some(o => o.op === 'stroke'), `electric envelope behind sprite ${state}`);
    assert.ok(ops.slice(at).filter(o => o.op === 'stroke').length >= 6, 'cheek/tail gold and white strokes despite non-null aura');
    assert.ok(!ops.some(o => o.op === 'quadraticCurveTo'), 'no Goku flame tongues');
    assert.ok(!ops.some(o => o.composite === 'source-atop'), 'no sprite tint');
    assert.ok(ops.some(o => o.op === 'strokeStyle' && o.args[0].includes('255, 255, 240')), 'white-hot core');
  }
  ops.length = 0;
  api.drawPetFrame(ctx, img, rect, 'pikachu', ctx.canvas, undefined, 'sleepy', api.petFormAura('pikachu','classic'));
  assert.equal(ops.filter(o => o.op === 'stroke').length,0);
});

test("Pikachu electric spark canvas effects react to state and drop when sleepy", () => {
  const { api, ctx, ops } = loadRenderer();
  const img = { naturalWidth: 1536, naturalHeight: 1872 };
  const rect = { x: 0, y: 0, w: 192, h: 208 };

  // Working state: sparks are drawn
  ops.length = 0;
  api.drawPetFrame(ctx, img, rect, "pikachu", ctx.canvas, undefined, "working", null);
  const workDrawAt = ops.findIndex((o) => o.op === "drawImage");
  assert.ok(workDrawAt > 0);
  const workSparks = ops.slice(workDrawAt).filter((o) => o.op === "stroke");
  assert.ok(workSparks.length >= 2, "Pikachu working state must draw cheek and tail lightning sparks");

  // Celebrate state: draws celebration lightning sparks
  ops.length = 0;
  api.drawPetFrame(ctx, img, rect, "pikachu", ctx.canvas, undefined, "celebrate", null);
  const celebDrawAt = ops.findIndex((o) => o.op === "drawImage");
  const celebSparks = ops.slice(celebDrawAt).filter((o) => o.op === "stroke");
  assert.ok(celebSparks.length >= 2, "Pikachu celebrate state must draw electric sparks");
  assert.ok(
    ctx.strokeStyle.includes("255, 255, 240") || ctx.strokeStyle.includes("250, 204, 21"),
    "Pikachu spark stroke styles must use electric cyan or gold tones"
  );

  // Sleepy state: zero electric sparks
  ops.length = 0;
  api.drawPetFrame(ctx, img, rect, "pikachu", ctx.canvas, undefined, "sleepy", null);
  const sleepyDrawAt = ops.findIndex((o) => o.op === "drawImage");
  const sleepySparks = ops.slice(sleepyDrawAt).filter((o) => o.op === "stroke");
  assert.equal(sleepySparks.length, 0, "Pikachu sleepy state must not emit sparks");
});




test("Pikachu authored form geometry does not use stale downloaded sprites with new landmarks", () => {
  const { api, window } = loadRenderer();
  const path = "/pets/pikachu/forms/classic/spritesheet.webp";
  const other = "/pets/super-saiyan-goku/forms/ss3/spritesheet.webp";
  window.__PET_ASSET_URLS__ = { [path]: "blob:stale-pikachu", [other]: "blob:installed-goku" };
  assert.equal(api.resolvePetSpritesheetUrls(path).cdnUrl, path, "bundled art and generated landmarks must stay paired");
  assert.equal(api.resolvePetSpritesheetUrls(other).cdnUrl, "blob:installed-goku", "other installed pets remain unchanged");
});

test("Pikachu picker sleep row suppresses every electrical stroke even without state", () => {
  const { api, ctx, ops } = loadRenderer();
  for (const aura of [null, api.petFormAura("pikachu", "classic")]) {
    ops.length = 0;
    api.drawPetFrame(ctx, { naturalWidth: 1536, naturalHeight: 1872 },
      { x: 17, y: 5 * 208 + 10, w: 160, h: 184 }, "pikachu", ctx.canvas, undefined, "", aura, 1);
    assert.equal(ops.filter(o => o.op === "stroke").length, 0, "picker row 5 must not discharge");
  }
});

test("Pikachu front discharge starts on authored cheeks and tail, not old relative positions", () => {
  const { api, ctx, ops } = loadRenderer();
  const r = { x: 17, y: 10, w: 160, h: 184 };
  api.drawPetFrame(ctx, { naturalWidth: 1536, naturalHeight: 1872, src: "/pets/pikachu/forms/classic/spritesheet.webp" },
    r, "pikachu", ctx.canvas, undefined, "idle", api.petFormAura("pikachu", "classic"), 1);
  const at = ops.findIndex(o => o.op === "drawImage");
  const [, , , , , x, y, w, h] = ops[at].args;
  const starts = ops.slice(at).filter(o => o.op === "moveTo").map(o => o.args);
  for (const [cx, cy] of [[61.34, 120.36], [108.64, 120.36], [161.96, 116.92]]) {
    const expected = [x + (cx - r.x) / r.w * w, y + (cy - r.y) / r.h * h];
    assert.ok(starts.some(([px, py]) => Math.hypot(px - expected[0], py - expected[1]) < 0.1),
      `discharge missing authored landmark ${cx},${cy}`);
  }
});


test("Pikachu generated landmarks track cropped cells, mirrored runs, aliases and legacy fallback", () => {
  const { api, ctx, ops } = loadRenderer();
  const anchors = JSON.parse(readFileSync("public/pets/pikachu/forms/anchors.json", "utf8"));
  for (const [id, cells] of Object.entries(anchors)) {
    for (const row of [0, 1, 2, 4, 7, 8]) for (const frame of [0, 3, 7]) {
      const r = { x: frame*192+12, y: row*208+9, w: 168, h: 190 };
      ops.length=0;
      api.drawPetFrame(ctx, { naturalWidth:1536, naturalHeight:1872, src:`/pets/pikachu/forms/${id}/spritesheet.webp` },
        r, "pikachu", ctx.canvas, undefined, "", null, 1);
      const at=ops.findIndex(o=>o.op==="drawImage");
      const [, , , , , x,y,w,h]=ops[at].args;
      const starts=ops.slice(at).filter(o=>o.op==="moveTo").map(o=>o.args);
      for(const [px,py] of cells[row*8+frame]) assert.ok(starts.some(([sx,sy])=>
        Math.hypot(sx-(x+(px-12)/168*w),sy-(y+(py-9)/190*h))<.001), `${id}/${row}/${frame}`);
    }
  }
  for(const id of ["white-belly","long-tail","unknown","original-cap"]) {
    ops.length=0;
    api.drawPetFrame(ctx,{naturalWidth:1536,naturalHeight:1872,src:`/pets/pikachu/forms/${id}/spritesheet.webp`},
      {x:0,y:0,w:192,h:208},"pikachu",ctx.canvas,undefined,"idle",null,1);
    assert.ok(ops.some(o=>o.op==="stroke"), `${id} remains drawable`);
    assert.ok(ops.filter(o=>o.op==="moveTo"||o.op==="lineTo").every(o=>o.args.every(Number.isFinite)));
  }
});

test("Pikachu runtime descriptions distinguish reference concepts without unsupported history", () => {
  const { INSTALLED_PETS }=loadPetTypes();
  const pet=INSTALLED_PETS.find(p=>p.id==="pikachu");
  const text=JSON.stringify(pet.forms);
  assert.doesNotMatch(text,/1996|HZ138|50 triệu|Yomiuri|TCRF|Nishida|Sugimori/);
  for(const id of ["mega-raichu-x","mega-raichu-y"]) assert.match(pet.forms.find(f=>f.id===id).hairDescription,/Official Canon/);
  assert.match(pet.forms.find(f=>f.id==="gorochu").hairDescription,/Artist Reconstruction/);
});
