import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("VoiceAiView Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/views/VoiceAiView.svelte"), "src/views/VoiceAiView.svelte exists");
  const src = readFileSync("src/views/VoiceAiView.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Required Lucide icons from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = [
    "Mic",
    "MicOff",
    "Volume2",
    "Bot",
    "User",
    "Sparkles",
    "Trash2",
    "Copy",
    "Check",
    "Loader2",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // Three visual states for mic button (idle / listening / speaking) with theme tokens
  assert.ok(src.includes("isListening"), "tracks listening state");
  assert.ok(src.includes("status === 'speaking'") || src.includes('status === "speaking"'), "tracks speaking state");
  assert.ok(src.includes("animate-pulse") || src.includes("animate-ping"), "includes listening ring / pulse animations");

  // Transcript conversation list, scrolling, audio cues, speech synthesis
  assert.ok(src.includes("messages"), "maintains transcript messages");
  assert.ok(src.includes("scrollIntoView") || src.includes("scrollTo"), "implements smooth scrolling");
  assert.ok(src.includes("AudioContext") || src.includes("playAudioCue"), "provides audio feedback cues");
  assert.ok(src.includes("speechSynthesis") || src.includes("speakText"), "provides speech synthesis triggers");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "VoiceAiView.svelte must contain zero emojis");
});

test("App.svelte integrates VoiceAiView on voice tab", () => {
  const appSrc = readFileSync("src/App.svelte", "utf8");
  assert.ok(appSrc.includes("VoiceAiView"), "imports and references VoiceAiView");
  assert.ok(
    appSrc.includes('activeTab === "voice"') && appSrc.includes("<VoiceAiView"),
    "renders VoiceAiView when activeTab === 'voice'"
  );
  assert.equal(emojiRegex.test(appSrc), false, "App.svelte must contain zero emojis");
});
