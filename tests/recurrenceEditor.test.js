import { describe, it, expect } from "vitest";
import { parseRRule, buildRRule, ruleToSave, isFullyEditable } from "../client/src/lib/recurrence.ts";
import { expandRecurringEvent, sameRule } from "../utils/recurrence.js";

const win = [new Date("2027-01-01T00:00:00Z"), new Date("2027-12-31T00:00:00Z")];
const days = (ev) => expandRecurringEvent(ev, ...win, []).map((o) => o.start_date);

describe("'Ends on' includes the chosen day", () => {
  const rule = buildRRule({ ...parseRRule("FREQ=WEEKLY"), endMode: "on", endDate: "2027-03-15" });
  const base = { event_id: 1, event_title: "x", start_date: "2027-03-01", end_date: "2027-03-01", profiles_events: [], recurrence_rule: rule };
  it("timed series", () => {
    expect(days({ ...base, all_day: false, start_time: "09:00:00", end_time: "10:00:00" })).toEqual(["2027-03-01", "2027-03-08", "2027-03-15"]);
  });
  it("all-day series", () => {
    expect(days({ ...base, all_day: true, start_time: null, end_time: null })).toEqual(["2027-03-01", "2027-03-08", "2027-03-15"]);
  });
  it("round-trips the end date", () => {
    expect(parseRRule(rule).endDate).toBe("2027-03-15");
  });
});

describe("yearly rules", () => {
  it("are editable and round-trip", () => {
    expect(parseRRule("FREQ=YEARLY").repeat).toBe("yearly");
    expect(buildRRule(parseRRule("FREQ=YEARLY;COUNT=3"))).toBe("FREQ=YEARLY;COUNT=3");
  });
});

describe("rules the editor cannot represent", () => {
  it("are detected", () => {
    expect(isFullyEditable("FREQ=MONTHLY;BYDAY=2TU")).toBe(false);
    expect(isFullyEditable("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=10")).toBe(false);
    expect(isFullyEditable("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4")).toBe(true);
    expect(isFullyEditable(null)).toBe(true);
  });
  it("are saved unchanged when the user does not touch the repeat settings", () => {
    const original = "FREQ=MONTHLY;BYDAY=2TU";
    const initial = parseRRule(original);
    expect(ruleToSave(original, initial, { ...initial })).toBe(original);
  });
  it("are replaced when the user changes the repeat settings", () => {
    const original = "FREQ=MONTHLY;BYDAY=2TU";
    const initial = parseRRule(original);
    expect(ruleToSave(original, initial, { ...initial, interval: 2 })).toBe("FREQ=MONTHLY;INTERVAL=2");
  });
  it("new events build from the editor", () => {
    const initial = parseRRule(null);
    expect(ruleToSave(null, initial, { ...initial, repeat: "daily" })).toBe("FREQ=DAILY");
    expect(ruleToSave(null, initial, initial)).toBeNull();
  });
});

describe("sameRule (server: was the rule edited?)", () => {
  it("ignores part order and the default week start", () => {
    expect(sameRule("FREQ=WEEKLY;BYDAY=MO;COUNT=4", "FREQ=WEEKLY;COUNT=4;BYDAY=MO")).toBe(true);
    expect(sameRule("FREQ=WEEKLY;WKST=MO;BYDAY=MO;COUNT=4", "FREQ=WEEKLY;BYDAY=MO;COUNT=4")).toBe(true);
  });
  it("detects real changes", () => {
    expect(sameRule("FREQ=WEEKLY;COUNT=4", "FREQ=WEEKLY;COUNT=5")).toBe(false);
    expect(sameRule("FREQ=WEEKLY", null)).toBe(false);
  });
});
