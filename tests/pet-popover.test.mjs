import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("PetPopover Svelte 5 component integrity", () => {
  assert.ok(existsSync("src/views/PetPopover.svelte"), "src/views/PetPopover.svelte exists");
  const src = readFileSync("src/views/PetPopover.svelte", "utf8") + readFileSync("src/components/pet/PetDisplaySettings.svelte", "utf8") + readFileSync("src/lib/petTray.ts", "utf8");

  // Runes
  assert.ok(src.includes("$state<"), "uses Svelte 5 $state()");
  assert.ok(src.includes("$derived"), "uses Svelte 5 $derived()");
  assert.ok(src.includes("$effect("), "uses Svelte 5 $effect()");

  // Sections: Header, Companion, Agents, Controls, Footer
  assert.ok(src.includes("AgentPet"), "includes AgentPet title");
  assert.ok(src.includes("COMPANION"), "includes COMPANION section");
  assert.ok(src.includes("AGENTS"), "includes AGENTS section");
  assert.ok(src.includes("Clear all"), "includes Clear all action");
  assert.ok(src.includes('id="display-heading">Display'), "groups display preferences");
  assert.ok(src.includes('id="animation-heading">Animation'), "groups animation preferences");
  assert.ok(src.includes("Show pet"), "includes Show pet toggle");
  assert.ok(src.includes("Show count on menu bar"), "includes Show count on menu bar toggle");
  assert.ok(src.includes("Show chat on menu bar"), "includes Show chat on menu bar toggle");
  assert.ok(src.includes("Show bubble on menu bar"), "includes Show bubble on menu bar toggle");
  assert.ok(src.includes("Split pet"), "includes Split pet toggle");
  assert.ok(src.includes("Animate pets"), "includes Animate pets toggle & slider");
  assert.ok(src.includes("Pet size"), "includes Pet size slider");
  assert.ok(src.includes("Settings"), "includes Settings navigation action");
  assert.ok(src.includes("Updates"), "includes Updates action");
  assert.ok(src.includes("Quit"), "includes Quit action");

  // Backend IPC
  assert.ok(src.includes("get_agent_sessions"), "polls get_agent_sessions");
  assert.ok(src.includes("get_pet_care_state"), "polls get_pet_care_state");
  assert.ok(src.includes("setDesktopPetVisible"), "uses shared desktop visibility operation");
  assert.ok(src.includes("clear_agent_sessions"), "invokes clear_agent_sessions");
  assert.ok(src.includes("dismiss_agent_session"), "invokes dismiss_agent_session");
  assert.ok(src.includes("update_tray_title"), "invokes update_tray_title");

  // Lucide vector icons
  assert.ok(src.includes("PawPrint"), "imports PawPrint icon");
  assert.ok(src.includes("Hash"), "imports Hash icon");
  assert.ok(src.includes("MessageSquare"), "imports MessageSquare icon");
  assert.ok(src.includes("List"), "imports List icon");
  assert.ok(src.includes("Columns2"), "imports Columns2 icon");
  assert.ok(src.includes("Play"), "imports Play icon");
  assert.ok(src.includes("Maximize2"), "imports Maximize2 icon");
  assert.ok(src.includes("Settings"), "imports Settings icon");
  assert.ok(src.includes("Power"), "imports Power icon");

  // Popover owns its transparent canvas; text follows the shared theme palette.
  assert.ok(src.includes(":global(body.pet-popover-window)"), "scopes transparent canvas to this window");
  assert.equal(/text-white|bg-white|bg-black/.test(src), false, "no dark-only Tailwind overrides");
  assert.ok(src.includes('event.key !== THEME_STORAGE_KEY'), "syncs theme changes from other windows");
  assert.equal((src.match(/role="switch"/g) || []).length, 6, "all six toggles use switch semantics");

  // Zero emojis
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  assert.equal(emojiRegex.test(src), false, "PetPopover must contain zero emojis");
});

test("main.ts routes PetPopover window", () => {
  const src = readFileSync("src/main.ts", "utf8");
  assert.ok(src.includes("PetPopover"), "imports PetPopover");
  assert.ok(src.includes("isPopover"), "checks isPopover route condition");
  assert.ok(src.includes("pet-popover"), "checks pet-popover window label");
});

test("Rust backend exposes popover and tray commands", () => {
  const src = readFileSync("crates/app/src/lib.rs", "utf8") + (existsSync("crates/app/src/cmd_pet.rs") ? readFileSync("crates/app/src/cmd_pet.rs", "utf8") : "");
  assert.ok(src.includes("fn open_pet_popover"), "implements open_pet_popover");
  assert.ok(src.includes("fn close_pet_popover"), "implements close_pet_popover");
  assert.ok(src.includes("fn toggle_pet_popover"), "implements toggle_pet_popover");
  assert.ok(src.includes("fn clear_agent_sessions"), "implements clear_agent_sessions");
  assert.ok(src.includes("fn update_tray_title"), "implements update_tray_title");
  assert.ok(src.includes("agentpet-tray"), "configures agentpet-tray TrayIcon");
});

test("the three menu bar switches are live, not decoration", () => {
  const src = readFileSync("src/components/pet/PetDisplaySettings.svelte", "utf8");

  for (const [id, key] of [["show-chat", "chat"], ["show-bubble", "bubble"], ["split-pet", "split"]]) {
    const anchor = src.indexOf(`for="${id}"`);
    const row = src.slice(src.lastIndexOf("<label", anchor), src.indexOf("</label>", anchor));
    assert.ok(!/\sdisabled[\s/>]/.test(row), `${id}: không còn bị khoá`);
    assert.match(row, new RegExp(`save\\("${key}"`), `${id}: bật tắt phải ghi được preference`);
    assert.ok(!row.includes("Sắp có"), `${id}: bỏ nhãn chưa làm xong`);
  }
  assert.ok(!src.includes("menu-unavailable"), "không còn dòng ghi chú ba mục chưa dùng được");
});
