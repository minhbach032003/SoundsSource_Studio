import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("last workspace restores only known routes and tolerates unavailable storage", () => {
  const saved = new Map();
  const context = vm.createContext({ localStorage: {
    getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value),
  } });
  vm.runInContext(ts.transpile(readFileSync("src/lib/navigation.ts", "utf8").replaceAll("export ", "")), context);
  assert.equal(vm.runInContext("restoreTab()", context), "mixer");
  for (const tab of ["spotify", "mixer", "timer", "pings", "voice", "pet", "settings"]) {
    vm.runInContext(`rememberTab('${tab}')`, context);
    assert.equal(vm.runInContext("restoreTab()", context), tab);
  }
  saved.set("rust_sound_active_area", "removed-view");
  assert.equal(vm.runInContext("restoreTab()", context), "mixer");
  context.localStorage = { getItem() { throw Error("Denied"); }, setItem() { throw Error("Denied"); } };
  assert.equal(vm.runInContext("restoreTab()", context), "mixer");
  assert.doesNotThrow(() => vm.runInContext("rememberTab('spotify')", context));
});

test("music-first shell has one player outside routed views and a library-only Spotify workspace", () => {
  const shell = readFileSync("src/App.svelte", "utf8");
  const music = readFileSync("src/views/SpotifyView.svelte", "utf8");
  const mixer = readFileSync("src/views/MixerView.svelte", "utf8");
  assert.equal((shell.match(/<SpotifyPlayer\s*\/>/g) ?? []).length, 1);
  assert.ok(shell.indexOf("<SpotifyPlayer />") > shell.indexOf("</main>"));
  assert.ok(!mixer.includes("SpotifyPlayer"));
  assert.ok(shell.includes("rememberTab(activeTab)") && shell.includes("restoreTab()"));
  assert.ok(shell.includes('spotifyState.loginVersion > 0') && shell.includes('<SpotifyView />'));
  assert.ok(!/StudioEQInspector|diagnosticsOpen|eqOpen|set_master_eq|spotify-mobile-eq/.test(music));
  assert.ok(mixer.includes('StudioEQInspector'), 'shared EQ stays in Mixer');
  assert.ok(music.includes('title="Ngắt tài khoản Spotify?"'), 'logout still requires confirmation');
  assert.ok(!/onMount[\s\S]*?spotifyState\.(play|connect|control)\(/.test(music.slice(0, music.indexOf('</script>'))));
  assert.ok(!mixer.includes('1.8 ms') && !mixer.includes('54139'), "no fabricated diagnostics shelf");
});
