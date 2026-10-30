import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("Google Calendar backend embeds client_id and client_secret and loads from .env", () => {
  assert.ok(existsSync("crates/calendar/build.rs"), "crates/calendar/build.rs must exist");
  const buildRs = readFileSync("crates/calendar/build.rs", "utf8");
  assert.ok(buildRs.includes('cargo:rustc-env=GOOGLE_CLIENT_ID='), "build.rs must set GOOGLE_CLIENT_ID env");

  const libRs = readFileSync("crates/calendar/src/lib.rs", "utf8");
  assert.ok(libRs.includes("load_dotenv_var"), "must have load_dotenv_var fallback");
  assert.ok(libRs.includes('load_dotenv_var("GOOGLE_CLIENT_ID")'), "must check .env for GOOGLE_CLIENT_ID");

  const appLibRs = readFileSync("crates/app/src/lib.rs", "utf8");
  assert.ok(appLibRs.includes("GoogleCalendarService::new(client_id, client_secret)"), "AppState must pass client credentials to GoogleCalendarService");
  assert.ok(appLibRs.includes("google_calendar_cancel"), "AppState must register google_calendar_cancel command");
});

test("TimerView integrates goal deselection, timebox calculation, and calendar sync", () => {
  const timerSrc = readFileSync("src/views/TimerView.svelte", "utf8");
  assert.ok(timerSrc.includes("activeGoalId = null"), "must support goal deselection");
  assert.ok(timerSrc.includes("newEndTime = addMinutesToTime(newStartTime, dur)"), "quick duration must preserve custom start time");
  assert.ok(timerSrc.includes("handleClearCompleted"), "must support clearing completed tasks");
  assert.ok(timerSrc.includes("handleConnectCalendar"), "must wire calendar login trigger");
  assert.ok(timerSrc.includes("handleCancelCalendar"), "must wire calendar cancel trigger");

  const gcalSrc = readFileSync("src/lib/googleCalendar.svelte.ts", "utf8");
  assert.ok(gcalSrc.includes("autoSyncIfEmpty"), "must auto-sync empty calendar when connected");
  assert.ok(gcalSrc.includes("cancelLogin"), "must support cancelLogin");
});
