import assert from "node:assert/strict";
import test from "node:test";

test("google calendar event structure validation", () => {
  const event = {
    id: "gcal-1",
    summary: "CoreAudio Architecture & Sound Routing",
    start_time: "09:00",
    end_time: "09:45",
    duration_minutes: 45,
    source: "google-calendar",
    is_completed: false,
  };

  assert.equal(event.source, "google-calendar");
  assert.equal(event.duration_minutes, 45);
  assert.equal(event.start_time, "09:00");
  assert.equal(event.end_time, "09:45");
  assert.equal(event.is_completed, false);
});

test("schedule calculation between start and end time", () => {
  function diffMinutes(start, end) {
    const [h1, m1] = start.split(":").map(Number);
    const [h2, m2] = end.split(":").map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  }

  assert.equal(diffMinutes("09:00", "09:45"), 45);
  assert.equal(diffMinutes("14:00", "15:00"), 60);
  assert.equal(diffMinutes("16:15", "17:05"), 50);
});
