import { describe, it, expect } from "vitest";
import { expandRecurringEvent, capRuleUntil, followingRule, expansionWindow } from "../utils/recurrence.js";

const win = [new Date("2027-01-01T00:00:00Z"), new Date("2027-12-31T00:00:00Z")];
const days = (ev) => expandRecurringEvent(ev, ...win, []).map((o) => o.start_date);
const base = { event_id: 1, event_title: "x", start_date: "2027-03-01", end_date: "2027-03-01", profiles_events: [] };
const allDay = { ...base, all_day: true, start_time: null, end_time: null };
const at9 = { ...base, all_day: false, start_time: "09:00:00", end_time: "10:00:00" };
const at0 = { ...base, all_day: false, start_time: "00:00:00", end_time: "01:00:00" };

describe("capRuleUntil ends the series the day before the split", () => {
  for (const [name, ev] of [["all-day", allDay], ["timed 09:00", at9], ["timed 00:00", at0]]) {
    it(name, () => {
      expect(days({ ...ev, recurrence_rule: capRuleUntil("FREQ=WEEKLY", "2027-03-15") }))
        .toEqual(["2027-03-01", "2027-03-08"]);
    });
  }
  it("splitting on the first occurrence leaves the old master empty", () => {
    expect(days({ ...allDay, recurrence_rule: capRuleUntil("FREQ=WEEKLY", "2027-03-01") })).toEqual([]);
  });
  it("replaces an existing COUNT", () => {
    expect(capRuleUntil("FREQ=WEEKLY;COUNT=10", "2027-03-15")).toBe("FREQ=WEEKLY;UNTIL=20270314T235959Z");
  });
});

describe("followingRule keeps the series length", () => {
  it("COUNT is reduced by the occurrences before the split", () => {
    const ev = { ...at9, recurrence_rule: "FREQ=WEEKLY;COUNT=4" };
    const next = followingRule(ev, "2027-03-15");
    expect(next).toBe("FREQ=WEEKLY;COUNT=2");
    const before = days({ ...ev, recurrence_rule: capRuleUntil(ev.recurrence_rule, "2027-03-15") });
    const after = days({ ...ev, start_date: "2027-03-15", end_date: "2027-03-15", recurrence_rule: next });
    expect([...before, ...after]).toEqual(["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22"]);
  });
  it("works for all-day series", () => {
    expect(followingRule({ ...allDay, recurrence_rule: "FREQ=WEEKLY;COUNT=4" }, "2027-03-15")).toBe("FREQ=WEEKLY;COUNT=2");
  });
  it("a rule without COUNT is returned unchanged", () => {
    expect(followingRule({ ...at9, recurrence_rule: "FREQ=DAILY;INTERVAL=2" }, "2027-03-15")).toBe("FREQ=DAILY;INTERVAL=2");
  });
  it("null when nothing remains", () => {
    expect(followingRule({ ...at9, recurrence_rule: "FREQ=WEEKLY;COUNT=2" }, "2027-04-01")).toBeNull();
  });
});

describe("expansionWindow", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  it("defaults to 60 days back and 365 ahead", () => {
    const { windowStart, windowEnd } = expansionWindow({}, now);
    expect(windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(windowEnd.toISOString().slice(0, 10)).toBe("2027-10-14");
  });
  it("uses from/to when valid", () => {
    const { windowStart, windowEnd } = expansionWindow({ from: "2028-01-25", to: "2028-03-14" }, now);
    expect(windowStart.toISOString()).toBe("2028-01-25T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2028-03-14T23:59:59.000Z");
  });
  it("ignores malformed or inverted ranges and caps the span at two years", () => {
    expect(expansionWindow({ from: "x", to: "2026-01-01" }, now).windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(expansionWindow({ from: "2027-01-01", to: "2026-01-01" }, now).windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    const wide = expansionWindow({ from: "2020-01-01", to: "2030-01-01" }, now);
    expect((wide.windowEnd - wide.windowStart) / 864e5).toBeLessThanOrEqual(731);
  });
});
