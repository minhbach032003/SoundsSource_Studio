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

test("panel is pingloom's bezel+plate on one element, with layer counts in sync", () => {
  const rule = css.slice(css.indexOf(".panel {"), css.indexOf("}", css.indexOf(".panel {")));

  // 36px outer radius minus the 6px ring is pingloom's 30px plate radius.
  assert.match(rule, /border:\s*6px solid transparent/);
  assert.match(rule, /border-radius:\s*36px/);
  assert.match(rule, /background-color:\s*var\(--shell\)/, "ring colour fills the border box");
  assert.match(rule, /box-shadow:.*inset 0 1px 0 var\(--hi\)/, "plate highlight");
  assert.match(rule, /box-shadow:.*0 0 0 1px var\(--shell-line\)/, "bezel hairline");

  // A background-image / clip / origin length mismatch silently misplaces layers.
  const topLevelCommas = (s) => {
    let depth = 0, n = 1;
    for (const c of s) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) n++;
    }
    return n;
  };
  const field = (name) => {
    const m = rule.match(new RegExp(`${name}:([^;]*);`));
    assert.ok(m, `${name} present`);
    return topLevelCommas(m[1]);
  };
  const layers = field("background-image");
  assert.equal(layers, 3, "plate spotlight, opaque plate, ring spotlight");
  assert.equal(field("background-clip"), layers, "one clip per layer");
  assert.equal(field("background-origin"), layers, "one origin per layer");
});

test("no view still hand-rolls the old top-level panel styling", async () => {
  const { readdirSync, statSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const walk = (d) =>
    readdirSync(d).flatMap((e) => {
      const p = join(d, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
    });
  const offenders = walk("src").filter((f) =>
    /rounded-2xl bg-\[var\(--surface\)\] border border-\[var\(--line\)\]/.test(readFileSync(f, "utf8"))
  );
  assert.deepEqual(offenders, [], `use .panel instead: ${offenders.join(", ")}`);
});
