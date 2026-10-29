import { describe, it, expect } from "vitest";
import { nextOccurrence, routineView } from "../utils/routines.js";

// Swim: Mondays + Tuesdays at 19:00 Brussels (summer: UTC+2 → 17:00 UTC).
const swim = {
  event_id: 7, event_title: "Swim", start_date: "2026-07-06", end_date: "2026-07-06",
  start_time: "19:00:00", end_time: "20:00:00", all_day: false, timezone: "Europe/Brussels",
  recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU", reminder_minutes: 30,
};

describe("nextOccurrence", () => {
  it("finds the next day in the rule after now", () => {
    // Wed 8 Jul 2026 12:00 UTC → next is Mon 13 Jul.
    expect(nextOccurrence(swim, [], new Date("2026-07-08T12:00:00Z"))).toEqual({ date: "2026-07-13", time: "19:00" });
  });

  it("returns today's session while it has not started yet", () => {
    // Mon 13 Jul 16:00 UTC = 18:00 Brussels, session at 19:00.
    expect(nextOccurrence(swim, [], new Date("2026-07-13T16:00:00Z"))).toEqual({ date: "2026-07-13", time: "19:00" });
  });

  it("skips today's session once it has started", () => {
    // Mon 13 Jul 17:30 UTC = 19:30 Brussels → Tuesday.
    expect(nextOccurrence(swim, [], new Date("2026-07-13T17:30:00Z"))).toEqual({ date: "2026-07-14", time: "19:00" });
  });

  it("skips a cancelled occurrence", () => {
    const ov = [{ occurrence_date: "2026-07-13", is_cancelled: true }];
    expect(nextOccurrence(swim, ov, new Date("2026-07-08T12:00:00Z"))).toEqual({ date: "2026-07-14", time: "19:00" });
  });

  it("is null once the series has ended", () => {
    const ended = { ...swim, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20260710T235959Z" };
    expect(nextOccurrence(ended, [], new Date("2026-07-11T12:00:00Z"))).toBeNull();
  });

  it("handles all-day routines", () => {
    const rest = { ...swim, all_day: true, start_time: null, end_time: null };
    expect(nextOccurrence(rest, [], new Date("2026-07-08T12:00:00Z"))).toEqual({ date: "2026-07-13", time: null });
  });
});

describe("routineView", () => {
  it("shapes a row for the client", () => {
    expect(routineView(swim, [], new Date("2026-07-08T12:00:00Z"))).toEqual({
      eventId: 7, title: "Swim", rule: "FREQ=WEEKLY;BYDAY=MO,TU", startDate: "2026-07-06",
      startTime: "19:00", endTime: "20:00", allDay: false, reminderMinutes: 30, timezone: "Europe/Brussels",
      next: { date: "2026-07-13", time: "19:00" }, ended: false,
    });
  });
  it("marks an ended series", () => {
    const ended = { ...swim, recurrence_rule: "FREQ=WEEKLY;UNTIL=20260710T235959Z" };
    expect(routineView(ended, [], new Date("2026-07-11T12:00:00Z"))).toMatchObject({ next: null, ended: true });
  });
});
