import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("src/styles.css", "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const defined = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

test("every CSS custom property referenced in src is defined in styles.css", () => {
  const missing = new Map();
  for (const file of walk("src")) {
    for (const m of readFileSync(file, "utf8").matchAll(/var\(\s*--([a-z0-9-]+)/g)) {
      // Inline-set properties (e.g. --level on a slider) are provided by the component itself.
      if (!defined.has(m[1]) && !/--level\b/.test(m[0])) {
        missing.set(m[1], file);
      }
    }
  }
  assert.deepEqual(
    [...missing],
    [],
    `undefined tokens: ${[...missing].map(([t, f]) => `--${t} (${f})`).join(", ")}`
  );
});

test("pingloom palette is cloned: accent and paper match per palette", () => {
  // Spot-check the values that make it look like pingloom, not the old rose theme.
  assert.match(css, /--paper:\s*#fbf6f5/, "light paper");
  assert.match(css, /--accent:\s*#e2b4bd/, "dusty rose accent");
  assert.match(css, /--accent:\s*#74c7ec/, "mocha accent is pingloom blue, not pink");
  assert.match(css, /--accent:\s*#209fb5/, "latte accent is pingloom teal");
  for (const p of ["default-dark", "latte", "frappe", "macchiato", "mocha"]) {
    assert.ok(css.includes(`[data-theme-palette="${p}"]`), `${p} palette present`);
  }
  assert.ok(css.includes('[data-theme-family="catppuccin"]'), "catppuccin family remap present");
});

test("atmosphere tokens and layers exist", () => {
  for (const t of ["top-glow", "aurora-a", "aurora-b", "soft", "glow", "shell", "bar", "island", "hi", "shadow"]) {
    assert.ok(defined.has(t), `--${t} defined`);
  }
  for (const c of [".atmosphere", ".top-glow", ".aurora-a", ".aurora-b"]) {
    assert.ok(css.includes(c), `${c} class present`);
  }
});
