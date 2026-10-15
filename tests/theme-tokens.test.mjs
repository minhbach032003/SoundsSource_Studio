import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
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

// --- WCAG AA contrast, locked in across every palette -----------------------

function blockOf(selector) {
  const i = css.indexOf(selector);
  assert.notEqual(i, -1, `${selector} present`);
  const open = css.indexOf("{", i);
  const body = css.slice(open + 1, css.indexOf("}", open));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
}

/** Merge in cascade order, then resolve one level of var() (enough for --core: var(--surface)). */
function palette(...selectors) {
  const merged = Object.assign({}, ...selectors.map(blockOf));
  for (const [k, v] of Object.entries(merged)) {
    const m = /^var\(--([a-z0-9-]+)\)$/.exec(v);
    if (m) merged[k] = merged[m[1]];
  }
  return merged;
}

const relLum = (hex) => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g);
  const [r, g, b] = n.map((p) => {
    const c = parseInt(p, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const BASE = ":root {";
const CATP = ':root[data-theme-family="catppuccin"]';
const PALETTES = {
  "default-light": palette(BASE),
  "default-dark": palette(BASE, ':root[data-theme-palette="default-dark"]'),
  latte: palette(BASE, CATP, ':root[data-theme-palette="latte"]'),
  frappe: palette(BASE, CATP, ':root[data-theme-palette="frappe"]'),
  macchiato: palette(BASE, CATP, ':root[data-theme-palette="macchiato"]'),
  mocha: palette(BASE, CATP, ':root[data-theme-palette="mocha"]'),
};

test("every palette meets WCAG AA (4.5:1) for text on the plate", () => {
  const failures = [];
  for (const [name, t] of Object.entries(PALETTES)) {
    for (const fg of ["ink", "muted", "faint", "accent-text", "error", "warning", "success"]) {
      for (const bg of ["core", "paper"]) {
        const r = contrast(t[fg], t[bg]);
        if (r < 4.5) failures.push(`${name}: --${fg} on --${bg} = ${r.toFixed(2)}`);
      }
    }
    const onAccent = contrast(t["accent-ink"], t["accent"]);
    if (onAccent < 4.5) failures.push(`${name}: --accent-ink on --accent = ${onAccent.toFixed(2)}`);
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

// --- no colour may be frozen outside the palette ---------------------------

const TSX = (() => {
  const { readdirSync, statSync, readFileSync } = nodeFs;
  const walk = (d) =>
    readdirSync(d).flatMap((e) => {
      const p = nodePath.join(d, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
  return walk("src").map((f) => [f, readFileSync(f, "utf8")]);
})();

const FAMILIES =
  "rose|pink|fuchsia|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|slate|gray|zinc|neutral|stone";

test("every Tailwind palette shade used in src is re-pointed at a token", () => {
  const used = new Set();
  for (const [, src] of TSX) {
    for (const m of src.matchAll(
      new RegExp(`\\b(?:bg|text|border|from|via|to|fill|stroke|ring|divide|outline|shadow)-(${FAMILIES})-(\\d{2,3})\\b`, "g")
    )) {
      used.add(`${m[1]}-${m[2]}`);
    }
  }
  const missing = [...used].filter((s) => !css.includes(`--color-${s}:`)).sort();
  assert.deepEqual(
    missing,
    [],
    `these shades would stay frozen to one palette; add --color-<shade> in @theme: ${missing.join(", ")}`
  );
});

// Colours that are deliberately fixed: per-user identity tints, the brand tile,
// League-style ping colours, wallpaper artwork, and the black break scrim.
const FROZEN_BY_DESIGN = [
  "src/shared/ui/AvatarComponent.tsx",
  "src/components/icons/AppLogo.tsx",
  "src/components/icons/GoogleIcon.tsx",
  "src/components/radial/GlobalPingHost.tsx",
  "src/components/radial/PingBurstMarker.tsx",
  "src/components/BreakScreenLockOverlay.tsx",
  "src/views/BreakOverlayWindowView.tsx",
  "src/lib/pingloom.ts",
  "src/shared/lib/petRenderer.ts",
  "src/shared/lib/useWallpaper.ts",
];

// The pet's five ranks need five distinct hues, which one accent cannot express,
// so they stay fixed the way avatar tints and ping colours do.
const PET_RANK_HUES = ["#10b981", "#14b8a6", "#fb7185", "#a855f7", "#f59e0b"];

test("no stray hex or rgb() colour literals outside the files that own their palette", () => {
  const offenders = [];
  for (const [file, src] of TSX) {
    if (FROZEN_BY_DESIGN.includes(file)) continue;
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g)) {
      if (file.endsWith("AgentPetView.tsx") && PET_RANK_HUES.includes(m[0].toLowerCase())) continue;
      // A pure black/white scrim carries no hue, so it survives a palette change.
      if (/^rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)/.test(m[0])) continue;
      offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
