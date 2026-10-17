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
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Required Lucide icons from @lucide/svelte for Gemini Live multimodal video/audio
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = [
    "Mic",
    "MicOff",
    "Video",
    "VideoOff",
    "PhoneCall",
    "PhoneOff",
    "SwitchCamera",
    "Maximize2",
    "Minimize2",
    "Volume1",
    "CameraOff",
    "Bot",
    "User",
    "Sparkles",
    "Trash2",
    "Copy",
    "Check",
    "Loader2",
    "Send",
    "Sliders",
    "AlertTriangle",
    "KeyRound",
    "Eye",
    "EyeOff",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // Gemini Live state integration
  assert.ok(src.includes("geminiLiveState"), "integrates geminiLiveState store");
  assert.ok(src.includes("callStatus"), "derives call status from geminiLiveState");
  assert.ok(src.includes("handleStartCall"), "implements handleStartCall");
  assert.ok(src.includes("handleEndCall"), "implements handleEndCall");

  // Video PiP (Picture-in-Picture) webcam container and controls
  assert.ok(src.includes("pipVideoElement"), "binds PiP video element");
  assert.ok(src.includes("isPipExpanded"), "supports expanding and minimizing PiP");
  assert.ok(src.includes("isCameraFlipped"), "supports flipping camera mirror mode");
  assert.ok(src.includes("toggleCameraFlip"), "provides toggleCameraFlip action");
  assert.ok(src.includes("<video"), "renders HTML5 video tag for local webcam PiP");

  // Camera toggle controls
  assert.ok(src.includes("toggleCamera"), "provides camera toggle handler");
  assert.ok(src.includes("isVideoEnabled"), "checks camera enabled state");
  assert.ok(src.includes("disableVideo") || src.includes("enableVideo"), "calls geminiLive camera toggle methods");

  // Mic toggle and Push-to-Talk controls
  assert.ok(src.includes("toggleMic"), "provides microphone mute toggle handler");
  assert.ok(src.includes("isMuted"), "tracks microphone muted state");
  assert.ok(src.includes('e.code === "Space"'), "listens for spacebar push-to-talk in active call");

  // Dual visualizer (User mic + Gemini AI volume)
  assert.ok(src.includes("userVolPct"), "computes user volume percentage");
  assert.ok(src.includes("aiVolPct"), "computes Gemini AI volume percentage");
  assert.ok(src.includes("Mic Người Dùng"), "renders user mic level visualizer bar");
  assert.ok(src.includes("Gemini Live AI"), "renders Gemini Live AI volume visualizer bar");

  // Modal API Key configuration
  assert.ok(src.includes("isApiKeyModalOpen"), "manages API Key modal state");
  assert.ok(src.includes("handleSaveApiKey"), "implements saving API key to service");
  assert.ok(src.includes("getApiKey"), "retrieves stored API key");
  assert.ok(src.includes("setApiKey"), "stores Gemini API key");

  // Modal Clear History confirmation
  assert.ok(src.includes("isClearModalOpen"), "manages clear history modal state");
  assert.ok(src.includes("handleConfirmClear"), "implements confirmed clear transcript");
  assert.ok(src.includes("clearTranscript"), "invokes clearTranscript on Gemini Live service");

  // Transcript conversation list, scrolling, speech synthesis
  assert.ok(src.includes("transcript"), "displays live multimodal transcript");
  assert.ok(src.includes("scrollIntoView") || src.includes("scrollTo"), "implements auto smooth scrolling");
  assert.ok(src.includes("speechSynthesis") || src.includes("handleReplayAudio"), "provides audio replay option");

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

test("VoiceAiView drives a real Gemini call, not a mocked one", () => {
  const src = readFileSync("src/views/VoiceAiView.svelte", "utf8");

  // The demo transcript and the hardcoded latency badge are gone.
  assert.equal(src.includes("INITIAL_TRANSCRIPT"), false, "no seeded mock conversation");
  assert.equal(src.includes("~120ms"), false, "no invented latency figure");
  assert.equal(src.includes("15fps"), false, "video telemetry matches the real 1 fps uplink");
  assert.ok(src.includes("GEMINI_VIDEO_UPLINK_FPS"), "labels the uplink from the service constant");

  // Live call telemetry
  assert.ok(src.includes("callDuration"), "shows the live call duration");
  assert.ok(src.includes("tokensUsed"), "shows session token usage");

  // Session controls wired to the service
  assert.ok(src.includes("switchVoice"), "persona change re-opens the session");
  assert.ok(src.includes("handleReconnect"), "offers an explicit reconnect");
  assert.ok(src.includes("toggleAgentControl"), "exposes the Agent Control gate");
  assert.ok(src.includes("toggleCaptions"), "exposes the live captions toggle");
  assert.ok(src.includes("setOutputVolume"), "controls Gemini playback gain");
  assert.ok(src.includes("handleOutputVolume"), "binds the speaker gain slider");

  // Tool-call rows and real audio replay
  assert.ok(src.includes('m.sender === "tool"'), "renders executed mixer actions");
  assert.ok(src.includes("m.toolName"), "names the executed function");
  assert.ok(src.includes("Wrench"), "uses a vector icon for tool rows");
  assert.ok(src.includes("replayMessage"), "replays the cached Gemini audio");
  assert.ok(src.includes("m.hasAudio"), "distinguishes cached audio from text fallback");

  assert.equal(emojiRegex.test(src), false, "VoiceAiView.svelte must contain zero emojis");
});

test("geminiAudioTools exposes only mixer commands the app already owns", () => {
  assert.ok(existsSync("src/lib/geminiAudioTools.ts"), "src/lib/geminiAudioTools.ts exists");
  const src = readFileSync("src/lib/geminiAudioTools.ts", "utf8");

  for (const name of [
    "list_audio_apps",
    "set_app_volume",
    "set_app_mute",
    "get_master_volume",
    "set_master_volume",
    "set_master_mute",
    "get_master_eq",
    "set_master_eq_band",
    "reset_master_eq",
    "set_master_eq_bypass",
  ]) {
    assert.ok(src.includes(name), `declares ${name}`);
  }

  // Every backing command must exist in the Tauri handler list.
  const rust = readFileSync("crates/app/src/lib.rs", "utf8");
  for (const command of [
    "get_audio_processes",
    "set_app_volume",
    "set_app_mute",
    "get_master_volume",
    "set_master_volume",
    "set_master_mute",
    "get_master_eq_bands",
    "set_master_eq_band",
    "reset_master_eq",
    "set_master_eq_bypass",
  ]) {
    assert.ok(
      new RegExp(`fn ${command}\\s*\\(`).test(rust),
      `backend exposes #[tauri::command] ${command}`
    );
  }

  // Band table mirrors the engine's own EQ frequencies.
  const eq = readFileSync("crates/engine/src/eq.rs", "utf8");
  const engineBands = eq
    .slice(eq.indexOf("DEFAULT_EQ_FREQUENCIES"))
    .match(/\[([^\]]+)\]/)[1]
    .split(",")
    .map((v) => Number.parseFloat(v.trim()))
    .filter((v) => Number.isFinite(v));
  for (const hz of engineBands) {
    assert.ok(src.includes(String(hz)), `frontend band table includes ${hz} Hz`);
  }

  assert.equal(emojiRegex.test(src), false, "geminiAudioTools.ts must contain zero emojis");
});

