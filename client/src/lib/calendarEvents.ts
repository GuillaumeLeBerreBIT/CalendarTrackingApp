// Calendar event shapes, in one place.
//
// App state holds events in Eventli's convention: `allDay` is explicit and an
// all-day `end` is INCLUSIVE. FullCalendar wants an EXCLUSIVE all-day end, so
// toFullCalendarEvents() is applied only to the array handed to <FullCalendar>
// — never to state, the agenda, the mobile grid, or the edit form.
import type { CalEvent } from '../types'
import { addDaysStr, toCalendarAllDayEnd } from './allDayDates'

/** API → app state. renderEvents sends no allDay; a date-only start means all-day. */
export function normalizeApiEvent(ev: CalEvent): CalEvent {
  return { ...ev, allDay: !ev.start.includes('T') }
}

/** App state → FullCalendar input. Returns new objects; input is not modified. */
export function toFullCalendarEvents(events: CalEvent[]): CalEvent[] {
  return events.map((ev) => (ev.allDay ? { ...ev, end: toCalendarAllDayEnd(ev.end) } : ev))
}

/** Every YYYY-MM-DD the event covers, start to inclusive end, at most maxDays. */
export function eventDays(ev: CalEvent, maxDays = 366): string[] {
  const start = ev.start.split('T')[0]
  const end = (ev.end ?? ev.start).split('T')[0]
  const days: string[] = []
  for (let d = start; d <= end && days.length < maxDays; d = addDaysStr(d, 1)) days.push(d)
  return days.length ? days : [start]
}

/** Agenda bucket: the start day, today for an event in progress, null once finished. */
export function agendaDayKey(ev: CalEvent, todayKey: string): string | null {
  const start = ev.start.split('T')[0]
  const end = (ev.end ?? ev.start).split('T')[0]
  if (end < todayKey) return null
  return start < todayKey ? todayKey : start
}
