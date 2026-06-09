import pkg from "rrule";
const { RRule } = pkg;

// Format a UTC Date back to a naive YYYY-MM-DD string (no timezone shift).
function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(Date.UTC(y, m - 1, d + days)));
}

/**
 * Expand a recurring master event into concrete occurrence objects within
 * [windowStart, windowEnd], applying per-occurrence overrides (cancellations +
 * field edits). Each returned object mirrors the events-row shape but with
 * occurrence-specific dates and two markers: `_occurrenceDate`, `_isRecurringInstance`.
 *
 * @param {object} event       - events row (must have recurrence_rule + start_date)
 * @param {Date}   windowStart
 * @param {Date}   windowEnd
 * @param {Array}  overrides    - event_overrides rows for this event
 * @returns {Array<object>}
 */
export function expandRecurringEvent(event, windowStart, windowEnd, overrides = []) {
  if (!event?.recurrence_rule || !event.start_date) return [];

  const [sy, sm, sd] = event.start_date.split("-").map(Number);
  const [shh, smin] = event.start_time ? event.start_time.split(":").map(Number) : [0, 0];
  const dtstart = new Date(Date.UTC(sy, sm - 1, sd, shh || 0, smin || 0, 0));

  let options;
  try {
    options = RRule.parseString(event.recurrence_rule);
  } catch {
    return [];
  }
  options.dtstart = dtstart;
  const rule = new RRule(options);

  // Preserve multi-day span across occurrences
  let dayspan = 0;
  if (event.end_date) {
    const [ey, em, ed] = event.end_date.split("-").map(Number);
    dayspan = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
    if (!Number.isFinite(dayspan) || dayspan < 0) dayspan = 0;
  }

  const overrideMap = new Map(overrides.map((o) => [o.occurrence_date, o]));
  const occurrences = rule.between(windowStart, windowEnd, true);
  const results = [];

  for (const occ of occurrences) {
    const occDate = toDateStr(occ);
    const ov = overrideMap.get(occDate);
    if (ov?.is_cancelled) continue;

    let startDate = occDate;
    let endDate = dayspan ? addDaysStr(occDate, dayspan) : occDate;
    let startTime = event.start_time;
    let endTime = event.end_time;
    let title = event.event_title;
    let description = event.event_description;
    let allDay = event.all_day;

    if (ov) {
      if (ov.start_date) startDate = ov.start_date;
      if (ov.end_date) endDate = ov.end_date;
      if (ov.start_time != null) startTime = ov.start_time;
      if (ov.end_time != null) endTime = ov.end_time;
      if (ov.event_title) title = ov.event_title;
      if (ov.event_description != null) description = ov.event_description;
      if (ov.all_day != null) allDay = ov.all_day;
    }

    results.push({
      ...event,
      _occurrenceDate: occDate,
      _isRecurringInstance: true,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      event_title: title,
      event_description: description,
      all_day: allDay,
    });
  }

  return results;
}

/**
 * Set/replace the UNTIL of an RRULE string so the series ends the day before
 * `beforeDateStr`. Used for "this and following" deletes/edits.
 */
export function capRuleUntil(recurrenceRule, beforeDateStr) {
  const untilStr = beforeDateStr.replace(/-/g, "") + "T000000Z";
  const parts = recurrenceRule
    .split(";")
    .filter((p) => p && !/^UNTIL=/i.test(p) && !/^COUNT=/i.test(p));
  parts.push(`UNTIL=${untilStr}`);
  return parts.join(";");
}
