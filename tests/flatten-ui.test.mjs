import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("Modal Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/ui/Modal.svelte"), "Modal.svelte exists");
  const src = readFileSync("src/components/ui/Modal.svelte", "utf8");

  // Runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Focus trap
  assert.ok(
    src.includes("addEventListener(\"keydown\"") || src.includes("addEventListener('keydown'"),
    "attaches keydown listener for focus trap and escape handling"
  );
  assert.ok(src.includes('e.key === "Escape"'), "handles Escape key press");
  assert.ok(src.includes('e.key === "Tab"'), "traps Tab and Shift-Tab key cycling");
  assert.ok(
    src.includes("previousActiveElement") && src.includes(".focus()"),
    "restores previous active element focus on modal dismiss"
  );

  // Backdrop click
  assert.ok(src.includes("backdrop-blur"), "includes backdrop blur styling");
  assert.ok(src.includes("onclick={onClose}"), "backdrop and close buttons invoke onClose");

  // Accessibility
  assert.ok(src.includes('role="dialog"'), "has dialog accessibility role");
  assert.ok(src.includes('aria-modal="true"'), "has aria-modal attribute");
  assert.ok(src.includes('aria-labelledby="modal-title"'), "has aria-labelledby attribute");

  // Lucide icons
  assert.ok(src.includes('from "@lucide/svelte"'), "imports icons from @lucide/svelte");
  assert.ok(src.includes("AlertTriangle"), "imports AlertTriangle icon");
  assert.ok(src.includes("X"), "imports X icon");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "Modal.svelte must contain zero emojis");
});

test("toastState Svelte 5 rune store integrity", () => {
  assert.ok(existsSync("src/lib/toast.svelte.ts"), "toast.svelte.ts exists");
  const src = readFileSync("src/lib/toast.svelte.ts", "utf8");

  // Runes and store shape
  assert.ok(src.includes("$state<"), "uses $state for items array");
  assert.ok(src.includes("show("), "implements show method");
  assert.ok(src.includes("remove("), "implements remove method");
  assert.ok(src.includes("toastState"), "exports toastState instance");

  // Max 2 active items logic and deduplication
  assert.ok(src.includes("slice(-1)"), "retains at most 1 previous active item plus new item (max 2)");
  assert.ok(src.includes("filter("), "filters out duplicate messages");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "toast.svelte.ts must contain zero emojis");
});

test("ToastHost Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/ui/ToastHost.svelte"), "ToastHost.svelte exists");
  const src = readFileSync("src/components/ui/ToastHost.svelte", "utf8");

  // Imports toastState
  assert.ok(src.includes("toastState"), "imports toastState store");

  // Lucide icons
  assert.ok(src.includes('from "@lucide/svelte"'), "imports icons from @lucide/svelte");
  assert.ok(src.includes("CheckCircle2"), "imports CheckCircle2 icon");
  assert.ok(src.includes("AlertCircle"), "imports AlertCircle icon");
  assert.ok(src.includes("Info"), "imports Info icon");
  assert.ok(src.includes("X"), "imports X icon");

  // Accessibility
  assert.ok(src.includes('aria-live="polite"'), "specifies aria-live attribute");
  assert.ok(src.includes('aria-label="Dismiss toast"'), "dismiss button has aria-label");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "ToastHost.svelte must contain zero emojis");
});

test("Equalizer Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/ui/Equalizer.svelte"), "Equalizer.svelte exists");
  const src = readFileSync("src/components/ui/Equalizer.svelte", "utf8");

  // Props & Runes
  assert.ok(src.includes("$props()"), "uses $props() for component props");
  assert.ok(src.includes("$derived("), "uses $derived for dynamic bar array");
  assert.ok(src.includes("bars"), "supports bars prop");
  assert.ok(src.includes("active"), "supports active prop");
  assert.ok(src.includes("eq-bar"), "applies eq-bar animation class");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "Equalizer.svelte must contain zero emojis");
});

test("src/components/ui/index.ts clean export barrel", () => {
  assert.ok(existsSync("src/components/ui/index.ts"), "src/components/ui/index.ts exists");
  const src = readFileSync("src/components/ui/index.ts", "utf8");

  assert.ok(src.includes("Modal"), "exports Modal");
  assert.ok(src.includes("ToastHost"), "exports ToastHost");
  assert.ok(src.includes("Equalizer"), "exports Equalizer");
  assert.ok(src.includes("toastState"), "exports toastState");

  // Obsolete shims removed
  assert.ok(!existsSync("src/components/ui/button.tsx"), "button.tsx shim removed");
  assert.ok(!existsSync("src/components/ui/badge.tsx"), "badge.tsx shim removed");
  assert.ok(!existsSync("src/components/ui/card.tsx"), "card.tsx shim removed");
  assert.ok(!existsSync("src/components/ui/skeleton.tsx"), "skeleton.tsx shim removed");
});

test("openspec spec.md reflects flattening into named CSS and 3 behavioral components", () => {
  const spec = readFileSync("openspec/specs/custom-ui-components/spec.md", "utf8");

  assert.ok(spec.includes(".btn"), "specifies named CSS .btn classes");
  assert.ok(spec.includes(".field"), "specifies named CSS .field classes");
  assert.ok(spec.includes(".volume-slider"), "specifies named CSS .volume-slider");
  assert.ok(spec.includes("Modal"), "specifies behavioral Modal component");
  assert.ok(spec.includes("ToastHost"), "specifies behavioral ToastHost component");
  assert.ok(spec.includes("Equalizer"), "specifies behavioral Equalizer component");
  assert.ok(spec.includes("toastState"), "specifies toastState rune store");
  assert.ok(spec.includes("Zero Emojis"), "enforces vector icons and zero emojis standard");
});
