import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { petMoodFor, splitPetSessions, SPLIT_PET_MAX } from "../src/lib/petMood.ts";

test("each agent carries its own mood, so split pets do not mime one another", () => {
  assert.equal(petMoodFor({ state: "working", tool_name: "Edit" }), "working");
  assert.equal(petMoodFor({ state: "working", tool_name: "Grep" }), "reading");
  assert.equal(petMoodFor({ state: "working", tool_name: "ReadFile" }), "reading");
  assert.equal(petMoodFor({ state: "waiting" }), "waiting");
  assert.equal(petMoodFor({ state: "done" }), "done");
  assert.equal(petMoodFor(undefined), "idle");
  assert.equal(petMoodFor({ state: "working" }, { celebrating: true }), "celebrate", "vuốt ve thắng mọi trạng thái");
});

test("split gives a pet only to agents that are actually busy", () => {
  const sessions = [
    { id: 1, state: "working" },
    { id: 2, state: "done" },
    { id: 3, state: "waiting" },
  ];
  assert.deepEqual(splitPetSessions(sessions, true).map((s) => s.id), [1, 3]);
  assert.deepEqual(splitPetSessions(sessions, false), [], "tắt thì không tách");
});

test("split is capped so the pets stay on screen", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: i, state: "working" }));
  assert.equal(splitPetSessions(many, true).length, SPLIT_PET_MAX);
});

test("the overlay window widens for the extra pets", () => {
  const src = readFileSync("src/lib/petPreferences.ts", "utf8");
  assert.match(
    src,
    /petOverlayWindowSize\([^)]*pets/,
    "kích thước cửa sổ phải biết có bao nhiêu con, nếu không con thứ hai bị cắt mất"
  );
});

test("the overlay renders one sprite per split session", () => {
  const src = readFileSync("src/views/PetOverlay.svelte", "utf8");
  assert.match(src, /splitPetSessions/, "overlay dùng chung luật tách với test");
  assert.match(src, /\{#each splitPets as/, "phải lặp sprite, không chỉ đổi con đang hiện");
  assert.match(src, /petMoodFor\(/, "mỗi con lấy tâm trạng của phiên nó đại diện");
});
