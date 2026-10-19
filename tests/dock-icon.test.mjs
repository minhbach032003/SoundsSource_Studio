import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("dockIcon module integrity and dynamic theming exports", () => {
  assert.ok(existsSync("src/lib/dockIcon.ts"), "src/lib/dockIcon.ts exists");
  const src = readFileSync("src/lib/dockIcon.ts", "utf8");

  assert.ok(src.includes("generateThemeDockIconPng"), "exports generateThemeDockIconPng");
  assert.ok(src.includes("syncDockIconToTheme"), "exports syncDockIconToTheme");
  assert.ok(src.includes("update_dock_icon"), "invokes update_dock_icon Tauri IPC command");
  assert.ok(src.includes("--paper"), "reads --paper theme token");
  assert.ok(src.includes("--surface"), "reads --surface theme token");
  assert.ok(src.includes("--core"), "reads --core theme token");
  assert.ok(src.includes("--accent"), "reads --accent theme token");
  assert.ok(src.includes("canvas.width = 256"), "renders 256x256 high-resolution macOS dock canvas");
});

test("theme.svelte.ts triggers syncDockIconToTheme on theme update", () => {
  const src = readFileSync("src/lib/theme.svelte.ts", "utf8");

  assert.ok(src.includes("syncDockIconToTheme"), "imports and invokes syncDockIconToTheme");
  assert.ok(src.includes("updateFavicon"), "invokes updateFavicon");
});

test("Rust backend exposes update_dock_icon Tauri IPC command", () => {
  const src = readFileSync("crates/app/src/lib.rs", "utf8") + (existsSync("crates/app/src/cmd_system.rs") ? readFileSync("crates/app/src/cmd_system.rs", "utf8") : "");

  assert.ok(src.includes("fn update_dock_icon"), "implements update_dock_icon command");
  assert.ok(src.includes("setApplicationIconImage"), "calls macOS NSApplication setApplicationIconImage");
  assert.ok(src.includes("update_dock_icon\n        ])") || src.includes("update_dock_icon,"), "registers update_dock_icon in generate_handler");
});
