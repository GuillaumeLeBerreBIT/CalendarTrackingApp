// Read side of "routines": a routine is just a personal recurring event, so this
// only derives what the list needs (the next session, whether the series is over).
import { expandRecurringEvent, addDaysStr } from "./recurrence.js";
import { eventTimeZone } from "./eventTimeZone.js";
import { todayIn, wallClockToInstant } from "./wallClock.js";

const LOOKAHEAD_DAYS = 400; // a yearly routine is still found; weekly ones need ~7

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/**
 * The first not-yet-started, not-cancelled session of a recurring event, as
 * { date, time } (wall clock in the event's zone), or null if the series is over.
 */
export function nextOccurrence(event, overrides = [], now = new Date()) {
  const tz = eventTimeZone(event);
  const today = todayIn(tz, now);
  const windowStart = new Date(`${today}T00:00:00Z`);
  const windowEnd = new Date(`${addDaysStr(today, LOOKAHEAD_DAYS)}T23:59:59Z`);

  const sessions = expandRecurringEvent(event, windowStart, windowEnd, overrides);
  for (const s of sessions) {
    const start = wallClockToInstant(s.start_date, s.all_day ? null : s.start_time, tz);
    // All-day sessions count until the day is over; timed ones until they start.
    const cutoff = s.all_day ? wallClockToInstant(addDaysStr(s.start_date, 1), null, tz) : start;
    if (cutoff > now) return { date: s.start_date, time: s.all_day ? null : hhmm(s.start_time) };
  }
  return null;
}

export function routineView(event, overrides = [], now = new Date()) {
  const next = nextOccurrence(event, overrides, now);
  return {
    eventId: event.event_id,
    title: event.event_title,
    rule: event.recurrence_rule,
    startDate: event.start_date,
    startTime: hhmm(event.start_time),
    endTime: hhmm(event.end_time),
    allDay: !!event.all_day,
    reminderMinutes: event.reminder_minutes ?? null,
    timezone: eventTimeZone(event),
    next,
    ended: next === null,
  };
}
