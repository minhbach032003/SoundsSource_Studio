// Focused browser test for Pikachu ten forms and electric envelope integration.
import { mkdtempSync, symlinkSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), "pikachu-ten-forms-")));
const session = `pikachu-browser-${process.pid}`;
const browser = async (...args) => (await exec("agent-browser", ["--session", session, ...args], { timeout: 30000 })).stdout;
const evaluate = async (code) => JSON.parse(await browser("eval", code));

let server;

try {
  symlinkSync(resolve("node_modules"), join(root, "node_modules"));
  symlinkSync(resolve("src"), join(root, "src"));
  symlinkSync(resolve("public"), join(root, "public"));

  writeFileSync(
    join(root, "lucide.js"),
    "export const Utensils={}, Trophy={}, Crown={}, Zap={}, Flame={}, Sparkles={}, PawPrint={}, Compass={}, Shield={}, Medal={}, Calendar={}, Award={}, Moon={}; export default {};"
  );

  writeFileSync(
    join(root, "index.html"),
    `<html lang="en"><meta charset="utf-8"><title>Pikachu 10 Forms QA</title>
<style>
  body { margin: 20px; background: #0f172a; color: #f8fafc; font: 12px system-ui, sans-serif; }
  h1 { font-size: 18px; margin-bottom: 4px; color: #fde047; }
  p { color: #94a3b8; margin-top: 0; }
  .grid { display: grid; grid-template-columns: repeat(5, 200px); gap: 16px; margin-top: 16px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; text-align: center; }
  canvas { width: 160px; height: 160px; background: #0b0f19; border-radius: 6px; }
  .title { font-weight: 600; margin-top: 6px; font-size: 13px; color: #e2e8f0; }
  .tag { font-size: 10px; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; }
</style>
<h1>Pikachu Lineage: Ten Authentic Forms</h1>
<p>Electric envelope, branched lightning, and species-distinct silhouettes</p>
<div class="grid" id="container"></div>
<script type="module" src="/main.js"></script>
</html>`
  );

  writeFileSync(
    join(root, "main.js"),
    `import { PetRenderer, petFormAura, FORM_AURAS } from "@/shared/lib/petRenderer";
import { INSTALLED_PETS, resolvePetActiveForm, PIKACHU_LEGACY_ALIASES } from "@/components/pet/types";

window.renderers = [];
window.errors = [];
window.petFormAura = petFormAura;
window.FORM_AURAS = FORM_AURAS;
window.resolvePetActiveForm = resolvePetActiveForm;
window.PIKACHU_LEGACY_ALIASES = PIKACHU_LEGACY_ALIASES;

const pikachu = INSTALLED_PETS.find(p => p.id === "pikachu");
window.pikachuForms = pikachu.forms;

const container = document.getElementById("container");

for (const form of pikachu.forms) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = '<canvas id="cv-' + form.id + '" width="360" height="360"></canvas>' +
                   '<div class="title">' + form.name + '</div>' +
                   '<div class="tag">' + form.id + ' (Lv ' + form.minLevel + ')</div>';
  container.appendChild(card);

  const canvas = card.querySelector("canvas");
  const renderer = new PetRenderer(canvas, "pikachu");
  renderer.setAura(petFormAura("pikachu", form.id));
  renderer.setState("celebrate");
  renderer.load(form.spritesheetPath);

  window.renderers.push({ id: form.id, renderer, canvas, form });
}

window.dispose = () => window.renderers.forEach(({ renderer }) => renderer.destroy());
`
  );

  server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": resolve("src"), "@lucide/svelte": join(root, "lucide.js") } },
    server: { port: 0, host: "127.0.0.1", fs: { allow: [root, process.cwd()] } },
  });
  await server.listen();

  const port = server.httpServer.address().port;
  await browser("open", `http://127.0.0.1:${port}`);

  // Wait for all 10 renderers to load their spritesheets
  await browser("wait", "--fn", "window.renderers?.length === 10 && window.renderers.every(({ renderer }) => renderer.loaded)");

  // 1. Assert exactly 10 forms loaded
  const count = await evaluate("window.renderers.length");
  assert.equal(count, 10, "Must render exactly 10 Pikachu forms");

  // 2. Verify all 10 forms have custom FORM_AURAS entries
  const aurasCheck = await evaluate(`(() => {
    return window.renderers.map(({ id }) => {
      const aura = window.petFormAura("pikachu", id);
      return { id, hasAura: !!aura, hasInner: !!aura?.inner };
    });
  })()`);
  for (const { id, hasAura, hasInner } of aurasCheck) {
    assert.ok(hasAura, `Form ${id} must have a non-null form aura`);
    assert.ok(hasInner, `Form ${id} aura must define inner color`);
  }

  // 3. Verify legacy aliases in the browser runtime
  const aliasCheck = await evaluate(`(() => {
    const pikachu = { id: "pikachu", forms: window.pikachuForms };
    const aliases = ["original-cap", "ash-cap", "white-belly", "long-tail", "gmax", "mega-x", "mega-y", "horned-raichu"];
    return aliases.map(alias => ({
      alias,
      targetId: window.resolvePetActiveForm(pikachu, 99, alias)?.id
    }));
  })()`);
  assert.deepEqual(aliasCheck, [
    { alias: "original-cap", targetId: "classic" },
    { alias: "ash-cap", targetId: "classic" },
    { alias: "white-belly", targetId: "concept-white-belly" },
    { alias: "long-tail", targetId: "concept-long-tail" },
    { alias: "gmax", targetId: "gigantamax" },
    { alias: "mega-x", targetId: "mega-raichu-x" },
    { alias: "mega-y", targetId: "mega-raichu-y" },
    { alias: "horned-raichu", targetId: "gorochu" },
  ]);

  // 4. Capture browser preview screenshot for QA artifact
  await browser("set", "viewport", "1060", "640");
  const screenshotPath = "/tmp/pikachu-ten-forms-browser-preview.png";
  await browser("screenshot", screenshotPath);
  console.log(`PASS: All 10 Pikachu forms rendered in browser. Screenshot saved to ${screenshotPath}`);

  await evaluate("window.dispose()");
  await browser("close");
} finally {
  if (server) await server.close();
  rmSync(root, { recursive: true, force: true });
}
