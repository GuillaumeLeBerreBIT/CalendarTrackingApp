import { describe, it, expect } from "vitest";
import {
  normalizeTime,
  localSlot,
  isValidTimeZone,
  buildSummaryBody,
} from "../utils/dailySummary.js";

// ---------------------------------------------------------------------------
// normalizeTime — validates "HH:MM" and snaps to the nearest 15-minute grid
// ---------------------------------------------------------------------------
describe("normalizeTime", () => {
  it("passes an already-aligned time through unchanged", () => {
    expect(normalizeTime("08:00")).toBe("08:00");
    expect(normalizeTime("08:15")).toBe("08:15");
  });

  it("zero-pads a single-digit hour", () => {
    expect(normalizeTime("8:00")).toBe("08:00");
  });

  it("rounds minutes to the nearest quarter", () => {
    expect(normalizeTime("08:07")).toBe("08:00");
    expect(normalizeTime("08:08")).toBe("08:15");
    expect(normalizeTime("08:52")).toBe("08:45");
  });

  it("rolls the hour over when minutes round up to 60", () => {
    expect(normalizeTime("08:53")).toBe("09:00");
    expect(normalizeTime("23:53")).toBe("00:00");
  });

  it("returns null for malformed or out-of-range input", () => {
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("08:60")).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidTimeZone — accepts IANA names, rejects everything else
// ---------------------------------------------------------------------------
describe("isValidTimeZone", () => {
  it("accepts real IANA zone names", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
  });

  it("rejects junk, offsets and empty values", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("+02:00")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// localSlot — a moment's local date + 15-min-floored time in a given zone
// ---------------------------------------------------------------------------
describe("localSlot", () => {
  it("floors the minute to the current quarter in UTC", () => {
    expect(localSlot(new Date("2026-01-15T12:07:00Z"), "UTC")).toEqual({
      date: "2026-01-15",
      time: "12:00",
    });
  });

  it("shifts into the zone's local wall time", () => {
    // New York is UTC-5 in January
    expect(localSlot(new Date("2026-01-15T12:07:00Z"), "America/New_York")).toEqual({
      date: "2026-01-15",
      time: "07:00",
    });
  });

  it("rolls the local date back when the zone is behind UTC midnight", () => {
    expect(localSlot(new Date("2026-01-15T02:07:00Z"), "America/New_York")).toEqual({
      date: "2026-01-14",
      time: "21:00",
    });
  });

  it("returns null for an invalid zone", () => {
    expect(localSlot(new Date("2026-01-15T12:00:00Z"), "Mars/Olympus")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSummaryBody — the notification text for a user's events on a day
// ---------------------------------------------------------------------------
describe("buildSummaryBody", () => {
  it("returns null when there are no events", () => {
    expect(buildSummaryBody([])).toBeNull();
  });

  it("names a single timed event with 'at'", () => {
    const events = [{ title: "Standup", start_time: "09:00:00", all_day: false }];
    expect(buildSummaryBody(events)).toBe("1 event today — Standup at 09:00");
  });

  it("lists several events in time order", () => {
    const events = [
      { title: "Gym", start_time: "18:00:00", all_day: false },
      { title: "Standup", start_time: "08:00:00", all_day: false },
      { title: "Lunch", start_time: "12:30:00", all_day: false },
    ];
    expect(buildSummaryBody(events)).toBe(
      "3 events today — Standup 08:00, Lunch 12:30, Gym 18:00",
    );
  });

  it("puts all-day events first and labels them", () => {
    const events = [
      { title: "Standup", start_time: "09:00:00", all_day: false },
      { title: "Trip", start_time: null, all_day: true },
    ];
    expect(buildSummaryBody(events)).toBe(
      "2 events today — Trip (all day), Standup 09:00",
    );
  });

  it("caps the list at three names and counts the rest", () => {
    const events = [
      { title: "A", start_time: "08:00:00", all_day: false },
      { title: "B", start_time: "09:00:00", all_day: false },
      { title: "C", start_time: "10:00:00", all_day: false },
      { title: "D", start_time: "11:00:00", all_day: false },
      { title: "E", start_time: "12:00:00", all_day: false },
    ];
    expect(buildSummaryBody(events)).toBe(
      "5 events today — A 08:00, B 09:00, C 10:00, +2 more",
    );
  });
});
