import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("BreakScreenLockOverlay Svelte 5 component integrity", () => {
  assert.ok(
    existsSync("src/components/BreakScreenLockOverlay.svelte"),
    "src/components/BreakScreenLockOverlay.svelte exists"
  );
  const src = readFileSync("src/components/BreakScreenLockOverlay.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Escape key handler
  assert.ok(src.includes('"Escape"'), "listens for Escape key");
  assert.ok(src.includes("addEventListener"), "registers keydown event listener");
  assert.ok(src.includes("removeEventListener"), "cleans up keydown listener on teardown");
  assert.ok(src.includes("onSkip"), "invokes onSkip callback on escape");

  // Props contract
  assert.ok(src.includes("active: boolean"), "declares active boolean prop");
  assert.ok(src.includes("remainingSeconds: number"), "declares remainingSeconds prop");
  assert.ok(src.includes("onSkip: () => void"), "declares onSkip prop");
  assert.ok(src.includes("enabled"), "declares enabled preference prop");

  // Required Lucide icons from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = ["EyeOff", "VolumeX", "SkipForward", "Sparkles"];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // Scrim styling & accessible role
  assert.ok(src.includes('role="alertdialog"'), "sets alertdialog accessibility role");
  assert.ok(src.includes("bg-black/85"), "renders white-on-black scrim background");
  assert.ok(src.includes("backdrop-blur-md"), "renders backdrop blur effect");
  assert.ok(src.includes("font-mono"), "renders monospaced clock display");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "BreakScreenLockOverlay.svelte must contain zero emojis");
});

test("TimerView Svelte 5 component integrity", () => {
  assert.ok(
    existsSync("src/views/TimerView.svelte"),
    "src/views/TimerView.svelte exists"
  );
  const src = readFileSync("src/views/TimerView.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived(") || src.includes("$derived.by("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // SVG Circular Focus Ring with 3 gradients using CSS var() tokens
  assert.ok(src.includes('id="studyGrad"'), "defines studyGrad linear gradient");
  assert.ok(src.includes('id="breakGrad"'), "defines breakGrad linear gradient");
  assert.ok(src.includes('id="warnGrad"'), "defines warnGrad linear gradient");
  assert.ok(src.includes("var(--accent)"), "uses var(--accent) in gradient stop");
  assert.ok(src.includes("var(--strong)"), "uses var(--strong) in gradient stop");
  assert.ok(src.includes("var(--success)"), "uses var(--success) in gradient stop");
  assert.ok(src.includes("var(--warning)"), "uses var(--warning) in gradient stop");
  assert.ok(src.includes("url(#studyGrad)"), "references url(#studyGrad)");
  assert.ok(src.includes("url(#breakGrad)"), "references url(#breakGrad)");
  assert.ok(src.includes("url(#warnGrad)"), "references url(#warnGrad)");

  // Timer states
  assert.ok(src.includes('"idle"'), "supports idle phase");
  assert.ok(src.includes('"studying"'), "supports studying phase");
  assert.ok(src.includes('"warning"'), "supports warning phase");
  assert.ok(src.includes('"breaking"'), "supports breaking phase");
  assert.ok(src.includes("completed_sessions"), "tracks completed_sessions");
  assert.ok(src.includes("is_ducked"), "tracks audio ducking state");

  // Backend status polling and teardown
  assert.ok(src.includes("get_break_timer_status"), "polls get_break_timer_status IPC command");
  assert.ok(src.includes("clearInterval"), "cleans up interval on unmount");

  // Durations setup and preset selectors
  assert.ok(src.includes("25m Pomodoro"), "includes 25m Pomodoro preset");
  assert.ok(src.includes("20m Eye Rest"), "includes 20m Eye Rest preset");
  assert.ok(src.includes("50m Deep Work"), "includes 50m Deep Work preset");
  assert.ok(src.includes("handleSetDurations"), "handles duration changes");

  // Todo list with timeboxing, completion toggle, and CRUD
  assert.ok(src.includes("handleAddTodo"), "implements add todo");
  assert.ok(src.includes("handleToggleTodo"), "implements toggle todo completion");
  assert.ok(src.includes("handleDeleteTodo"), "implements delete todo");
  assert.ok(src.includes("showTimeboxOptions"), "implements timeboxing toggle");
  assert.ok(src.includes("diffMinutesBetween"), "computes timebox duration");

  // Google Calendar integration
  assert.ok(src.includes("googleCalendarState"), "integrates googleCalendarState");
  assert.ok(src.includes("syncCalendar"), "handles calendar synchronization");
  assert.ok(src.includes("toggleEventComplete"), "handles calendar event toggling");
  assert.ok(src.includes("deleteEvent"), "handles calendar event deletion");

  // BreakScreenLockOverlay host
  assert.ok(src.includes("<BreakScreenLockOverlay"), "hosts BreakScreenLockOverlay component");

  // Required Lucide icons from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = [
    "Play",
    "Square",
    "RotateCcw",
    "Volume2",
    "VolumeX",
    "Clock",
    "Calendar",
    "CheckCircle2",
    "ListTodo",
    "Plus",
    "Trash2",
    "Settings",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "TimerView.svelte must contain zero emojis");
});

test("App.svelte integrates TimerView on timer tab", () => {
  const appSrc = readFileSync("src/App.svelte", "utf8");
  assert.ok(appSrc.includes("TimerView"), "imports and references TimerView");
  assert.ok(
    appSrc.includes('activeTab === "timer"') && appSrc.includes("<TimerView"),
    "renders TimerView when activeTab === 'timer'"
  );
  assert.equal(emojiRegex.test(appSrc), false, "App.svelte must contain zero emojis");
});
