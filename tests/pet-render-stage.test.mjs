import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Runs the production drawPetFrame against a recording 2D context.
function loadRenderer() {
  const source = ["src/lib/petPreferences.ts", "src/shared/lib/petRenderer.ts"]
    .map((path) => readFileSync(path, "utf8").replace(/^import .*;\n/gm, "").replaceAll("export ", ""))
    .join("\n");
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null },
    performance: { now: () => 1000 },
    pikachuAnchors: JSON.parse(readFileSync("public/pets/pikachu/forms/anchors.json", "utf8")),
  });
  vm.runInContext(ts.transpile(source + "\nglobalThis.api = { drawPetFrame, petFormAura };"), context);
  return context.api;
}

function recorder(size) {
  const ops = [];
  const ctx = new Proxy(
    { globalCompositeOperation: "source-over", canvas: { width: size, height: size } },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          ops.push({ op: key, composite: target.globalCompositeOperation, args });
          if (key.startsWith("create")) return { addColorStop: (pos, color) => ops.push({ op: "stop", composite: target.globalCompositeOperation, args: [pos, color] }) };
        };
      },
      set(target, key, value) {
        target[key] = value;
        if (key === "globalCompositeOperation") ops.push({ op: "composite", args: [value] });
        return true;
      },
    }
  );
  return { ctx, ops };
}

const img = { naturalWidth: 1536, naturalHeight: 1872 };
const rect = { x: 5, y: 5, w: 182, h: 198 };
const still = { offsetY: 0, rotationDeg: 0, squashY: 1, glow: 1 };

function spriteBox(ops) {
  const [, , , , , dx, dy, dw, dh] = ops.find((o) => o.op === "drawImage").args;
  return { dx, dy, dw, dh };
}

test("frame is inset from every canvas edge so hair, aura and sparks are not cut", () => {
  const api = loadRenderer();
  for (const size of [112, 400]) {
    const { ctx, ops } = recorder(size);
    api.drawPetFrame(ctx, img, rect, "super-saiyan-goku", ctx.canvas, still, "celebrate", api.petFormAura("super-saiyan-goku", "ss3"), 1);
    const { dx, dy, dw, dh } = spriteBox(ops);
    assert.ok(dx >= size * 0.04, `left inset at ${size}`);
    assert.ok(dx + dw <= size * 0.96, `right inset at ${size}`);
    assert.ok(dy >= size * 0.07, `top inset at ${size}`);
    assert.ok(dy + dh <= size * 0.95, `feet stand above the bottom edge at ${size}`);
  }
});

test("floor shadow is drawn last, behind everything, and fits inside the canvas", () => {
  const api = loadRenderer();
  const size = 400;
  for (const slug of ["work-blue-cat", "pikachu", "wode-daodun-3d"]) {
    const { ctx, ops } = recorder(size);
    api.drawPetFrame(ctx, img, rect, slug, ctx.canvas, still, "celebrate", null, 1);
    const behind = ops.findIndex((o) => o.op === "composite" && o.args[0] === "destination-over");
    assert.ok(behind > ops.findIndex((o) => o.op === "drawImage"), `${slug}: shadow composited after the sprite`);
    const after = ops.slice(behind);
    const [gx, gy] = after.find((o) => o.op === "translate").args;
    const [, squash] = after.find((o) => o.op === "scale").args;
    const radii = after.filter((o) => o.op === "arc").map((o) => o.args[2]);
    const rx = Math.max(...radii);
    assert.ok(gx - rx >= 0 && gx + rx <= size, `${slug}: shadow fits horizontally`);
    assert.ok(gy + rx * squash <= size, `${slug}: shadow fits vertically`);
    assert.ok(!after.some((o) => o.op === "composite" && o.args[0] === "source-atop"), `${slug}: lighting never paints the shadow`);
  }
});

