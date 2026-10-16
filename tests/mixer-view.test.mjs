import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("DeviceQuickBar Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/audio/DeviceQuickBar.svelte"), "DeviceQuickBar.svelte exists");
  const src = readFileSync("src/components/audio/DeviceQuickBar.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Required Lucide icons
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  for (const icon of [
    "Volume2",
    "VolumeX",
    "Mic",
    "MicOff",
    "Headphones",
    "Check",
    "ChevronDown",
    "Play",
    "Square",
  ]) {
    assert.ok(src.includes(icon), `imports ${icon} icon`);
  }

  // Audio synthesizer chime test import
  assert.ok(
    src.includes("playHeadphoneChannelTone"),
    "imports playHeadphoneChannelTone from headphoneTest"
  );

  // Volume slider commit on release
  assert.ok(src.includes("onpointerup="), "commits volume on pointer up");
  assert.ok(src.includes("oninput="), "updates volume dynamically on input");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "DeviceQuickBar.svelte must contain zero emojis");
});

test("AudioBuses Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/audio/AudioBuses.svelte"), "AudioBuses.svelte exists");
  const src = readFileSync("src/components/audio/AudioBuses.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Virtual Sub-Buses & Hardware channels
  assert.ok(src.includes("Master Bus"), "includes Master Bus controls");
  assert.ok(src.includes("Music Bus"), "includes Music Bus controls");
  assert.ok(src.includes("Voice Bus"), "includes Voice Bus controls");
  assert.ok(src.includes("Game Bus"), "includes Game Bus controls");
  assert.ok(src.includes("Microphone Input"), "includes Microphone Input channel");
  assert.ok(src.includes("System Sounds"), "includes System Sounds channel");

  // Live meters
  assert.ok(src.includes("liveAudioMetersState"), "connects to liveAudioMetersState");

  // Sliders commit on release
  assert.ok(src.includes("onpointerup="), "commits slider values on pointer release");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "AudioBuses.svelte must contain zero emojis");
});

test("ProcessCard Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/audio/ProcessCard.svelte"), "ProcessCard.svelte exists");
  const src = readFileSync("src/components/audio/ProcessCard.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Controls & indicators
  assert.ok(src.includes("Equalizer"), "integrates Equalizer component for activity");
  assert.ok(src.includes("liveAudioMetersState"), "connects to live meters");
  assert.ok(src.includes("onpointerup="), "commits volume on slider release");
  assert.ok(src.includes("Route Stream To"), "provides stream routing override");
  assert.ok(src.includes("DSP Parametric EQ"), "provides channel EQ toggle");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "ProcessCard.svelte must contain zero emojis");
});

test("AudioFilterPanel Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/audio/AudioFilterPanel.svelte"), "AudioFilterPanel.svelte exists");
  const src = readFileSync("src/components/audio/AudioFilterPanel.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // DSP Pipeline controls
  assert.ok(src.includes("noise_gate_threshold_db"), "controls noise gate threshold");
  assert.ok(src.includes("high_pass_enabled"), "controls high pass filter");
  assert.ok(src.includes("voice_presence_enabled"), "controls voice presence boost");
  assert.ok(src.includes("de_esser_enabled"), "controls de-esser");
  assert.ok(src.includes("dialogue_boost"), "controls dialogue boost");
  assert.ok(src.includes("night_mode_compression"), "controls night mode compression");
  assert.ok(src.includes("bass_warmth"), "controls bass warmth");
  assert.ok(src.includes("de_hiss"), "controls de-hiss");

  // Presets & modals
  assert.ok(src.includes("FILTER_PRESETS"), "defines filter presets");
  assert.ok(src.includes("VirtualCableModal"), "integrates VirtualCableModal");
  assert.ok(src.includes("Modal"), "integrates confirmation Modal for reset");
  assert.ok(src.includes("audioDspChain"), "synchronizes with audioDspChain");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "AudioFilterPanel.svelte must contain zero emojis");
});

