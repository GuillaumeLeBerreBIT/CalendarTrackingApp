// Pure layout for our own calendar views (replaced FullCalendar, 2026-11).
// Days are YYYY-MM-DD keys; weeks start on Monday; all-day ends are inclusive.
//
// Multi-day events (a 7-day holiday) are drawn as one bar per week that spans its
// days (WeekBar, placed in lanes above the chips). Single-day events are chips.
import type { CalEvent } from '../types'
import { addDaysStr } from './allDayDates'
import { eventDays } from './calendarEvents'

export interface MonthCell {
  key: string
  day: number
  inMonth: boolean
  isWeekend: boolean
  isToday: boolean
  /** Every event covering this day (multi-day ones included), all-day first then by start */
  events: CalEvent[]
  /** Single-day chips shown on this day (multi-day events are drawn as bars instead) */
  visible: CalEvent[]
  /** Events on this day not shown, bars included */
  more: number
}

/** A multi-day event inside one week row, drawn across columns startCol…endCol. */
export interface WeekBar {
  ev: CalEvent
  /** 0 = Monday … 6 = Sunday, inside this week */
  startCol: number
  endCol: number
  /** Stacking row above the chips, 0 = top */
  lane: number
  /** The event started before this week (flat left edge) */
  continuesBefore: boolean
  /** The event ends after this week (flat right edge) */
  continuesAfter: boolean
}

export interface MonthWeek {
  /** Seven cells, Monday first */
  cells: MonthCell[]
  /** Visible bars (lane < maxLanes) */
  bars: WeekBar[]
  /** Lanes reserved above the chips on this week (highest visible lane + 1, 0 if none) */
  lanes: number
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

/**
 * month0 is 0-based (January = 0). Returns one MonthWeek per row (4–6 rows).
 * `maxChips` caps the chips per day including the lanes reserved above them;
 * `maxLanes` caps how many multi-day bars stack in a week.
 */
export function buildMonthWeeks(
  year: number,
  month0: number,
  events: CalEvent[],
  todayKey: string,
  maxChips = 3,
  maxLanes = 3,
): MonthWeek[] {
  const first = `${year}-${pad(month0 + 1)}-01`
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const lead = mondayIndex(first)
  const total = Math.ceil((lead + daysInMonth) / 7) * 7
  const start = addDaysStr(first, -lead)
  const monthPrefix = first.slice(0, 7)

  // Bucket once instead of scanning every event per cell. Multi-day events keep their covered days.
  const byDay = new Map<string, CalEvent[]>()
  const multi: { ev: CalEvent; first: string; last: string }[] = []
  const multiSet = new Set<CalEvent>()
  for (const ev of events) {
    const days = eventDays(ev)
    if (days.length > 1) {
      multi.push({ ev, first: days[0], last: days[days.length - 1] })
      multiSet.add(ev)
    }
    for (const k of days) {
      const list = byDay.get(k)
      if (list) list.push(ev)
      else byDay.set(k, [ev])
    }
  }

  return Array.from({ length: total / 7 }, (_, w) => {
    const keys = Array.from({ length: 7 }, (_, i) => addDaysStr(start, w * 7 + i))

    // Segments of multi-day events that touch this week, placed greedily into lanes.
    const segments = []
    for (const m of multi) {
      if (m.last < keys[0] || m.first > keys[6]) continue
      const startCol = keys.findIndex((k) => k >= m.first)
      let endCol = 0
      keys.forEach((k, i) => { if (k <= m.last) endCol = i })
      segments.push({
        ev: m.ev, startCol, endCol,
        continuesBefore: m.first < keys[0],
        continuesAfter: m.last > keys[6],
      })
    }
    segments.sort((a, b) =>
      a.startCol - b.startCol || b.endCol - a.endCol || String(a.ev.id).localeCompare(String(b.ev.id)))
    const laneEnds: number[] = []
    const bars: WeekBar[] = []
    for (const s of segments) {
      let lane = laneEnds.findIndex((end) => end < s.startCol)
      if (lane === -1) lane = laneEnds.push(s.endCol) - 1
      else laneEnds[lane] = s.endCol
      if (lane < maxLanes) bars.push({ ...s, lane })
    }
    const lanes = bars.length ? Math.max(...bars.map((b) => b.lane)) + 1 : 0
    const singleCap = Math.max(0, maxChips - lanes)

    const cells: MonthCell[] = keys.map((key, i) => {
      const dayEvents = (byDay.get(key) ?? []).slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      const barsHere = bars.filter((b) => b.startCol <= i && i <= b.endCol).length
      const singles = dayEvents.filter((ev) => !multiSet.has(ev))
      const visible = singles.slice(0, singleCap)
      return {
        key,
        day: Number(key.slice(8)),
        inMonth: key.startsWith(monthPrefix),
        isWeekend: i >= 5,
        isToday: key === todayKey,
        events: dayEvents,
        visible,
        more: dayEvents.length - barsHere - visible.length,
      }
    })
    return { cells, bars, lanes }
  })
}

/** Flat cells for every day of the grid (see buildMonthWeeks). */
export function buildMonthGrid(
  year: number,
  month0: number,
  events: CalEvent[],
  todayKey: string,
  maxChips = 3,
): MonthCell[] {
  return buildMonthWeeks(year, month0, events, todayKey, maxChips).flatMap((w) => w.cells)
}
