// Pure mapping from a node-ical VEVENT to an `events` row.
//
// node-ical builds VALUE=DATE values and floating times (no TZID, no Z) at
// SERVER-LOCAL time; zoned and UTC times are real instants and carry `.tz`.
// So: local getters recover what the file said for the first kind, and the
// user's timezone gives the wall clock for the second.
import { addDaysStr } from "./recurrence.js";
import { toWallClock } from "./wallClock.js";

export const MAX_IMPORT_EVENTS = 500;

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function wallClock(d, userTz) {
  if (!d.tz) return { date: localDate(d), time: localTime(d) };
  const w = toWallClock(d, userTz);
  return { date: w.date, time: w.time.slice(0, 5) };
}

const asDate = (v) => (v instanceof Date ? v : new Date(v));

export function rruleFromIcs(vevent) {
  if (!vevent.rrule) return null;
  const line = String(vevent.rrule.toString()).split("\n").find((l) => l.startsWith("RRULE:"));
  return line ? line.slice("RRULE:".length) : null;
}

export function icsEventToRow(vevent, userTz) {
  if (!vevent?.summary || !vevent.start) return null;
  const start = asDate(vevent.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = vevent.end ? asDate(vevent.end) : null;
  const recurrence_rule = rruleFromIcs(vevent);

  if (vevent.datetype === "date") {
    const startDate = localDate(start);
    const rawEnd = end ? localDate(end) : startDate; // RFC 5545: exclusive
    return {
      all_day: true,
      start_date: startDate,
      end_date: rawEnd > startDate ? addDaysStr(rawEnd, -1) : startDate,
      start_time: null,
      end_time: null,
      recurrence_rule,
    };
  }

  const s = wallClock(start, userTz);
  // node-ical fills a missing DTEND with DTSTART; a zero-length event has no end time.
  const e = end && end.getTime() !== start.getTime() ? wallClock(end, userTz) : null;
  return {
    all_day: false,
    start_date: s.date,
    end_date: e ? e.date : s.date,
    start_time: s.time,
    end_time: e ? e.time : null,
    recurrence_rule,
  };
}
