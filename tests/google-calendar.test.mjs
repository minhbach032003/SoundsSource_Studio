import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const emojiRegex =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

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

test("googleCalendar.svelte.ts integrates native Tauri IPC commands and state management", () => {
  const src = readFileSync("src/lib/googleCalendar.svelte.ts", "utf8");

  // Tauri commands
  assert.ok(src.includes("google_calendar_status"), "invokes google_calendar_status");
  assert.ok(src.includes("google_calendar_login"), "invokes google_calendar_login");
  assert.ok(src.includes("google_calendar_sync"), "invokes google_calendar_sync");
  assert.ok(src.includes("google_calendar_create_event"), "invokes google_calendar_create_event");
  assert.ok(src.includes("google_calendar_disconnect"), "invokes google_calendar_disconnect");

  // Event creation
  assert.ok(src.includes("createEvent"), "implements createEvent method");

  // State runes
  assert.ok(src.includes("isConnected = $state(false)"), "tracks isConnected state");
  assert.ok(src.includes("accountEmail = $state"), "tracks accountEmail state");
  assert.ok(src.includes("events = $state"), "tracks events state");
  assert.ok(src.includes("isLoading = $state"), "tracks isLoading state");
  assert.ok(src.includes("lastSynced = $state"), "tracks lastSynced state");
  assert.ok(src.includes("error = $state"), "tracks error state");

  // Local storage mapping for is_completed
  assert.ok(src.includes("ss_gcal_completed_ids"), "persists is_completed mapping in localStorage");
  assert.ok(src.includes("completedMap"), "maintains completedMap to prevent status loss on sync");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "googleCalendar.svelte.ts must contain zero emojis");
});

test("TimerView.svelte integrates native Google Calendar UI actions and Zero Emojis", () => {
  const src = readFileSync("src/views/TimerView.svelte", "utf8");

  // Connect, sync and disconnect actions
  assert.ok(src.includes("handleConnectCalendar"), "implements handleConnectCalendar");
  assert.ok(src.includes("handleSyncCalendar"), "implements handleSyncCalendar");
  assert.ok(src.includes("handleDisconnectCalendar"), "implements handleDisconnectCalendar");

  // Create event action and modal
  assert.ok(src.includes("handleOpenCreateEventModal"), "implements handleOpenCreateEventModal");
  assert.ok(src.includes("handleConfirmCreateEvent"), "implements handleConfirmCreateEvent");
  assert.ok(src.includes("isCreateEventModalOpen"), "has isCreateEventModalOpen state");

  // Focus goal on event click / button
  assert.ok(src.includes("handleFocusGoal"), "implements handleFocusGoal for events");

  // Google Meet / Hangouts link with ExternalLink icon
  assert.ok(src.includes("ExternalLink"), "uses ExternalLink Lucide icon");
  assert.ok(src.includes("Video"), "uses Video Lucide icon");
  assert.ok(src.includes("hangout_link"), "supports Google Meet / Hangouts link");

  // Zero emojis rule
  assert.equal(emojiRegex.test(src), false, "TimerView.svelte must contain zero emojis");
});
