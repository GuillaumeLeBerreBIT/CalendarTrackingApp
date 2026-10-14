export type RepeatFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type EndMode = 'never' | 'on' | 'after'

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export const WEEKDAY_LABEL: Record<string, string> = {
  MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S', SU: 'S',
}

export interface RecurrenceState {
  repeat: RepeatFreq
  interval: number
  weekdays: string[]
  endMode: EndMode
  endDate: string // YYYY-MM-DD
  count: number
}

export const defaultRecurrence: RecurrenceState = {
  repeat: 'none',
  interval: 1,
  weekdays: [],
  endMode: 'never',
  endDate: '',
  count: 10,
}

/** Build an RFC-5545 RRULE string (without DTSTART) from editor state, or null. */
export function buildRRule(r: RecurrenceState): string | null {
  if (r.repeat === 'none') return null
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.repeat]
  const parts = [`FREQ=${freq}`]
  if (r.interval && r.interval > 1) parts.push(`INTERVAL=${r.interval}`)
  if (r.repeat === 'weekly' && r.weekdays.length) parts.push(`BYDAY=${r.weekdays.join(',')}`)
  if (r.endMode === 'after' && r.count > 0) parts.push(`COUNT=${r.count}`)
  // UNTIL is inclusive: end of the chosen day, so a timed occurrence on it is kept.
  if (r.endMode === 'on' && r.endDate) parts.push(`UNTIL=${r.endDate.replace(/-/g, '')}T235959Z`)
  return parts.join(';')
}

/** Parse an RRULE string back into editor state. */
export function parseRRule(rule?: string | null): RecurrenceState {
  if (!rule) return { ...defaultRecurrence }
  const map: Record<string, string> = {}
  rule.split(';').forEach((p) => {
    const [k, v] = p.split('=')
    if (k) map[k.toUpperCase()] = v
  })
  const freqMap: Record<string, RepeatFreq> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }
  const repeat = freqMap[map.FREQ] || 'none'
  const interval = map.INTERVAL ? parseInt(map.INTERVAL, 10) : 1
  const weekdays = map.BYDAY ? map.BYDAY.split(',') : []
  let endMode: EndMode = 'never'
  let endDate = ''
  let count = 10
  if (map.COUNT) {
    endMode = 'after'
    count = parseInt(map.COUNT, 10) || 10
  } else if (map.UNTIL) {
    endMode = 'on'
    const u = map.UNTIL
    endDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`
  }
  return { repeat, interval, weekdays, endMode, endDate, count }
}

const ruleParts = (rule: string) =>
  rule.split(';').filter(p => p && !/^WKST=MO$/i.test(p)).map(p => p.toUpperCase()).sort().join(';')

/**
 * Can the editor show this rule without losing anything? Rules imported from
 * other calendars may use parts it has no controls for (BYMONTHDAY, BYDAY=2TU…).
 */
export function isFullyEditable(rule?: string | null): boolean {
  if (!rule) return true
  const rebuilt = buildRRule(parseRRule(rule))
  if (!rebuilt) return false
  // parseRRule reads only the date of UNTIL; compare UNTIL by day.
  const day = (r: string) => r.replace(/(UNTIL=\d{8})T\d{6}Z?/i, '$1')
  return ruleParts(day(rule)) === ruleParts(day(rebuilt))
}

/**
 * The rule to send on save: the original, untouched, unless the user changed
 * the repeat settings — so a rule the editor cannot represent survives an edit.
 */
export function ruleToSave(original: string | null | undefined, initial: RecurrenceState, current: RecurrenceState): string | null {
  const changed = JSON.stringify(initial) !== JSON.stringify(current)
  return changed ? buildRRule(current) : (original ?? null)
}

/** Human-readable summary for the editor. */
export function summarize(r: RecurrenceState): string {
  if (r.repeat === 'none') return 'Does not repeat'
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.repeat]
  const every = r.interval > 1 ? `every ${r.interval} ${unit}s` : `${unit}ly`
  let s = `Repeats ${every}`
  if (r.repeat === 'weekly' && r.weekdays.length) s += ` on ${r.weekdays.join(', ')}`
  if (r.endMode === 'after') s += `, ${r.count}×`
  if (r.endMode === 'on' && r.endDate) s += `, until ${r.endDate}`
  return s
}