test("VoiceAiView offers screen sharing and a live-capable model picker", () => {
  const src = readFileSync("src/views/VoiceAiView.svelte", "utf8");
  assert.ok(src.includes("toggleScreenShare"), "screen share handler");
  assert.ok(src.includes("ScreenShare") && src.includes("ScreenShareOff"), "vector icons for screen share");
  assert.ok(src.includes("screenVideoElement"), "stage previews exactly what Gemini receives");
  assert.ok(src.includes("isScreenSharing"), "reflects screen share state");
  assert.ok(src.includes("GEMINI_LIVE_MODELS"), "model picker lists verified live models");
  assert.ok(src.includes('m.sender === "ai" && m.isFinal !== false'), "replay appears only on finished turns");
  assert.equal(src.includes("gemini-2.0-flash-exp"), false, "no dead model hardcoded in the view");
  assert.equal(emojiRegex.test(src), false, "zero emojis");
});

test("VoiceAiView handles general questions, web search and black screen shares", () => {
  const src = readFileSync("src/views/VoiceAiView.svelte", "utf8");
  assert.ok(src.includes("toggleWebSearch") && src.includes("webSearchEnabled"), "Google Search toggle");
  assert.ok(src.includes('kind: "general"'), "offers non-mixer quick actions");
  assert.ok(src.includes("Hỏi Gemini bất cứ điều gì"), "input invites any topic");
  assert.ok(src.includes("screenShareIssue"), "surfaces screen capture problems");
  assert.ok(src.includes("Screen &amp; System Audio Recording"), "names the macOS permission to grant");
  assert.ok(src.includes("Cmd+Q"), "tells the user the app must be restarted");
  assert.ok(src.includes("retryScreenShare"), "lets the user pick the screen again");
  assert.ok(
    /\{#if geminiLiveState\.isScreenSharing && geminiLiveState\.screenStream\}\s*<video/.test(src),
    "stage preview element is created per share, not toggled with display:none"
  );
  assert.equal(src.includes("dark:"), false, "theme tokens only, no dark: variants");
  assert.equal(emojiRegex.test(src), false, "zero emojis");
});

test("screen share asks macOS for Screen Recording before opening a black stream", () => {
  const view = readFileSync("src/views/VoiceAiView.svelte", "utf8");
  const audio = readFileSync("src/audio.ts", "utf8");
  const rust = readFileSync("crates/app/src/lib.rs", "utf8");

  for (const cmd of [
    "check_screen_capture_permission",
    "request_screen_capture_permission",
    "open_screen_capture_settings",
  ]) {
    assert.ok(new RegExp(`fn ${cmd}\\s*\\(`).test(rust), `backend defines ${cmd}`);
    const handler = rust.slice(rust.indexOf("generate_handler!["));
    assert.ok(handler.includes(cmd), `${cmd} is registered in generate_handler!`);
    assert.ok(audio.includes(`"${cmd}"`), `src/audio.ts wraps ${cmd}`);
  }
  assert.ok(rust.includes("CGPreflightScreenCaptureAccess"), "uses the non-prompting TCC check");
  assert.ok(rust.includes("Privacy_ScreenCapture"), "opens the Screen Recording settings pane");

  assert.ok(view.includes("checkScreenCapturePermission"), "view checks before sharing");
  assert.ok(view.includes("screenPermissionMissing"), "view explains a missing grant");
  assert.ok(view.includes("handleOpenScreenSettings"), "one click to the right Settings pane");
  assert.ok(view.includes("startShareUnchecked"), "escape hatch when the check is wrong");
  assert.ok(view.includes("diagnosticsReport"), "diagnostics panel for WKWebView-only failures");
  assert.equal(/<div[^>]*onpointerdown/.test(view), false, "no handlers on static elements");
  assert.equal(emojiRegex.test(view), false, "zero emojis");
});
