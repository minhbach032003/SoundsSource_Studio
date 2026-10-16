import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("GoogleLoginModal Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/GoogleLoginModal.svelte"), "GoogleLoginModal.svelte exists");
  const src = readFileSync("src/components/GoogleLoginModal.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  // Required Lucide icons from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = ["ExternalLink", "ShieldCheck", "AlertCircle", "Loader2"];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // GoogleIcon & googleAuthState integration
  assert.ok(src.includes("GoogleIcon"), "imports and uses GoogleIcon");
  assert.ok(src.includes("googleAuthState"), "binds to googleAuthState");

  // The browser owns identity input. The app provides cancellation and accessible feedback only.
  for (const removed of ["PRESET_ACCOUNTS", "idTokenInput", "validateEmail", "GoogleLoginParams"]) {
    assert.equal(src.includes(removed), false, `must not expose fabricated identity path ${removed}`);
  }
  assert.ok(src.includes("signInWithGoogle()"));
  assert.ok(src.includes("cancelLogin()"));
  assert.ok(src.includes('role="status"') && src.includes('role="alert"'));
  assert.ok(src.includes("allowCancelWhileLoading"));

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "GoogleLoginModal.svelte must contain zero emojis");
});

test("VirtualCableModal Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/VirtualCableModal.svelte"), "VirtualCableModal.svelte exists");
  const src = readFileSync("src/components/VirtualCableModal.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Required Lucide icons from @lucide/svelte
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  const requiredIcons = [
    "Cable",
    "Download",
    "CheckCircle2",
    "ExternalLink",
    "X",
  ];
  for (const icon of requiredIcons) {
    assert.ok(src.includes(icon), `includes required icon ${icon}`);
  }

  // Virtual cable detection and setup guides
  assert.ok(src.includes("get_virtual_audio_status"), "invokes get_virtual_audio_status");
  assert.ok(src.includes("Discord"), "provides Discord setup steps");
  assert.ok(src.includes("Zoom"), "provides Zoom setup steps");
  assert.ok(src.includes("Google Meet"), "provides Google Meet setup steps");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "VirtualCableModal.svelte must contain zero emojis");
});

test("SettingsView Svelte 5 view integrity", () => {
  assert.ok(existsSync("src/views/SettingsView.svelte"), "SettingsView.svelte exists");
  const src = readFileSync("src/views/SettingsView.svelte", "utf8");

  // Svelte 5 runes
  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("$state<") || src.includes("$state("), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived("), "uses Svelte 5 $derived()");

  // Theme configuration via themeState
  assert.ok(src.includes("themeState"), "binds to themeState");
  assert.ok(src.includes("selectTheme"), "supports palette selection");
  assert.ok(src.includes("toggleThemeMode"), "supports theme mode toggle");

  // Wallpaper controls via wallpaperState
  assert.ok(src.includes("wallpaperState"), "binds to wallpaperState");
  assert.ok(src.includes("WALLPAPER_PRESETS"), "uses WALLPAPER_PRESETS");
  assert.ok(src.includes("uploadCustomImage"), "supports custom wallpaper upload");
  assert.ok(src.includes("setDim"), "supports background dimming tuning");
  assert.ok(src.includes("setBlur"), "supports background blur tuning");

  // Authentication panel via googleAuthState
  assert.ok(src.includes("googleAuthState"), "binds to googleAuthState");
  assert.ok(src.includes("GoogleIcon"), "renders GoogleIcon");
  assert.ok(src.includes("Neon PostgreSQL") || src.includes("dbStatus"), "displays database status");

  // Diagnostics controls via performanceDiagnosticsState
  assert.ok(src.includes("performanceDiagnosticsState"), "binds to performanceDiagnosticsState");
  assert.ok(src.includes("backgroundRamSaver"), "provides background RAM saver toggle");
  assert.ok(src.includes("trimMemory"), "supports manual memory trim / purge");
  assert.ok(src.includes("runBenchmark"), "supports IPC latency benchmarking");

  // Virtual cable guide modal trigger
  assert.ok(src.includes("VirtualCableModal"), "hosts VirtualCableModal");
  assert.ok(src.includes("isVirtualCableModalOpen"), "triggers virtual cable modal");

  // Vector icons only & zero emojis rule
  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  assert.equal(emojiRegex.test(src), false, "SettingsView.svelte must contain zero emojis");
});

test("App.svelte integrates SettingsView on settings tab and GoogleLoginModal", () => {
  const appSrc = readFileSync("src/App.svelte", "utf8");
  assert.ok(appSrc.includes("SettingsView"), "imports SettingsView");
  assert.ok(
    appSrc.includes('activeTab === "settings"') && appSrc.includes("<SettingsView"),
    "renders SettingsView when activeTab === 'settings'"
  );
  assert.ok(appSrc.includes("GoogleLoginModal"), "hosts GoogleLoginModal");
  assert.equal(emojiRegex.test(appSrc), false, "App.svelte must contain zero emojis");
});

test("SettingsView integrates Desktop Ping & Emote Gestures and macOS accessibility permission", () => {
  const src = readFileSync("src/views/SettingsView.svelte", "utf8");

  // Accessibility check and request
  assert.ok(
    src.includes("checkAccessibilityPermission") || src.includes("check_accessibility_permission"),
    "checks accessibility permission"
  );
  assert.ok(
    src.includes("requestAccessibilityPermission") || src.includes("request_accessibility_permission"),
    "requests accessibility permission"
  );
  assert.ok(src.includes("Mở Quyền macOS"), "renders Mở Quyền macOS button");

  // Deadzone slider and triggers
  assert.ok(src.includes("drag_threshold_px"), "provides deadzone slider");
  assert.ok(src.includes("TRIGGERS"), "provides trigger key selection");
  assert.ok(src.includes("enabled_on_start"), "provides desktop gesture toggle");
  assert.ok(src.includes("click_ping"), "provides quick alert click ping toggle");
});
