// Pure layout for our own calendar views (replaced FullCalendar, 2026-11).
// Days are YYYY-MM-DD keys; weeks start on Monday; all-day ends are inclusive.
import type { CalEvent } from '../types'
import { addDaysStr } from './allDayDates'
import { eventDays } from './calendarEvents'

export interface MonthCell {
  key: string
  day: number
  inMonth: boolean
  isWeekend: boolean
  isToday: boolean
  /** Every event on this day, all-day first then by start */
  events: CalEvent[]
  /** The first `maxChips` of `events` */
  visible: CalEvent[]
  /** How many did not fit */
  more: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 0 = Monday … 6 = Sunday */
function mondayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function isWeekendKey(key: string): boolean {
  return mondayIndex(key) >= 5
}

export function weekKeys(key: string): string[] {
  const monday = addDaysStr(key, -mondayIndex(key))
  return Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i))
}

function sortKey(ev: CalEvent): string {
  return ev.allDay ? '0' : '1' + (ev.start.split('T')[1] ?? '')
}

export function eventsOnDay(events: CalEvent[], key: string): CalEvent[] {
  return events
    .filter((ev) => eventDays(ev).includes(key))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
}

/** month0 is 0-based (January = 0). Returns 7 × rows cells (4–6 rows). */
export function buildMonthGrid(
  year: number,
  month0: number,
  events: CalEvent[],
  todayKey: string,
  maxChips = 3,
): MonthCell[] {
  const first = `${year}-${pad(month0 + 1)}-01`
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const lead = mondayIndex(first)
  const total = Math.ceil((lead + daysInMonth) / 7) * 7
  const start = addDaysStr(first, -lead)
  const monthPrefix = first.slice(0, 7)

  // Bucket once instead of scanning every event per cell.
  const byDay = new Map<string, CalEvent[]>()
  for (const ev of events) {
    for (const k of eventDays(ev)) {
      const list = byDay.get(k)
      if (list) list.push(ev)
      else byDay.set(k, [ev])
    }
  }

  return Array.from({ length: total }, (_, i) => {
    const key = addDaysStr(start, i)
    const dayEvents = (byDay.get(key) ?? []).slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    return {
      key,
      day: Number(key.slice(8)),
      inMonth: key.startsWith(monthPrefix),
      isWeekend: i % 7 >= 5,
      isToday: key === todayKey,
      events: dayEvents,
      visible: dayEvents.slice(0, maxChips),
      more: Math.max(0, dayEvents.length - maxChips),
    }
  })
}
