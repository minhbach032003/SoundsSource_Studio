// pnpm build && node tests/spotify-layout-browser.mjs
// Runs the production shell with only native IPC replaced; no real playback commands.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const session = `spotify-layout-${process.pid}`;
const browser = async (...args) => (await exec("agent-browser", ["--session", session, ...args], { timeout: 30000 })).stdout;
const evaluate = async expression => JSON.parse(await browser("eval", expression));
const fixture = readFileSync("tests/fixtures/spotify-layout-ipc.js", "utf8");
const root = resolve("dist");
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!path.startsWith(root + "/") || !existsSync(path)) { response.writeHead(404); response.end(); return; }
  let content = readFileSync(path);
  if (path.endsWith("index.html")) content = content.toString().replace("<head>", `<head><script>${fixture}</script>`);
  response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" })[extname(path)] ?? "application/octet-stream");
  response.end(content);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  await browser("set", "viewport", "1280", "900");
  await browser("open", url + "?area=mixer");
  await browser("wait", "--text", "APPLICATION CHANNEL STRIPS");
  assert.equal(await evaluate('document.querySelector("main").getAttribute("aria-label")'), "Audio Mixer", "account restoration must preserve last area");
  await browser("find", "role", "tab", "click", "--name", "Spotify", "--exact");
  await browser("wait", "--text", "Nhạc chill buổi sáng");
  assert.equal(await evaluate('document.querySelector("details.diagnostics").open'), false);
  assert.deepEqual(await evaluate('window.ipcCalls.filter(c=>["spotify_control","spotify_play_uri","connect_spotify_audio","set_master_eq_band","set_master_eq_bypass"].includes(c.command))'), []);
  const layout = await evaluate('(()=>{const library=document.querySelector(".library").getBoundingClientRect(),rack=document.querySelector(".studio-rack").getBoundingClientRect(),dock=document.querySelector(".spotify-player").getBoundingClientRect(); return {overflow:document.documentElement.scrollWidth>innerWidth,sideBySide:rack.left>library.left,playerVisible:dock.bottom<=innerHeight+1};})()');
  assert.deepEqual(layout, { overflow: false, sideBySide: true, playerVisible: true });
  await browser("screenshot", "/tmp/rust-sound-shipped-a-desktop.png");
  await browser("eval", 'document.querySelector("button.item-name").click()');
  await browser("wait", "--text", "Bài hát kiểm thử 2");
  await browser("find", "role", "button", "click", "--name", "Bass Boost", "--exact");
  assert.equal(await evaluate("window.eq.bands[0].gain"), 5.5);
  await browser("find", "role", "tab", "click", "--name", "Mixer", "--exact");
  await browser("wait", "--text", "APPLICATION CHANNEL STRIPS");
  assert.equal(await evaluate('document.querySelectorAll(".spotify-player").length'), 1);
  assert.equal(await evaluate("window.eq.bands[0].gain"), 5.5, "navigation must not reset EQ");
  await browser("eval", 'history.replaceState({}, "", "/")');
  await browser("reload");
  await browser("wait", "--text", "APPLICATION CHANNEL STRIPS");
  assert.equal(await evaluate('document.querySelector("main").getAttribute("aria-label")'), "Audio Mixer");
  await browser("find", "role", "tab", "click", "--name", "Spotify", "--exact");
  await browser("wait", "--text", "Nhạc chill buổi sáng");
  await browser("set", "viewport", "375", "812");
  assert.equal(await evaluate('document.querySelector(".eq-disclosure").getAttribute("aria-expanded")'), "false");
  assert.equal(await evaluate('document.querySelectorAll(".eq-curve").length'), 0, "collapsed EQ must not poll spectrum");
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  await browser("screenshot", "/tmp/rust-sound-shipped-a-narrow.png");
  await browser("find", "role", "button", "click", "--name", "Bass / EQ", "--exact").catch(async () => browser("click", ".eq-disclosure"));
  await browser("wait", "--text", "Live 28-Band Spectrum Analyzer");
  assert.equal(await evaluate('document.querySelector(".eq-disclosure").getAttribute("aria-expanded")'), "true");
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, "expanded rack must not overflow");
  await browser("click", ".eq-disclosure");
  for (const mode of ["empty", "error", "loading"]) {
    await browser("eval", `window.libraryMode='${mode}'`);
    await browser("find", "role", "button", "click", "--name", "Bài đã thích", "--exact");
    await browser("wait", "--text", mode === "empty" ? "Danh sách chưa có bài khả dụng." : mode === "error" ? "Spotify API 502" : "Đang tải nhạc từ Spotify");
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
    if (mode === "loading") await browser("eval", 'window.libraryMode="data"; window.finishLibrary()');
  }
  await browser("open", url + "?area=spotify&loggedout=1");
  await browser("wait", "--text", "Nhạc của bạn, ngay tại đây");
  await browser("find", "role", "button", "click", "--name", "Đăng nhập Spotify", "--exact");
  await browser("wait", "--fn", "typeof window.finishLogin==='function'");
  await browser("find", "role", "tab", "click", "--name", "Mixer", "--exact");
  await browser("eval", "window.finishLogin()");
  await browser("wait", "--text", "Nhạc chill buổi sáng");
  assert.equal(await evaluate('document.querySelector("main").getAttribute("aria-label")'), "Spotify", "explicit login opens music");
  assert.deepEqual(await evaluate('window.ipcCalls.filter(c=>["spotify_control","spotify_play_uri","connect_spotify_audio"].includes(c.command))'), [], "login/navigation never start playback or change DSP");
  assert.equal((await browser("errors")).trim(), "");
  console.log("PASS music-first production shell: layout, persistent player, navigation restore, login transition, no autoplay/EQ reset, narrow rack, loading/empty/error, no browser errors");
} catch (error) {
  console.error(await browser("errors").catch(() => ""));
  console.error(await browser("snapshot").catch(() => ""));
  await browser("screenshot", "/tmp/rust-sound-layout-browser-failure.png").catch(() => {});
  throw error;
} finally {
  await browser("close").catch(() => {});
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
