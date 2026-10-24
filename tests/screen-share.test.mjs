import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import { pathToFileURL } from "node:url";

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

test("rebuild requires a stable identity and verifies it before deployment", () => {
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
  assert.ok(!rebuild.includes("codesign --force --deep --sign -"), "no ad-hoc fallback");
});

for (const scenario of ["missing", "invalid", "valid"]) {
  test(`production rebuild: ${scenario} identity/signature`, () => {
    const root = mkdtempSync(join(tmpdir(), "sound-signing-test-"));
    try {
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "bin"));
      // Unregistering the temporary build is unrelated to signing and must not touch macOS in tests.
      writeFileSync(join(root, "scripts/rebuild-app.sh"), rebuild.replace(/^LSREGISTER=.*$/m, "LSREGISTER=/usr/bin/true"));
      const tool = (path, body) => writeFileSync(join(root, path), `#!/bin/bash\n${body}\n`, { mode: 0o700 });
      tool("scripts/macos-signing-identity.sh", '[ "$SCENARIO" != missing ] || exit 1\necho "Test Identity"');
      tool("bin/uname", 'echo Darwin');
      tool("bin/pnpm", 'echo build >> "$EVENTS"\n/bin/mkdir -p "target/release/bundle/macos/SoundsSource Studio.app"');
      tool("bin/codesign", 'echo "codesign $*" >> "$EVENTS"\nif [[ "$*" == *--verify* && "$SCENARIO" == invalid ]]; then exit 1; fi');
      for (const command of ["rm", "cp"]) {
        tool(`bin/${command}`, `echo "${command} $*" >> "$EVENTS"`);
      }
      const events = join(root, "events");
      const result = spawnSync("/bin/bash", ["scripts/rebuild-app.sh"], {
        cwd: root,
        env: { ...process.env, PATH: `${root}/bin:/usr/bin:/bin`, SCENARIO: scenario, EVENTS: events },
        encoding: "utf8",
        timeout: 10000,
      });
      const log = existsSync(events) ? readFileSync(events, "utf8") : "";
      assert.ifError(result.error);
      if (scenario === "missing") {
        assert.notEqual(result.status, 0);
        assert.equal(log, "", "no build or destructive command before identity check");
        assert.match(result.stderr, /macos-signing-identity.sh/);
      } else if (scenario === "invalid") {
        assert.notEqual(result.status, 0);
        assert.ok(!log.includes("/Applications"), log);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(log.includes("--sign Test Identity"), log);
        const verify = log.indexOf("codesign --verify");
        assert.ok(verify >= 0 && verify < log.indexOf("/Applications"), log);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("identity --check matches an exact name and never provisions Keychain", () => {
  const root = mkdtempSync(join(tmpdir(), "sound-identity-test-"));
  try {
    writeFileSync(join(root, "uname"), '#!/bin/bash\necho Darwin\n', { mode: 0o700 });
    writeFileSync(join(root, "security"), '#!/bin/bash\n[[ "$*" == "find-identity -v -p codesigning" ]] || exit 99\nprintf \'%s\\n\' "$IDENTITIES"\n', { mode: 0o700 });
    for (const name of ["SoundsSource Local Dev", "SoundsSource Local Dev Old", "Other SoundsSource Local Dev"]) {
      const result = spawnSync("/bin/bash", ["scripts/macos-signing-identity.sh", "--check"], {
        env: { ...process.env, PATH: `${root}:/usr/bin:/bin`, RUST_SOUND_SIGN_IDENTITY: "SoundsSource Local Dev", IDENTITIES: `1) ABCDEF "${name}"` },
        encoding: "utf8",
        timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, name === "SoundsSource Local Dev" ? 0 : 1, result.stderr);
      assert.equal(result.stdout.trim(), name === "SoundsSource Local Dev" ? name : "");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local identity setup uses scoped trust without blanket key ACL updates", () => {
  const script = readFileSync("scripts/macos-signing-identity.sh", "utf8");
  assert.match(script, /add-trusted-cert -r trustRoot -p codeSign/);
  assert.ok(!script.includes("set-key-partition-list"));
  assert.ok(script.includes("umask 077"));
  assert.ok(script.includes('p12_password="$(/usr/bin/openssl rand -hex 24)"'));
  assert.ok(script.includes('-passout "pass:$p12_password"'));
  assert.ok(script.includes('-P "$p12_password"'), "import must use the same nonempty temporary password");
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

test("the denied panel explains stale grants and shows the signing hint before capture", async () => {
  const view = readFileSync("src/views/VoiceAiView.svelte", "utf8");
  const panel = view.slice(
    view.indexOf("{#if screenPermissionMissing && !geminiLiveState.isScreenSharing}"),
    view.indexOf("{#if geminiLiveState.isScreenSharing && geminiLiveState.screenShareIssue}")
  );
  const identitySource = readFileSync("src/lib/appIdentity.ts", "utf8")
    .replace(/^import .*;$/gm, "").replaceAll("export ", "");
  const component = compile(`<script>
    ${ts.transpile(identitySource)}
    let { signingIdentity } = $props();
    let screenPermissionMissing = $state(true);
    const geminiLiveState = { isScreenSharing: false };
    const ShieldAlert = () => {}, Settings2 = () => {}, RotateCcw = () => {};
    const handleOpenScreenSettings = () => {}, recheckScreenPermission = () => {}, startShareUnchecked = () => {};
  </script>${panel}`, { generate: "server", filename: "PermissionPanel.svelte" });
  const root = mkdtempSync(join(process.cwd(), ".permission-panel-test-"));
  try {
    const file = join(root, "panel.mjs");
    writeFileSync(file, component.js.code);
    const { default: Panel } = await import(pathToFileURL(file).href);
    const stable = render(Panel, { props: { signingIdentity: { kind: "certificate", permissions_reset_on_rebuild: false } } }).body;
    const adhoc = render(Panel, { props: { signingIdentity: { kind: "ad_hoc", permissions_reset_on_rebuild: true } } }).body;
    assert.match(stable, /SoundsSource Studio/);
    assert.match(stable, /đã bật/);
    assert.match(stable, /Cmd\+Q/);
    assert.ok(!stable.includes("macos-signing-identity.sh"));
    assert.match(adhoc, /macos-signing-identity.sh/);
    assert.ok(!stable.includes("rust-sound chưa có quyền"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
