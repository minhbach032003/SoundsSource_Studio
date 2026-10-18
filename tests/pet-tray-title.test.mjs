import test from "node:test";
import assert from "node:assert/strict";
import { composeTrayTitle, TRAY_TITLE_MAX } from "../src/lib/petTrayTitle.ts";

const working = { id: "a", state: "working", project: "rust-sound", tool_summary: "Edit spotify.rs" };
const waiting = { id: "b", state: "waiting", project: "docs", tool_summary: "Read README" };
const idleLine = "Let's grill some bugs.";
const off = { count: false, chat: false, bubble: false };

test("the menu bar says nothing when every switch is off", () => {
  assert.equal(composeTrayTitle([working], off, idleLine), "");
});

test("the count keeps working on its own", () => {
  assert.equal(composeTrayTitle([working, waiting], { ...off, count: true }, idleLine), "1");
  assert.equal(composeTrayTitle([waiting], { ...off, count: true }, idleLine), "0");
});

test("the bubble shows what a running agent is doing, chatter stays out of the way", () => {
  const title = composeTrayTitle([working], { count: true, chat: true, bubble: true }, idleLine);
  assert.match(title, /^1 · rust-sound · Edit spotify\.rs$/);
  assert.ok(!title.includes("grill"), "đang làm việc thì không tán gẫu");
});

test("chatter only speaks when no agent is running", () => {
  assert.equal(composeTrayTitle([waiting], { ...off, chat: true }, idleLine), idleLine);
  assert.equal(composeTrayTitle([working], { ...off, chat: true }, idleLine), "");
});

test("a bubble with nothing to say does not leave a dangling separator", () => {
  const bare = { id: "c", state: "working", project: null, tool_summary: null };
  assert.equal(composeTrayTitle([bare], { count: true, chat: false, bubble: true }, idleLine), "1");
});

test("the menu bar is narrow, so a long line is cut with an ellipsis", () => {
  const long = { id: "d", state: "working", project: "rust-sound", tool_summary: "x".repeat(200) };
  const title = composeTrayTitle([long], { ...off, bubble: true }, idleLine);
  assert.ok(title.length <= TRAY_TITLE_MAX, `dài ${title.length} ký tự, vượt ${TRAY_TITLE_MAX}`);
  assert.ok(title.endsWith("…"), "phải cho thấy là đã bị cắt");
});

test("newlines never reach the menu bar", () => {
  const multi = { id: "e", state: "working", project: "a\nb", tool_summary: "c\r\nd" };
  const title = composeTrayTitle([multi], { ...off, bubble: true }, idleLine);
  assert.ok(!/[\r\n]/.test(title), "xuống dòng làm vỡ status item");
});
