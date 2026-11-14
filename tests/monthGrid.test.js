import { describe, it, expect } from "vitest";
import { buildMonthGrid, buildMonthWeeks, weekKeys, isWeekendKey, eventsOnDay } from "../client/src/lib/monthGrid.ts";

const timed = (id, day, hhmm) => ({ id, title: id, start: `${day}T${hhmm}:00`, end: `${day}T${hhmm}:00`, allDay: false });
const allDay = (id, start, end) => ({ id, title: id, start, end, allDay: true });

describe("buildMonthGrid", () => {
  it("lays out December 2026 Monday-first in 5 rows", () => {
    const cells = buildMonthGrid(2026, 11, [], "2026-12-10");
    expect(cells).toHaveLength(35);
    expect(cells[0].key).toBe("2026-11-30");
    expect(cells[0].inMonth).toBe(false);
    expect(cells[1].key).toBe("2026-12-01");
    expect(cells[1].day).toBe(1);
    expect(cells[5].isWeekend).toBe(true);
    expect(cells[6].isWeekend).toBe(true);
    expect(cells[4].isWeekend).toBe(false);
  });

  it("uses 4 rows for February 2027 and 6 rows for March 2026", () => {
    expect(buildMonthGrid(2027, 1, [], "2027-02-01")).toHaveLength(28);
    const march = buildMonthGrid(2026, 2, [], "2026-03-01");
    expect(march).toHaveLength(42);
    expect(march[0].key).toBe("2026-02-23");
  });

  it("marks only today", () => {
    const cells = buildMonthGrid(2026, 11, [], "2026-12-10");
    expect(cells.filter((c) => c.isToday).map((c) => c.key)).toEqual(["2026-12-10"]);
  });

  it("puts a multi-day all-day event on every covered day, across the month edge", () => {
    const cells = buildMonthGrid(2026, 11, [allDay("trip", "2026-12-30", "2027-01-01")], "2026-12-01");
    const withTrip = cells.filter((c) => c.events.some((e) => e.id === "trip")).map((c) => c.key);
    expect(withTrip).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("caps visible chips and counts the rest", () => {
    const day = "2026-12-17";
    const evs = [timed("a", day, "08:00"), timed("b", day, "17:00"), timed("c", day, "18:00"), timed("d", day, "20:00")];
    const cell = buildMonthGrid(2026, 11, evs, "2026-12-01").find((c) => c.key === day);
    expect(cell.visible.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(cell.more).toBe(1);
  });
});

describe("buildMonthWeeks: multi-day bars", () => {
  it("draws a week-long holiday as one bar, not a chip per day", () => {
    // 2026-12-07 (Mon) to 2026-12-13 (Sun): one full week
    const weeks = buildMonthWeeks(2026, 11, [allDay("verlof", "2026-12-07", "2026-12-13")], "2026-12-01");
    const week = weeks[1];
    expect(week.bars.map((b) => [b.ev.id, b.startCol, b.endCol, b.lane])).toEqual([["verlof", 0, 6, 0]]);
    expect(week.lanes).toBe(1);
    expect(week.cells.every((c) => c.visible.length === 0 && c.more === 0)).toBe(true);
    expect(week.cells.every((c) => c.events.some((e) => e.id === "verlof"))).toBe(true);
  });

  it("splits a holiday across a week boundary with flat edges where it continues", () => {
    // Fri 2026-12-18 to Tue 2026-12-22 crosses Sunday → Monday
    const weeks = buildMonthWeeks(2026, 11, [allDay("trip", "2026-12-18", "2026-12-22")], "2026-12-01");
    const [wk2, wk3] = [weeks[2], weeks[3]];
    expect(wk2.bars).toMatchObject([{ startCol: 4, endCol: 6, continuesBefore: false, continuesAfter: true }]);
    expect(wk3.bars).toMatchObject([{ startCol: 0, endCol: 1, continuesBefore: true, continuesAfter: false }]);
  });

  it("stacks overlapping bars into separate lanes and keeps single days as chips", () => {
    const evs = [
      allDay("a", "2026-12-07", "2026-12-09"),
      allDay("b", "2026-12-08", "2026-12-12"),
      timed("lunch", "2026-12-08", "12:00"),
    ];
    const week = buildMonthWeeks(2026, 11, evs, "2026-12-01")[1];
    expect(week.bars.map((b) => [b.ev.id, b.lane])).toEqual([["a", 0], ["b", 1]]);
    expect(week.lanes).toBe(2);
    const tue = week.cells[1];
    expect(tue.visible.map((e) => e.id)).toEqual(["lunch"]);
    expect(tue.more).toBe(0);
  });

  it("hides bars beyond the lane cap and counts them in +N more", () => {
    const evs = [
      allDay("a", "2026-12-07", "2026-12-13"),
      allDay("b", "2026-12-07", "2026-12-13"),
      allDay("c", "2026-12-07", "2026-12-13"),
      allDay("d", "2026-12-08", "2026-12-08"),
    ];
    const week = buildMonthWeeks(2026, 11, evs, "2026-12-01", 3, 2)[1];
    expect(week.bars.map((b) => b.ev.id)).toEqual(["a", "b"]);
    expect(week.lanes).toBe(2);
    expect(week.cells[1].events.map((e) => e.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(week.cells[1].more).toBe(1);
    expect(week.cells[0].more).toBe(1);
  });
});

describe("eventsOnDay", () => {
  it("sorts all-day first, then by start time", () => {
    const day = "2026-12-24";
    const out = eventsOnDay([timed("dinner", day, "18:00"), allDay("closed", day, day), timed("swim", day, "09:00")], day);
    expect(out.map((e) => e.id)).toEqual(["closed", "swim", "dinner"]);
  });
});

describe("weekKeys / isWeekendKey", () => {
  it("returns Monday to Sunday around a date", () => {
    expect(weekKeys("2026-12-24")).toEqual([
      "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27",
    ]);
    expect(weekKeys("2026-12-27")[0]).toBe("2026-12-21");
    expect(weekKeys("2026-12-21")[0]).toBe("2026-12-21");
  });
  it("knows Saturday and Sunday", () => {
    expect(isWeekendKey("2026-12-26")).toBe(true);
    expect(isWeekendKey("2026-12-27")).toBe(true);
    expect(isWeekendKey("2026-12-25")).toBe(false);
  });
});
