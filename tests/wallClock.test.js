import { describe, it, expect } from "vitest";
import { toWallClock, wallClockToInstant, todayIn } from "../utils/wallClock.js";

const BRU = "Europe/Brussels";

describe("wallClockToInstant", () => {
  it("reads a summer wall clock as UTC+2", () => {
    expect(wallClockToInstant("2026-07-01", "18:00:00", BRU).toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });

  it("reads a winter wall clock as UTC+1", () => {
    expect(wallClockToInstant("2026-01-15", "18:00", BRU).toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("treats a missing time as local midnight", () => {
    expect(wallClockToInstant("2026-07-01", null, BRU).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("is the inverse of toWallClock across a DST changeover week", () => {
    for (const [date, time] of [
      ["2026-03-28", "23:30:00"], ["2026-03-29", "03:30:00"], ["2026-10-24", "23:30:00"], ["2026-10-25", "03:30:00"],
    ]) {
      const back = toWallClock(wallClockToInstant(date, time, BRU), BRU);
      expect(back).toEqual({ date, time });
    }
  });

  it("returns a valid Date for a wall time skipped by spring-forward", () => {
    expect(Number.isNaN(wallClockToInstant("2026-03-29", "02:30", BRU).getTime())).toBe(false);
  });

  it("does not depend on the zone of the host", () => {
    const other = wallClockToInstant("2026-07-01", "18:00", "America/New_York");
    expect(other.toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });
});

describe("todayIn", () => {
  it("returns the local date, not the UTC date, late in the evening", () => {
    // 23:30 UTC on 30 Jun is already 1 Jul in Brussels.
    expect(todayIn(BRU, new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  it("returns the local date, not the UTC date, just after midnight UTC", () => {
    // 00:30 UTC on 1 Jul is still 30 Jun in New York.
    expect(todayIn("America/New_York", new Date("2026-07-01T00:30:00Z"))).toBe("2026-06-30");
  });
});
