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
    "ScreenShare",
    "ScreenShareOff",
    "Monitor",
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

  // Screen share controls (getDisplayMedia -> Gemini Live video stream)
  assert.ok(src.includes("toggleScreenShare"), "provides screen share toggle handler");
  assert.ok(src.includes("isScreenSharing"), "tracks screen sharing state");
  assert.ok(src.includes("startScreenShare"), "starts a screen share through the service");
  assert.ok(src.includes("stopScreenShare"), "stops a screen share through the service");
  assert.ok(src.includes("screenPreviewElement"), "binds the shared screen preview element");
  assert.ok(src.includes("screenStream"), "renders the live screen stream");
  assert.ok(src.includes("videoFrameInfo"), "surfaces the real streamed frame geometry");

  // Model negotiated by the service is shown instead of a hardcoded label
  assert.ok(src.includes("activeModelLabel"), "shows which Live model is active");
  assert.ok(src.includes("modelInput"), "allows pinning a Live API model id");
  assert.ok(src.includes("setStoredModel"), "persists the pinned model");

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
