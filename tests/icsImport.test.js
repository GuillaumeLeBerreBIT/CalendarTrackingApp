import { describe, it, expect } from "vitest";
import ical from "node-ical";
import { icsEventToRow, rruleFromIcs } from "../utils/icsImport.js";

const vevent = (...props) =>
  Object.values(
    ical.parseICS(["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:x", "SUMMARY:t", ...props, "END:VEVENT", "END:VCALENDAR"].join("\r\n"))
  ).find((e) => e.type === "VEVENT");

describe("all-day events (DTEND is exclusive, stored end is inclusive)", () => {
  it("single day", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270311"), "UTC"))
      .toMatchObject({ all_day: true, start_date: "2027-03-10", end_date: "2027-03-10", start_time: null, end_time: null });
  });
  it("three days", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270313"), "UTC"))
      .toMatchObject({ start_date: "2027-03-10", end_date: "2027-03-12" });
  });
  it("across a year boundary", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20271231", "DTEND;VALUE=DATE:20280102"), "UTC"))
      .toMatchObject({ start_date: "2027-12-31", end_date: "2028-01-01" });
  });
  it("no DTEND means one day", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20280229"), "UTC"))
      .toMatchObject({ start_date: "2028-02-29", end_date: "2028-02-29" });
  });
  it("DTEND equal to DTSTART never yields an end before the start", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270310"), "UTC"))
      .toMatchObject({ start_date: "2027-03-10", end_date: "2027-03-10" });
  });
});

describe("timed events are stored as wall-clock time in the user's timezone", () => {
  const brussels = ["DTSTART;TZID=Europe/Brussels:20270310T140000", "DTEND;TZID=Europe/Brussels:20270310T150000"];
  it("zoned event, user in the same zone", () => {
    expect(icsEventToRow(vevent(...brussels), "Europe/Brussels"))
      .toMatchObject({ all_day: false, start_date: "2027-03-10", start_time: "14:00", end_time: "15:00" });
  });
  it("zoned event, user in New York (EST on 2027-03-10)", () => {
    expect(icsEventToRow(vevent(...brussels), "America/New_York"))
      .toMatchObject({ start_date: "2027-03-10", start_time: "08:00", end_time: "09:00" });
  });
  it("UTC event shown in Brussels", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000Z", "DTEND:20270310T150000Z"), "Europe/Brussels"))
      .toMatchObject({ start_time: "15:00", end_time: "16:00" });
  });
  it("user without a stored timezone falls back to UTC", () => {
    expect(icsEventToRow(vevent(...brussels), "UTC")).toMatchObject({ start_time: "13:00" });
  });
  it("floating time keeps its written clock time whatever the server TZ", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000", "DTEND:20270310T150000"), "America/New_York"))
      .toMatchObject({ start_date: "2027-03-10", start_time: "14:00", end_time: "15:00" });
  });
  it("no DTEND leaves end_time null", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000Z"), "UTC"))
      .toMatchObject({ start_time: "14:00", end_date: "2027-03-10", end_time: null });
  });
});

describe("recurrence and rejects", () => {
  it("keeps the RRULE without its prefix", () => {
    const e = vevent("DTSTART;VALUE=DATE:20270310", "RRULE:FREQ=WEEKLY;COUNT=5");
    expect(rruleFromIcs(e)).toBe("FREQ=WEEKLY;COUNT=5");
    expect(icsEventToRow(e, "UTC").recurrence_rule).toBe("FREQ=WEEKLY;COUNT=5");
  });
  it("non-recurring event has a null rule", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310"), "UTC").recurrence_rule).toBeNull();
  });
  it("missing SUMMARY is rejected", () => {
    const e = vevent("DTSTART;VALUE=DATE:20270310");
    delete e.summary;
    expect(icsEventToRow(e, "UTC")).toBeNull();
  });
});
