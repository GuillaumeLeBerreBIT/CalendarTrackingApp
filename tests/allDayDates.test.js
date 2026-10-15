import { describe, it, expect } from "vitest";
import {
  addDaysStr,
  toCalendarAllDayEnd,
  fromCalendarAllDayEnd,
} from "../client/src/lib/allDayDates.ts";

describe("addDaysStr", () => {
  it("crosses month and year boundaries", () => {
    expect(addDaysStr("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysStr("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles leap days", () => {
    expect(addDaysStr("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysStr("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("toCalendarAllDayEnd (stored inclusive → FullCalendar exclusive)", () => {
  it("10 → 15 October is passed to FullCalendar as end 16 October", () => {
    expect(toCalendarAllDayEnd("2026-10-15")).toBe("2026-10-16");
  });

  it("returns undefined when there is no end date", () => {
    expect(toCalendarAllDayEnd(null)).toBeUndefined();
    expect(toCalendarAllDayEnd(undefined)).toBeUndefined();
    expect(toCalendarAllDayEnd("")).toBeUndefined();
  });
});

describe("fromCalendarAllDayEnd (FullCalendar exclusive → stored inclusive)", () => {
  it("10 → 16 October (exclusive from FullCalendar) is stored as 10 → 15", () => {
    expect(fromCalendarAllDayEnd("2026-10-10", "2026-10-16")).toBe("2026-10-15");
  });

  it("single-day all-day event (no end from FullCalendar) stores the start date", () => {
    expect(fromCalendarAllDayEnd("2026-10-10", "")).toBe("2026-10-10");
    expect(fromCalendarAllDayEnd("2026-10-10", null)).toBe("2026-10-10");
  });

  it("single-day drag-select (end = start + 1) stores the start date", () => {
    expect(fromCalendarAllDayEnd("2026-10-10", "2026-10-11")).toBe("2026-10-10");
  });

  it("never returns a date before the start", () => {
    expect(fromCalendarAllDayEnd("2026-10-10", "2026-10-05")).toBe("2026-10-10");
  });

  it("strips a time suffix if one is present", () => {
    expect(fromCalendarAllDayEnd("2026-10-10T00:00", "2026-10-16T00:00")).toBe("2026-10-15");
  });
});

describe("round trip", () => {
  it("stored → FullCalendar → stored is the identity", () => {
    const stored = "2026-10-15";
    const start = "2026-10-10";
    expect(fromCalendarAllDayEnd(start, toCalendarAllDayEnd(stored))).toBe(stored);
  });
});
