import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real state methods; replace only the native IPC and UI boundaries.
function state(invoke) {
  const source = readFileSync("src/lib/spotify.svelte.ts", "utf8").replace(/^import .*;$/gm, "").replaceAll("export ", "");
  const feedback = [];
  const saved = new Map();
  const context = vm.createContext({
    invoke, isTauri: () => true, $state: value => value,
    toastState: Object.fromEntries(["info", "success", "error"].map(kind => [kind, message => feedback.push([kind, message])])),
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
  });
  vm.runInContext(ts.transpile(source) + "\nglobalThis.instance = spotifyState;", context);
  return { instance: context.instance, feedback, saved };
}
const account = { configured: true, connected: true, device_id: "local-mac" };
const page = { items: [], offset: 0, next_offset: null };

test("Spotify login loads the real library and devices without exposing OAuth tokens to storage", async () => {
  const calls = [];
  const h = state(async (command, args) => {
    calls.push([command, args]);
    if (command === "spotify_login" || command === "spotify_account") return account;
    if (command === "spotify_browse") return page;
    if (command === "spotify_devices") return [{ id: "local-mac", name: "This Mac", is_active: false }];
    assert.fail(command);
  });
  await h.instance.login();
  assert.equal(h.instance.account.connected, true);
  assert.equal(h.instance.authBusy, false);
  assert.equal(h.instance.loginVersion, 1, "only explicit successful login requests music navigation");
  assert.equal(h.instance.page, page);
  assert.deepEqual(calls.map(([command]) => command).sort(), ["spotify_login", "spotify_browse", "spotify_devices", "spotify_account"].sort());
  assert.equal(calls.find(([command]) => command === "spotify_browse")[1].kind, "playlists");
  assert.equal(h.saved.size, 0);
  assert.equal(h.feedback[0][0], "success");
});

test("an old Spotify search response cannot overwrite the newer search or repopulate after logout", async () => {
  const requests = [];
  const h = state((command) => command === "spotify_browse" ? new Promise(resolve => requests.push(resolve)) : Promise.resolve());
  const oldSearch = h.instance.loadLibrary("search", "old");
  const newSearch = h.instance.loadLibrary("search", "new", 10);
  const fresh = { items: [{ uri: "fresh" }], offset: 10, next_offset: 20 };
  requests[1](fresh); await newSearch;
  requests[0]({ items: [{ uri: "stale" }], offset: 0, next_offset: null }); await oldSearch;
  assert.equal(h.instance.page, fresh);
  assert.equal(h.instance.searchQuery, "new");
  const late = h.instance.loadLibrary("saved");
  await h.instance.logout();
  requests[2](fresh); await late;
  assert.equal(h.instance.page, null);
  assert.equal(h.instance.account.connected, false);
  assert.equal(h.instance.libraryBusy, false);
});

test("Spotify login and playback errors clear busy state and never toast success", async () => {
  const h = state(async () => { throw new Error("permission denied"); });
  await h.instance.login();
  assert.match(h.instance.libraryError, /permission denied/);
  assert.equal(h.instance.authBusy, false);
  assert.equal(h.instance.account, null);
  assert.equal(h.instance.loginVersion, 0, "failed login must not request navigation");
  await h.instance.play("spotify:track:6rqhFgbbKwnb9MLmUQDhG6");
  assert.match(h.instance.error, /permission denied/);
  assert.equal(h.instance.busy, false);
  assert.equal(h.feedback.length, 0);
});

test("Spotify startup restores credentials without starting playback or opening OAuth", async () => {
  const calls = [];
  const h = state(async command => {
    calls.push(command);
    return { configured: true, connected: false, device_id: null };
  });
  await h.instance.restoreAccount();
  assert.deepEqual(calls, ["spotify_account"]);
  assert.equal(h.instance.loginVersion, 0, "restoring an account must not override the last area");
  assert.equal(h.instance.authBusy, false);
  assert.equal(h.feedback.length, 0);
});

test("persistent player volume validates input, targets only Spotify and keeps confirmed values on failure", async () => {
  const calls = [];
  let reject = false;
  const h = state(async (command, args) => {
    calls.push([command, args]);
    if (reject) throw new Error("Device unavailable");
  });
  assert.equal(await h.instance.setVolume(NaN), false);
  assert.equal(calls.length, 0);
  assert.equal(await h.instance.setVolume(1.5), true);
  assert.equal(calls[0][0], "set_app_volume");
  assert.equal(calls[0][1].bundleId, "com.spotify.client");
  assert.equal(calls[0][1].volume, 1);
  await h.instance.setVolume(0.45);
  await h.instance.setMuted(true);
  assert.equal(h.instance.volume, 0.45);
  assert.equal(h.instance.muted, true);
  assert.equal(calls[2][0], "set_app_mute");
  assert.equal(calls[2][1].bundleId, "com.spotify.client");
  reject = true;
  assert.equal(await h.instance.setVolume(0.8), false);
  assert.equal(await h.instance.setMuted(false), false);
  assert.equal(h.instance.volume, 0.45);
  assert.equal(h.instance.muted, true);
  assert.equal(h.instance.volumeBusy, false);
  assert.ok(!calls.some(([command]) => /play|connect_spotify_audio/.test(command)));
});
