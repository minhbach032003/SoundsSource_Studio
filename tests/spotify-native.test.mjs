import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Spotify background launch hides existing windows without Automation or stopping playback", () => {
  const script = readFileSync("crates/core/src/spotify_hide.js", "utf8");
  for (const initiallyHidden of [[], [true], [false], [false, true]]) {
    let hides = 0;
    const apps = initiallyHidden.map(isHidden => ({
      isHidden, playing: true, pid: 123,
      get hide() { hides++; this.isHidden = true; return false; },
    }));
    runInNewContext(script, {
      ObjC: { import: framework => assert.equal(framework, "AppKit") },
      $: { NSRunningApplication: { runningApplicationsWithBundleIdentifier: bundle => {
        assert.equal(bundle, "com.spotify.client");
        return { count: apps.length, objectAtIndex: i => apps[i] };
      } } },
      // No Application/System Events bridge: hiding must not require Automation.
    });
    assert.equal(hides, initiallyHidden.filter(hidden => !hidden).length);
    assert.ok(apps.every(app => app.isHidden && app.playing && app.pid === 123));
  }
});

test("Spotify native IOProc maps interleaved and planar stereo, rejecting undersized buffers", { skip: process.platform !== "darwin" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "rust-sound-spotify-"));
  try {
    const executable = join(directory, "spotify-io");
    execFileSync("clang", ["-fobjc-arc", "-framework", "Foundation", "-framework", "CoreAudio", "crates/core/tests/spotify_io.m", "-o", executable]);
    execFileSync(executable, [], { timeout: 5000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
