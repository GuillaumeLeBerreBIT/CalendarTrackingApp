import { describe, it, expect } from "vitest";
import {
  nextDateOnOrAfter, endDateForPreset, routineRule, routinePayload, isSimpleRoutine, describeRoutine, localToday,
} from "../client/src/lib/routines.ts";
import { expandRecurringEvent } from "../utils/recurrence.js";

describe("nextDateOnOrAfter", () => {
  it("returns the date itself when it is already a chosen weekday", () => {
    expect(nextDateOnOrAfter("2026-10-29", ["TH"])).toBe("2026-10-29"); // a Thursday
  });
  it("finds the next chosen weekday", () => {
    expect(nextDateOnOrAfter("2026-10-29", ["MO", "TU"])).toBe("2026-11-02");
    expect(nextDateOnOrAfter("2026-10-29", ["SA", "WE"])).toBe("2026-10-31");
  });
  it("crosses a year end", () => {
    expect(nextDateOnOrAfter("2026-12-31", ["MO"])).toBe("2027-01-04");
  });
});

describe("endDateForPreset", () => {
  it("ends the day before the same date N months later", () => {
    expect(endDateForPreset("2026-11-02", "3m")).toBe("2027-02-01");
    expect(endDateForPreset("2026-11-02", "12m")).toBe("2027-11-01");
  });
  it("clamps to the end of a shorter month", () => {
    expect(endDateForPreset("2026-11-30", "3m")).toBe("2027-02-27");
    expect(endDateForPreset("2026-08-31", "6m")).toBe("2027-02-27");
  });
  it("has no end for 'never'", () => {
    expect(endDateForPreset("2026-11-02", "never")).toBeNull();
  });
});

describe("routinePayload", () => {
  const draft = { title: " Swim ", weekdays: ["MO", "TU"], startTime: "19:00", endTime: "20:00", end: "12m", reminderMinutes: 30 };

  it("builds a weekly rule that ends on the preset date", () => {
    const p = routinePayload(draft, "2026-11-02");
    expect(p).toMatchObject({
      "calendar-title": "Swim", allDay: false, startDate: "2026-11-02", endDate: "2026-11-02",
      startTime: "19:00", endTime: "20:00", reminder_minutes: 30, status: "confirmed",
      recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20271101T235959Z",
    });
  });

  it("the rule really yields only the chosen weekdays, for a year", () => {
    const rule = routinePayload(draft, "2026-11-02").recurrence_rule;
    const ev = { event_id: 1, event_title: "Swim", start_date: "2026-11-02", end_date: "2026-11-02", start_time: "19:00:00", all_day: false, recurrence_rule: rule };
    const days = expandRecurringEvent(ev, new Date("2026-11-01T00:00:00Z"), new Date("2028-01-01T00:00:00Z"), []).map((o) => o.start_date);
    expect(days[0]).toBe("2026-11-02");
    expect(days[days.length - 1]).toBe("2027-11-01"); // the final Monday, UNTIL is inclusive
    expect(days.length).toBe(105); // 53 Mondays + 52 Tuesdays
    expect(days.every((d) => [1, 2].includes(new Date(d + "T00:00:00Z").getUTCDay()))).toBe(true);
  });

  it("is all-day without a start time", () => {
    expect(routinePayload({ ...draft, startTime: "", endTime: "" }, "2026-11-02")).toMatchObject({ allDay: true, startTime: "", endTime: "" });
  });

  it("an open-ended routine has no UNTIL", () => {
    expect(routineRule(["WE", "SA"], null)).toBe("FREQ=WEEKLY;BYDAY=WE,SA");
  });
});

describe("isSimpleRoutine / describeRoutine", () => {
  it("accepts plain weekly rules the sheet can round-trip", () => {
    expect(isSimpleRoutine("FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20271101T235959Z")).toBe(true);
    expect(isSimpleRoutine("FREQ=WEEKLY;BYDAY=WE,SA")).toBe(true);
  });
  it("rejects rules it would change", () => {
    expect(isSimpleRoutine("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")).toBe(false);
    expect(isSimpleRoutine("FREQ=MONTHLY;BYDAY=2TU")).toBe(false);
    expect(isSimpleRoutine("FREQ=DAILY")).toBe(false);
    expect(isSimpleRoutine("FREQ=WEEKLY")).toBe(false); // no weekday chosen
  });
  it("describes days and end", () => {
    expect(describeRoutine("FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20271101T235959Z")).toBe("Mon · Tue, until 1 Nov 2027");
    expect(describeRoutine("FREQ=WEEKLY;BYDAY=WE,SA")).toBe("Wed · Sat");
  });
});

describe("localToday", () => {
  it("uses local date parts", () => {
    expect(localToday(new Date(2026, 9, 29, 23, 30))).toBe("2026-10-29");
  });
});
