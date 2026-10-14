import { describe, it, expect } from "vitest";
import { normalizeApiEvent, toFullCalendarEvents, eventDays, agendaDayKey } from "../client/src/lib/calendarEvents.ts";

const ev = (start, end) => ({ id: "1", title: "t", start, end });

describe("normalizeApiEvent", () => {
  it("marks date-only events all-day and keeps the inclusive end", () => {
    expect(normalizeApiEvent(ev("2026-10-13", "2026-10-13"))).toMatchObject({ allDay: true, end: "2026-10-13" });
  });
  it("marks timed events not all-day", () => {
    expect(normalizeApiEvent(ev("2026-10-13T10:00", "2026-10-13T11:00")).allDay).toBe(false);
  });
});

describe("toFullCalendarEvents", () => {
  it("makes all-day ends exclusive without touching app state (agenda/edit regression)", () => {
    const state = [normalizeApiEvent(ev("2026-12-31", "2026-12-31")), normalizeApiEvent(ev("2026-10-14T10:00", "2026-10-14T11:00"))];
    const fc = toFullCalendarEvents(state);
    expect(fc[0].end).toBe("2027-01-01");
    expect(fc[1].end).toBe("2026-10-14T11:00");
    expect(state[0].end).toBe("2026-12-31"); // what the agenda and edit form see
  });
  it("leap day", () => {
    expect(toFullCalendarEvents([normalizeApiEvent(ev("2028-02-29", "2028-02-29"))])[0].end).toBe("2028-03-01");
  });
});

describe("eventDays", () => {
  it("month boundary", () => {
    expect(eventDays(ev("2026-10-30", "2026-11-02"))).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("year boundary", () => {
    expect(eventDays(ev("2026-12-30", "2027-01-02"))).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
  it("leap day", () => {
    expect(eventDays(ev("2028-02-28", "2028-03-01"))).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
  it("no end, and timed same-day", () => {
    expect(eventDays(ev("2026-10-06"))).toEqual(["2026-10-06"]);
    expect(eventDays(ev("2026-10-14T10:00", "2026-10-14T11:00"))).toEqual(["2026-10-14"]);
  });
  it("is capped", () => {
    expect(eventDays(ev("2026-01-01", "2030-01-01"), 10)).toHaveLength(10);
  });
});

describe("agendaDayKey", () => {
  const today = "2026-10-14";
  it("upcoming event goes under its start day", () => {
    expect(agendaDayKey(ev("2026-10-20", "2026-10-22"), today)).toBe("2026-10-20");
  });
  it("event in progress goes under today", () => {
    expect(agendaDayKey(ev("2026-10-12", "2026-10-16"), today)).toBe(today);
  });
  it("finished event is dropped", () => {
    expect(agendaDayKey(ev("2026-10-10", "2026-10-13"), today)).toBeNull();
  });
});