test("StudioEQInspector Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/audio/StudioEQInspector.svelte"), "StudioEQInspector.svelte exists");
  const src = readFileSync("src/components/audio/StudioEQInspector.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // 10 bands
  assert.ok(src.includes("DEFAULT_BANDS"), "defines 10 default EQ bands");
  assert.ok(src.includes("ACOUSTIC_PROFILES"), "defines acoustic profiles");

  // SVG & faders
  assert.ok(src.includes("<svg"), "renders SVG frequency curve");
  assert.ok(src.includes("studio-fader-track"), "renders studio fader tracks");
  assert.ok(src.includes("setPointerCapture"), "uses setPointerCapture for smooth dragging");

  // Native Spotify spectrum (mounted behavioral coverage: spotify-spectrum-browser.mjs).
  assert.ok(
    src.includes('"get_spotify_spectrum"') && src.includes("clearTimeout(timer)"),
    "spectrum reads native PCM analysis and cleans up polling"
  );
  assert.ok(!src.includes("liveAudioMetersState"), "Spotify spectrum must not use the synthetic meter");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "StudioEQInspector.svelte must contain zero emojis");
});

test("PerformanceDiagnosticsCard Svelte 5 component integrity", () => {
  assert.ok(
    existsSync("src/components/diagnostics/PerformanceDiagnosticsCard.svelte"),
    "PerformanceDiagnosticsCard.svelte exists"
  );
  const src = readFileSync(
    "src/components/diagnostics/PerformanceDiagnosticsCard.svelte",
    "utf8"
  );

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Metrics & State integration
  assert.ok(
    src.includes("performanceDiagnosticsState"),
    "connects to performanceDiagnosticsState"
  );
  assert.ok(src.includes("physicalMb"), "computes physical memory footprint");
  assert.ok(src.includes("MEMORY_SAFE_CEILING_MB"), "measures against studio budget ceiling");
  assert.ok(src.includes("runBenchmark"), "provides IPC latency benchmark action");
  assert.ok(src.includes("trimMemory"), "provides memory purge action");
  assert.ok(src.includes("Modal"), "includes confirmation modal for purge");

  // Zero emojis rule
  assert.equal(
    emojiRegex.test(src),
    false,
    "PerformanceDiagnosticsCard.svelte must contain zero emojis"
  );
});

test("MixerView Svelte 5 view integrity", () => {
  assert.ok(existsSync("src/views/MixerView.svelte"), "MixerView.svelte exists");
  const src = readFileSync("src/views/MixerView.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Integrated sub-components
  assert.ok(src.includes("DeviceQuickBar"), "integrates DeviceQuickBar");
  assert.ok(src.includes("ProcessCard"), "integrates ProcessCard");
  assert.ok(src.includes("StudioEQInspector"), "integrates StudioEQInspector");
  assert.ok(src.includes("AudioFilterPanel"), "integrates AudioFilterPanel");
  assert.ok(src.includes("AudioBuses"), "integrates AudioBuses");
  assert.ok(src.includes("PerformanceDiagnosticsCard"), "integrates PerformanceDiagnosticsCard");

  // Keyed each on bundle ID / key
  assert.ok(
    src.includes("{#each visibleProcesses as process (process.bundle_id || `pid:${process.pid}`)}"),
    "renders ProcessCard with keyed {#each} on bundle_id / key"
  );

  // Search & filter
  assert.ok(src.includes("searchQuery"), "includes search filter for audio processes");
  assert.ok(src.includes("channelFilter"), "includes channel filter tabs");
  assert.ok(src.includes("handleTriggerRefresh"), "includes refresh action");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "MixerView.svelte must contain zero emojis");
});

test("App.svelte integrates MixerView on mixer tab", () => {
  const src = readFileSync("src/App.svelte", "utf8");
  assert.ok(src.includes("MixerView"), "App.svelte imports MixerView");
  assert.ok(
    src.includes('activeTab === "mixer"') && src.includes("<MixerView />"),
    "App.svelte renders <MixerView /> when activeTab === 'mixer'"
  );
  assert.equal(emojiRegex.test(src), false, "App.svelte must contain zero emojis");
});
