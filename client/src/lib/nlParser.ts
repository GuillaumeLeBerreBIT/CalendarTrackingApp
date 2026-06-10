export interface ParsedEvent {
  title: string
  date?: string     // YYYY-MM-DD
  time?: string     // HH:MM
  location?: string
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nextWeekday(weekday: number): string {
  const today = new Date()
  const todayDay = today.getDay()
  let diff = weekday - todayDay
  if (diff <= 0) diff += 7
  const result = new Date(today)
  result.setDate(today.getDate() + diff)
  return toYMD(result)
}

function parseTime(raw: string): string | undefined {
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return undefined
  let h = parseInt(m[1])
  const min = m[2] ? parseInt(m[2]) : 0
  const meridiem = (m[3] || '').toLowerCase()
  if (meridiem === 'pm' && h < 12) h += 12
  if (meridiem === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function parseNL(input: string): ParsedEvent {
  let text = input.trim()
  let date: string | undefined
  let time: string | undefined
  let location: string | undefined

  // Extract location: "at <place>" at end of string
  const atMatch = text.match(/\bat\s+([a-z0-9''\-\s]+?)(?:\s+(?:on|this|next|at|\d)|$)/i)
  if (atMatch) {
    const candidate = atMatch[1].trim()
    // Only treat as location if it doesn't look like a time ("at 7pm" → time, not location)
    if (!/^\d/.test(candidate)) {
      location = candidate
      text = text.replace(atMatch[0], ' ').trim()
    }
  }

  // Extract time: "7pm", "19:00", "7:30am"
  const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{2}:\d{2})\b/i)
  if (timeMatch) {
    time = parseTime(timeMatch[0])
    text = text.replace(timeMatch[0], ' ').trim()
  }

  // Extract date
  const today = new Date()
  if (/\btoday\b/i.test(text)) {
    date = toYMD(today)
    text = text.replace(/\btoday\b/i, ' ').trim()
  } else if (/\btomorrow\b/i.test(text)) {
    const t = new Date(today); t.setDate(t.getDate() + 1)
    date = toYMD(t)
    text = text.replace(/\btomorrow\b/i, ' ').trim()
  } else if (/\bnext week\b/i.test(text)) {
    const t = new Date(today); t.setDate(t.getDate() + 7)
    date = toYMD(t)
    text = text.replace(/\bnext week\b/i, ' ').trim()
  } else {
    // "next monday" or just "friday"
    const nextMatch = text.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i)
    if (nextMatch) {
      const dayNum = DAY_NAMES[nextMatch[1].toLowerCase()]
      date = nextWeekday(dayNum)
      text = text.replace(nextMatch[0], ' ').trim()
    }
  }

  // Clean up double spaces and trailing noise
  const title = text.replace(/\s{2,}/g, ' ').trim() || input.trim()

  return { title, date, time, location }
}
