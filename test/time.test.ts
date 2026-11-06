import assert from "node:assert/strict";
import { test } from "node:test";
import { dayKey, formatTime, formatWhen, googleDate, groupByDay, isValidTz, sameClock, timezoneOptions } from "../src/time.ts";

const WINTER = "2026-11-10T00:00:00Z";

test("isValidTz accepts real zones and refuses others", () => {
  assert.equal(isValidTz("Asia/Kolkata"), true);
  assert.equal(isValidTz("Mars/Olympus"), false);
});

test("dayKey follows the zone's calendar day", () => {
  assert.equal(dayKey(WINTER, "America/Los_Angeles"), "2026-11-09");
  assert.equal(dayKey(WINTER, "UTC"), "2026-11-10");
  assert.equal(dayKey("2026-11-09T22:00:00Z", "Pacific/Kiritimati"), "2026-11-10");
});

test("groupByDay splits one UTC day across local days", () => {
  const groups = groupByDay(["2026-11-10T03:00:00Z", "2026-11-10T20:00:00Z"], "America/Los_Angeles");
  assert.deepEqual([...groups.keys()], ["2026-11-09", "2026-11-10"]);
});

test("half-hour zones format correctly", () => {
  assert.match(formatTime(WINTER, "Asia/Kolkata"), /^5:30/);
});

test("formatWhen makes offset-only names unambiguous", () => {
  assert.match(formatWhen(WINTER, "Asia/Dubai"), /GMT\+4 \(Asia\/Dubai\)/);
  assert.match(formatWhen(WINTER, "America/Los_Angeles"), /PST/);
});

test("sameClock sees aliases and same-offset zones as equal", () => {
  assert.equal(sameClock(WINTER, "US/Pacific", "America/Los_Angeles"), true);
  assert.equal(sameClock(WINTER, "America/Tijuana", "America/Los_Angeles"), true);
  assert.equal(sameClock(WINTER, "Europe/London", "America/Los_Angeles"), false);
});

test("sameClock follows daylight saving, not the zone name", () => {
  assert.equal(sameClock("2026-07-01T17:00:00Z", "America/Phoenix", "America/Los_Angeles"), true);
  assert.equal(sameClock("2026-12-01T17:00:00Z", "America/Phoenix", "America/Los_Angeles"), false);
});

test("timezoneOptions keeps a current zone the runtime does not list", () => {
  assert.equal(timezoneOptions("US/Pacific")[0], "US/Pacific");
  assert.ok(timezoneOptions("UTC").length > 100);
});

test("googleDate is the calendar template format", () => {
  assert.equal(googleDate("2026-09-15T17:00:00Z"), "20260915T170000Z");
});
