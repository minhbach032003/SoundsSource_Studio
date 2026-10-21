import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const gemini = readFileSync("src/lib/geminiLive.svelte.ts", "utf8");
const cmdSystem = readFileSync("crates/app/src/cmd_system.rs", "utf8");
/// The comments here describe the old approach on purpose, so assertions about what the
/// code does must not read them.
const stripComments = (rust) =>
  rust
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
const cmdSystemCode = stripComments(cmdSystem);
const rebuild = readFileSync("scripts/rebuild-app.sh", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("the screen frame is encoded once, at the size the uplink sends", () => {
  // The old path shelled out to screencapture, wrote a full-resolution JPEG to /tmp,
  // read it back, base64'd it across IPC, and the webview then scaled and re-encoded it.
  assert.equal(
    cmdSystemCode.includes("screencapture"),
    false,
    "capture must not spawn a process per frame"
  );
  assert.equal(cmdSystemCode.includes("temp_dir()"), false, "no frame should touch the disk");
  assert.ok(
    cmdSystem.includes("sound_core::screen::capture_main_display_jpeg"),
    "capture runs in-process"
  );

  // The uplink asks for exactly what it will send, so the oversized original never exists.
  assert.ok(gemini.includes("maxEdge: SCREEN_FRAME_MAX_WIDTH"), "frontend sends its own cap");
  assert.ok(gemini.includes("quality: SCREEN_FRAME_QUALITY"), "and its own quality");

  // And it does not re-encode a frame that already matches.
  assert.ok(gemini.includes("this.nativeScreenBase64"), "the native bytes are reused");
  const send = gemini.slice(gemini.indexOf("let base64Jpeg: string;"));
  assert.ok(
    send.slice(0, 400).includes("width === srcWidth && height === srcHeight"),
    "re-encode only when the canvas actually changed the frame"
  );
});

test("the capture command clamps what the webview can ask for", () => {
  const command = cmdSystem.slice(
    cmdSystem.indexOf("pub async fn capture_screen_jpeg"),
    cmdSystem.indexOf("pub fn app_signing_identity")
  );
  assert.ok(command.includes(".clamp(160, 4096)"), "a wild max edge cannot be requested");
  assert.ok(command.includes(".clamp(0.1, 1.0)"), "quality stays in range");
  assert.ok(command.includes("DEFAULT_MAX_EDGE"), "omitting the argument still works");
});

test("rebuild signs with a stable identity when one exists, and warns when it does not", () => {
  assert.ok(existsSync("scripts/macos-signing-identity.sh"), "the identity script exists");
  assert.equal(
    pkg.scripts["rebuild:app"],
    "./scripts/rebuild-app.sh",
    "rebuild:app runs the script, not an inline chain ending in an ad-hoc signature"
  );
  assert.ok(pkg.scripts["sign:identity"], "creating the identity is a first-class command");

  assert.ok(
    rebuild.includes("macos-signing-identity.sh --check"),
    "it looks for a real identity first"
  );
  assert.ok(
    rebuild.includes('codesign --force --deep --sign "$identity"'),
    "and uses it when present"
  );
  // The fallback is still allowed, but it must say what it costs rather than silently
  // producing a build whose permissions reset.
  const fallback = rebuild.slice(rebuild.indexOf("codesign --force --deep --sign -"));
  assert.ok(fallback.includes("granted again"), "the ad-hoc fallback explains itself");
  assert.ok(fallback.includes("macos-signing-identity.sh"), "and points at the fix");
});

test("the app can tell the user why a granted permission disappeared", () => {
  assert.ok(cmdSystem.includes("pub fn app_signing_identity"), "the command exists");
  assert.ok(
    readFileSync("crates/app/src/lib.rs", "utf8").includes("            app_signing_identity,"),
    "and is registered"
  );

  const source = readFileSync("src/lib/appIdentity.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
  const context = vm.createContext({ invoke: async () => ({}), isTauri: () => false });
  vm.runInContext(`${ts.transpile(source)}\nglobalThis.api = { rebuildPermissionHint };`, context);
  const { rebuildPermissionHint } = context.api;

  assert.equal(rebuildPermissionHint(null), null);
  assert.equal(
    rebuildPermissionHint({ kind: "certificate", permissions_reset_on_rebuild: false }),
    null,
    "a certificate-signed build keeps its permissions, so there is nothing to say"
  );
  const hint = rebuildPermissionHint({ kind: "ad_hoc", permissions_reset_on_rebuild: true });
  assert.ok(hint && hint.includes("macos-signing-identity.sh"), hint ?? "no hint");

  const view = readFileSync("src/views/VoiceAiView.svelte", "utf8");
  assert.ok(
    view.includes("rebuildPermissionHint(signingIdentity)"),
    "the screen-share help panel shows it"
  );
  assert.ok(
    view.includes("build lại vẫn bị hỏi"),
    "and names the symptom the user actually sees"
  );
});

test("memory is reported from one place, so the Cleaner cannot show two percentages", () => {
  const cleaner = readFileSync("crates/app/src/cmd_cleaner.rs", "utf8");
  const metrics = cleaner.slice(cleaner.indexOf("pub fn cleaner_get_hardware_metrics"));
  assert.ok(
    metrics.slice(0, 1400).includes("sound_core::memory::snapshot()"),
    "hardware metrics share the Memory panel's definition of used memory"
  );
  assert.equal(
    stripComments(metrics.slice(0, 1400)).includes("sys.used_memory()"),
    false,
    "sysinfo's narrower definition would disagree with the Memory tab on the same screen"
  );
});
