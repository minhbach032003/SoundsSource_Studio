import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real helpers; replace only the native IPC boundary.
function lib(invoke = async () => ({})) {
  const source = readFileSync("src/lib/memory.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
  const context = vm.createContext({ invoke, isTauri: () => true });
  vm.runInContext(
    `${ts.transpile(source)}
globalThis.api = { formatSignedBytes, describeDecision, cleanMemory, setAutoPolicy, getMemoryAreas };`,
    context
  );
  return context.api;
}

test("reclaimed bytes are reported with their sign, never flattered to zero", () => {
  const { formatSignedBytes } = lib();
  assert.equal(formatSignedBytes(0), "0 B");
  assert.equal(formatSignedBytes(512), "+512 B");
  assert.equal(formatSignedBytes(1024 * 1024), "+1.0 MB");
  assert.equal(formatSignedBytes(3 * 1024 ** 3), "+3.0 GB");
  // A clean can end with less memory available than it started. Saying "0 B" there would
  // be a nicer number than the truth.
  assert.equal(formatSignedBytes(-2 * 1024 ** 2), "-2.0 MB");
  assert.equal(formatSignedBytes(-900), "-900 B");
});

test("the scheduler's own reason is shown verbatim rather than a generic label", () => {
  const { describeDecision } = lib();
  assert.equal(describeDecision(undefined), "Checking...");
  assert.equal(
    describeDecision({ state: "idle", reason: "Cooling down for another 4 min" }),
    "Cooling down for another 4 min",
    "a toggle that does nothing must say why"
  );
  assert.match(describeDecision({ state: "run", trigger: { kind: "interval" } }), /interval/);
  assert.match(
    describeDecision({ state: "run", trigger: { kind: "usage_above", used_percent: 91.25 } }),
    /91\.3%/
  );
});

test("a manual clean forwards the prompt consent it was given, and nothing more", async () => {
  const calls = [];
  const { cleanMemory } = lib(async (command, args) => {
    calls.push([command, args]);
    return { before: {}, after: {}, freed_bytes: 0, outcomes: [], duration_ms: 1 };
  });
  await cleanMemory(["app_working_set"], false);
  await cleanMemory(["file_cache"], true);
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([
      ["memory_clean", { areaIds: ["app_working_set"], allowPrompt: false }],
      ["memory_clean", { areaIds: ["file_cache"], allowPrompt: true }],
    ])
  );
});

test("the saved auto policy is whatever the backend stored, not what the UI asked for", async () => {
  // The backend drops areas that cannot run unattended and clamps the numbers; the UI has
  // to display that result or it shows a policy that will never run.
  const { setAutoPolicy } = lib(async () => ({
    enabled: true,
    areas: ["app_working_set"],
    every_minutes: 1,
    when_used_percent_above: 99,
    cooldown_minutes: 1,
  }));
  const stored = await setAutoPolicy({
    enabled: true,
    areas: ["app_working_set", "file_cache"],
    every_minutes: 0,
    when_used_percent_above: 140,
    cooldown_minutes: 0,
  });
  assert.equal(JSON.stringify(stored.areas), JSON.stringify(["app_working_set"]));
  assert.equal(stored.every_minutes, 1);
  assert.equal(stored.cooldown_minutes, 1);
});

test("MemoryPanel never pre-selects an area that would open a password prompt", () => {
  const path = "src/components/cleaner/MemoryPanel.svelte";
  assert.ok(existsSync(path), "MemoryPanel.svelte exists");
  const src = readFileSync(path, "utf8");

  assert.ok(src.includes("$props()") === false, "panel is self-contained, it takes no props");
  assert.ok(src.includes("$state<"), "uses Svelte 5 runes");
  assert.ok(src.includes("$derived"), "uses Svelte 5 runes");

  // The default tick list is the safety property: a memory cleaner that arrives with an
  // authentication prompt already selected is a trap.
  const defaults = src.slice(src.indexOf("function defaultSelection"));
  assert.ok(
    defaults.slice(0, 300).includes("!a.prompts_for_credentials"),
    "default selection must exclude areas that prompt"
  );

  // Areas come from the backend, so a Windows build never offers macOS's purge.
  assert.ok(src.includes("getMemoryAreas"), "renders the platform's own area list");
  for (const hardcoded of ["standby_list", "/usr/sbin/purge", "drop_caches"]) {
    assert.equal(
      src.includes(hardcoded),
      false,
      `must not hardcode the platform-specific ${hardcoded}`
    );
  }

  // Every run and every refusal is shown, which is the fix for "the result is vague".
  assert.ok(src.includes("outcome.detail"), "shows why an area could not run");
  assert.ok(src.includes("record.notes"), "shows the notes recorded for past runs");
  assert.ok(src.includes("describeDecision"), "shows what auto clean will do next and why");

  assert.equal(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src),
    false,
    "MemoryPanel.svelte must contain zero emojis"
  );
});

test("the memory commands the frontend calls are the ones Rust registers", () => {
  const registered = readFileSync("crates/app/src/lib.rs", "utf8");
  const commands = readFileSync("crates/app/src/cmd_memory.rs", "utf8");
  const frontend = readFileSync("src/lib/memory.ts", "utf8");

  for (const name of [
    "memory_snapshot",
    "memory_areas",
    "memory_clean",
    "memory_set_auto_policy",
    "memory_auto_status",
  ]) {
    assert.ok(frontend.includes(`"${name}"`), `${name} is invoked by the frontend`);
    assert.ok(commands.includes(`pub fn ${name}`) || commands.includes(`pub async fn ${name}`),
      `${name} is defined in cmd_memory.rs`);
    assert.ok(
      new RegExp(`^\\s+${name},$`, "m").test(registered),
      `${name} is in the invoke_handler list`
    );
  }
});
