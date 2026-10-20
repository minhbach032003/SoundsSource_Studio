import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

test("AppLogo Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/icons/AppLogo.svelte"), "AppLogo.svelte exists");
  const src = readFileSync("src/components/icons/AppLogo.svelte", "utf8");

  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes("appSonicGradient"), "retains SVG soundwave gradient");
  assert.ok(src.includes("<rect"), "retains equalizer soundwave bars");
  assert.ok(src.includes("Sounds"), "includes Sounds wordmark");
  assert.ok(src.includes("Source"), "includes Source wordmark");
  assert.ok(src.includes("RUST"), "includes RUST badge");
  assert.ok(src.includes("var(--accent)") || src.includes("(--accent)"), "binds SVG gradient to theme accent variable");
  assert.ok(src.includes("var(--core)") || src.includes("(--core)"), "binds container to theme core token");
  assert.ok(src.includes("var(--surface)") || src.includes("(--surface)"), "binds container to theme surface token");
  assert.equal(emojiRegex.test(src), false, "AppLogo.svelte must contain zero emojis");
});

test("ThemeControls Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/ThemeControls.svelte"), "ThemeControls.svelte exists");
  const src = readFileSync("src/components/ThemeControls.svelte", "utf8");

  assert.ok(src.includes('from "@lucide/svelte"'), "imports icons from @lucide/svelte");
  assert.ok(src.includes("Sun") && src.includes("Moon"), "imports Sun and Moon icons");
  assert.ok(src.includes("themeState"), "binds to themeState store");
  assert.ok(src.includes("theme-preset"), "has theme-preset selector");
  assert.ok(src.includes("theme-toggle"), "has theme-toggle button");

  const themeSrc = readFileSync("src/lib/theme.svelte.ts", "utf8");
  assert.ok(themeSrc.includes("updateFavicon"), "implements updateFavicon for dynamic theme adaptation");
  assert.equal(emojiRegex.test(src), false, "ThemeControls.svelte must contain zero emojis");
});

test("AppHeader Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/AppHeader.svelte"), "AppHeader.svelte exists");
  const src = readFileSync("src/components/AppHeader.svelte", "utf8");

  assert.ok(src.includes('from "@lucide/svelte"'), "imports from @lucide/svelte");
  assert.ok(src.includes("RefreshCw"), "imports RefreshCw icon");
  assert.ok(src.includes("AppLogo"), "imports AppLogo component");
  assert.ok(src.includes("CoreAudio Active"), "displays CoreAudio status");
  assert.equal(emojiRegex.test(src), false, "AppHeader.svelte must contain zero emojis");
});

test("SideNavbar Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/components/navigation/SideNavbar.svelte"), "SideNavbar.svelte exists");
  const src = readFileSync("src/components/navigation/SideNavbar.svelte", "utf8");

  assert.ok(src.includes("$props()"), "uses Svelte 5 $props()");
  assert.ok(src.includes('from "@lucide/svelte"'), "imports icons from @lucide/svelte");
  assert.ok(src.includes("SlidersHorizontal"), "has SlidersHorizontal icon");
  assert.ok(src.includes("Timer"), "has Timer icon");
  assert.ok(src.includes("Mic"), "has Mic icon");
  assert.ok(src.includes("Bot"), "has Bot icon");
  assert.ok(src.includes("Settings"), "has Settings icon");
  assert.ok(src.includes("User"), "has User icon");
  assert.ok(src.includes("activeTab"), "supports activeTab prop");
  assert.ok(src.includes("onSelectTab"), "supports onSelectTab prop");
  assert.equal(emojiRegex.test(src), false, "SideNavbar.svelte must contain zero emojis");
});

test("App Svelte 5 shell integrity", () => {
  assert.ok(existsSync("src/App.svelte"), "App.svelte exists");
  const src = readFileSync("src/App.svelte", "utf8");

  // Action & State
  assert.ok(src.includes("spotlight("), "defines spotlight action for --mx/--my tracking");
  assert.ok(src.includes("use:spotlight"), "attaches spotlight action to shell container");
  assert.ok(src.includes("$state<NavTab>"), "uses $state for activeTab");

  // Subcomponents & Modals
  assert.ok(src.includes("SideNavbar"), "renders SideNavbar");
  assert.ok(src.includes("ThemeControls"), "renders ThemeControls");
  assert.ok(src.includes("ToastHost"), "hosts ToastHost");
  assert.ok(src.includes("Modal"), "hosts Modal");
  assert.ok(src.includes("GlobalPingHost"), "hosts GlobalPingHost");

  // Atmosphere
  assert.ok(src.includes("atmosphere"), "renders atmosphere layer");
  assert.ok(src.includes("top-glow"), "renders top-glow layer");
  assert.ok(src.includes("aurora aurora-a"), "renders aurora-a layer");
  assert.ok(src.includes("aurora aurora-b"), "renders aurora-b layer");
  assert.ok(src.includes("wallpaperState"), "integrates wallpaperState");

  // All 6 views supported
  for (const tab of ["mixer", "timer", "pings", "voice", "pet", "settings"]) {
    assert.ok(src.includes(`activeTab === "${tab}"`), `handles ${tab} view route`);
  }

  assert.equal(emojiRegex.test(src), false, "App.svelte must contain zero emojis");
});

test("main.ts conversion and zero React imports", () => {
  assert.ok(existsSync("src/main.ts"), "src/main.ts exists");
  assert.ok(!existsSync("src/main.tsx"), "src/main.tsx is deleted");

  const mainSrc = readFileSync("src/main.ts", "utf8");
  assert.ok(!/from\s+["']react["']/i.test(mainSrc), "zero React imports in main.ts");
  assert.ok(!/from\s+["']react-dom/i.test(mainSrc), "zero ReactDOM imports in main.ts");

  // All 4 branches mount with Svelte 5 mount()
  assert.ok(mainSrc.includes("mount(BreakOverlay,"), "mounts BreakOverlay via Svelte 5 mount()");
  assert.ok(mainSrc.includes("mount(PetOverlay,"), "mounts PetOverlay via Svelte 5 mount()");
  assert.ok(mainSrc.includes("mount(PingOverlay,"), "mounts PingOverlay via Svelte 5 mount()");
  assert.ok(mainSrc.includes("mount(App,"), "mounts App via Svelte 5 mount()");

  // Index.html script tag check
  const indexHtml = readFileSync("index.html", "utf8");
  assert.ok(indexHtml.includes('src="/src/main.ts"'), "index.html references /src/main.ts");
});
