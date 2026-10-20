import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { formatBytes } from "../src/lib/cleaner.ts";

const emojiRegex =
  /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\ud83c\udca0-\udcff]|[\ud83d\udc00-\udfff]|[\ud83e\udc00-\udfff])/;

test("Cleaner TypeScript client and byte formatting integrity", () => {
  assert.ok(existsSync("src/lib/cleaner.ts"), "cleaner.ts exists");
  const src = readFileSync("src/lib/cleaner.ts", "utf8");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "cleaner.ts must contain zero emojis");

  // Format bytes test
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1048576), "1.0 MB");
  assert.equal(formatBytes(1073741824), "1.0 GB");
  assert.equal(formatBytes(2684354560), "2.5 GB");

  // Client exports
  assert.ok(src.includes("scanSystemClean"), "exports scanSystemClean");
  assert.ok(src.includes("executeClean"), "exports executeClean");
  assert.ok(src.includes("scanInstalledApps"), "exports scanInstalledApps");
  assert.ok(src.includes("uninstallApp"), "exports uninstallApp");
  assert.ok(src.includes("runOptimizationTask"), "exports runOptimizationTask");
  assert.ok(src.includes("getHardwareMetrics"), "exports getHardwareMetrics");
  assert.ok(src.includes("getPlatformInfo"), "exports getPlatformInfo");
});

test("CleanerView Svelte 5 component integrity and zero emojis", () => {
  assert.ok(existsSync("src/views/CleanerView.svelte"), "CleanerView.svelte exists");
  const src = readFileSync("src/views/CleanerView.svelte", "utf8");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "CleanerView.svelte must contain zero emojis");

  // Svelte 5 runes
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state");
  assert.ok(src.includes("$derived"), "uses Svelte 5 $derived");
  assert.ok(src.includes("$effect"), "uses Svelte 5 $effect");

  // 4 Core tabs
  assert.ok(src.includes("Deep Clean"), "includes Deep Clean tab");
  assert.ok(src.includes("App Uninstaller"), "includes App Uninstaller tab");
  assert.ok(src.includes("System Optimizer"), "includes System Optimizer tab");
  assert.ok(src.includes("Hardware Status"), "includes Hardware Status tab");

  // Safety confirmation modals
  assert.ok(src.includes("<Modal"), "integrates Modal component for confirmation");
  assert.ok(src.includes("Confirm Deep Cleanup"), "has cleanup confirmation dialog");
  assert.ok(src.includes("Confirm Application Uninstall"), "has app uninstall confirmation dialog");
});

test("App shell and navigation rail integrate cleaner route", () => {
  const navSrc = readFileSync("src/lib/navigation.ts", "utf8");
  const navbarSrc = readFileSync("src/components/navigation/SideNavbar.svelte", "utf8");
  const appSrc = readFileSync("src/App.svelte", "utf8");

  // Navigation tab registered
  assert.ok(navSrc.includes('"cleaner"'), "navigation.ts includes cleaner in NAV_TABS");
  assert.ok(navbarSrc.includes('id: "cleaner"'), "SideNavbar has cleaner nav item");
  assert.ok(appSrc.includes('cleaner: {'), "App.svelte registers cleaner in VIEWS");
  assert.ok(appSrc.includes('activeTab === "cleaner"'), "App.svelte routes to CleanerView");
  assert.ok(appSrc.includes("CleanerView"), "App.svelte imports CleanerView");
});
