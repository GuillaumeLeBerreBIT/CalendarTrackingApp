import { buildRRule, parseRRule, isFullyEditable } from './recurrence'

// A routine is a personal weekly-repeating event: "swim, Mon + Tue, 19:00".
// These helpers turn the quick-create form into the same payload the event
// form sends, so routines are ordinary recurring events underneath.

export const ROUTINE_DAYS = [
  { code: 'MO', short: 'Mon', long: 'Monday' },
  { code: 'TU', short: 'Tue', long: 'Tuesday' },
  { code: 'WE', short: 'Wed', long: 'Wednesday' },
  { code: 'TH', short: 'Thu', long: 'Thursday' },
  { code: 'FR', short: 'Fri', long: 'Friday' },
  { code: 'SA', short: 'Sat', long: 'Saturday' },
  { code: 'SU', short: 'Sun', long: 'Sunday' },
] as const

export type EndPreset = '3m' | '6m' | '12m' | 'never'
export const END_PRESETS: { value: EndPreset; label: string }[] = [
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '1 year' },
  { value: 'never', label: 'No end' },
]

export interface RoutineDraft {
  title: string
  weekdays: string[]
  startTime: string // HH:MM, '' = all day
  endTime: string
  end: EndPreset
  reminderMinutes: number | null
}

const JS_DAY_TO_CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

const toUtc = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
const fmt = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** Today in the browser's zone as YYYY-MM-DD (never the UTC date). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** The first date on or after `from` that falls on one of `weekdays`. */
export function nextDateOnOrAfter(from: string, weekdays: string[]): string {
  if (weekdays.length === 0) return from
  const d = toUtc(from)
  for (let i = 0; i < 7; i++) {
    if (weekdays.includes(JS_DAY_TO_CODE[d.getUTCDay()])) return fmt(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return from
}

/** Last day of a routine that runs for the preset from `startDate` (null = open-ended). */
export function endDateForPreset(startDate: string, preset: EndPreset): string | null {
  if (preset === 'never') return null
  const months = { '3m': 3, '6m': 6, '12m': 12 }[preset]
  const d = toUtc(startDate)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  // Clamp (31 Jan + 1 month must not spill into March), then end the day before.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  d.setUTCDate(d.getUTCDate() - 1)
  return fmt(d)
}

export function routineRule(weekdays: string[], endDate: string | null): string | null {
  return buildRRule({
    repeat: 'weekly', interval: 1, weekdays,
    endMode: endDate ? 'on' : 'never', endDate: endDate ?? '', count: 10,
  })
}

export interface PayloadOptions {
  /** Date the end preset is counted from (default: startDate). Editing counts from today. */
  endFrom?: string
  /** Use this exact last day (or null for open-ended) instead of the draft's preset. */
  endDate?: string | null
}

/** Body for POST /parseEvent (create) or PUT /parseEvent/:id (edit, scope 'all'). */
export function routinePayload(draft: RoutineDraft, startDate: string, opts: PayloadOptions = {}): Record<string, unknown> {
  const allDay = !draft.startTime
  const endDate = 'endDate' in opts ? opts.endDate ?? null : endDateForPreset(opts.endFrom ?? startDate, draft.end)
  return {
    'calendar-title': draft.title.trim(),
    'calendar-description': '',
    location: null,
    image_url: null,
    allDay,
    startDate,
    endDate: startDate,
    startTime: allDay ? '' : draft.startTime,
    endTime: allDay ? '' : draft.endTime,
    recurrence_rule: routineRule(draft.weekdays, endDate),
    reminder_minutes: draft.reminderMinutes,
    status: 'confirmed',
  }
}

/** Can the quick sheet edit this rule without losing anything (plain weekly, every week)? */
export function isSimpleRoutine(rule: string): boolean {
  const r = parseRRule(rule)
  return isFullyEditable(rule) && r.repeat === 'weekly' && r.interval === 1 && r.endMode !== 'after' && r.weekdays.length > 0
}

/** "Mon · Tue" or "Mon · Tue, until 29 Oct 2027". */
export function describeRoutine(rule: string): string {
  const r = parseRRule(rule)
  const days = (r.weekdays.length ? r.weekdays : [])
    .map((c) => ROUTINE_DAYS.find((d) => d.code === c)?.short ?? c)
    .join(' · ')
  const base = days || 'Weekly'
  if (r.endMode === 'on' && r.endDate) return `${base}, until ${formatDay(r.endDate)}`
  if (r.endMode === 'after') return `${base}, ${r.count} times`
  return base
}

export function formatDay(date: string): string {
  return toUtc(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
