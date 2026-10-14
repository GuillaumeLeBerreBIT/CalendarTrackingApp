// All-day date helpers.
//
// Eventli stores an all-day span with an INCLUSIVE end_date (10 → 15 October
// means both days are included). FullCalendar treats an all-day `end` as
// EXCLUSIVE, so the two differ by one day at the boundary. Convert only at the
// FullCalendar boundary: when reading into FullCalendar and when writing back
// from its drag/resize/select callbacks.

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Stored inclusive end_date → FullCalendar exclusive end. */
export function toCalendarAllDayEnd(endDate: string | null | undefined): string | undefined {
  if (!endDate) return undefined
  return addDaysStr(endDate.split('T')[0], 1)
}

/** FullCalendar exclusive end → stored inclusive end_date. Never before startDate. */
export function fromCalendarAllDayEnd(startDate: string, exclusiveEnd: string | null | undefined): string {
  const start = startDate.split('T')[0]
  if (!exclusiveEnd) return start
  const inclusive = addDaysStr(exclusiveEnd.split('T')[0], -1)
  return inclusive < start ? start : inclusive
}