test("archetype lighting stays a subtle tint, even when celebrating", () => {
  const api = loadRenderer();
  for (const slug of ["wode-daodun-3d", "work-blue-cat", "eddy", "boba", "code-frenzy-cat", "shinchan-3"]) {
    for (const state of ["idle", "working", "celebrate"]) {
      const { ctx, ops } = recorder(400);
      api.drawPetFrame(ctx, img, rect, slug, ctx.canvas, { ...still, glow: 1.2 }, state, null, 1);
      // Lighting stops sit between the sprite and the shadow, which is composited last.
      const from = ops.findIndex((o) => o.op === "drawImage");
      const to = ops.findIndex((o) => o.op === "composite" && o.args[0] === "destination-over");
      const lit = ops.slice(from, to < 0 ? undefined : to).filter((o) => o.op === "stop");
      assert.ok(lit.length > 0, `${slug}/${state}: lighting still applied`);
      for (const { args: [, color] } of lit) {
        const alpha = Number(color.match(/([\d.]+)\)$/)[1]);
        assert.ok(alpha <= 0.2, `${slug}/${state}: ${color} washes the sprite`);
      }
    }
  }
});

test("Pikachu sparks and motion keep the same composition at every size", () => {
  const api = loadRenderer();
  const relative = (size, offsetY = 0) => {
    const { ctx, ops } = recorder(size);
    api.drawPetFrame(ctx, img, rect, "pikachu", ctx.canvas, { ...still, offsetY }, "celebrate", null, 1);
    const { dx, dy, dw, dh } = spriteBox(ops);
    const at = ops.findIndex((o) => o.op === "drawImage");
    const points = ops.slice(at).filter((o) => o.op === "moveTo" || o.op === "lineTo")
      .map((o) => [(o.args[0] - dx) / dw, (o.args[1] - dy) / dh]);
    const lift = ops.filter((o) => o.op === "translate")[0]?.args[1];
    return { points, dh, lift };
  };
  const small = relative(200), large = relative(400);
  assert.equal(small.points.length, large.points.length);
  small.points.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - large.points[i][0]) < 0.01 && Math.abs(y - large.points[i][1]) < 0.01, `spark point ${i} drifts with size`);
  });

  const bobSmall = relative(200, -4), bobLarge = relative(400, -4);
  // The motion pivot is the feet baseline, 6% above the bottom edge.
  const liftSmall = bobSmall.lift - Math.round(200 * 0.94), liftLarge = bobLarge.lift - Math.round(400 * 0.94);
  assert.ok(liftSmall < 0 && Math.abs(liftLarge / liftSmall - 2) < 0.35, "motion offset scales with the sprite");
});

test("pet canvas backing store follows the device pixel ratio", () => {
  const src = readFileSync("src/components/AgentPetSprite.svelte", "utf8");
  assert.ok(!/width=\{size \* 2\}/.test(src), "no fixed 2x backing store");
  assert.match(src, /devicePixelRatio/);
  assert.match(src, /matchMedia(?:\?\.)?\(`\(resolution: \$\{[^}]+\}dppx\)`\)/, "re-subscribes when the ratio changes");
  assert.match(src, /width=\{Math\.round\(size \* dpr\)\}/);
  assert.match(src, /height=\{Math\.round\(size \* dpr\)\}/);
});

test("Pikachu electric envelope never reaches the canvas edge", () => {
  const api = loadRenderer();
  const size = 400;
  for (let t = 0; t < 12; t += 0.1) {
    const { ctx, ops } = recorder(size);
    api.drawPetFrame(ctx, img, { x: 8, y: 7, w: 173, h: 195 }, "pikachu", ctx.canvas, still, "levelup", api.petFormAura("pikachu", "gigantamax"), t);
    const at = ops.findIndex((o) => o.op === "drawImage");
    for (const { args: [px, py] } of ops.slice(0, at).filter((o) => o.op === "moveTo" || o.op === "lineTo")) {
      assert.ok(px > size * 0.02 && px < size * 0.98 && py > 0 && py < size, `bolt point (${px}, ${py}) at t=${t.toFixed(1)}`);
    }
  }
});
