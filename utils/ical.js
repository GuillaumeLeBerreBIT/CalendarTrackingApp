// Minimal iCalendar (RFC 5545) serializer for the secret subscribe feed.

const PRODID = "-//Eventli//Calendar//EN";

// Escape text per RFC 5545 (backslash, semicolon, comma, newlines).
function escapeText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// 'YYYY-MM-DD' → 'YYYYMMDD'
function toDateValue(dateStr) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 10).replace(/-/g, "");
}

// 'HH:MM' or 'HH:MM:SS' → 'HHMMSS'
function toTimeValue(timeStr) {
  if (!timeStr) return "000000";
  const parts = String(timeStr).split(":");
  const hh = (parts[0] || "00").padStart(2, "0");
  const mm = (parts[1] || "00").padStart(2, "0");
  const ss = (parts[2] || "00").padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

// Add one day to a 'YYYY-MM-DD' string (all-day DTEND is exclusive).
function addOneDay(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

/**
 * Build a VCALENDAR string from a list of event rows.
 * @param {Array} events             rows from the `events` table
 * @param {Object} overridesByEvent  { [event_id]: [ override rows ] } for recurring events
 */
export function buildICS(events = [], overridesByEvent = {}) {
  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(`PRODID:${PRODID}`);
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  const dtstamp = nowStamp();

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:event-${e.event_id}@eventli`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeText(e.event_title)}`);
    if (e.event_description) lines.push(`DESCRIPTION:${escapeText(e.event_description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);

    const hasStartTime = e.start_time != null && String(e.start_time).trim().length >= 4;

    if (e.all_day || !hasStartTime) {
      const startDate = toDateValue(e.start_date);
      // End is exclusive for all-day: use end_date + 1, falling back to start_date + 1.
      const endSource = e.end_date || e.start_date;
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${addOneDay(endSource)}`);
    } else {
      const start = `${toDateValue(e.start_date)}T${toTimeValue(e.start_time)}`;
      const endDate = e.end_date || e.start_date;
      const endTime = e.end_time || e.start_time;
      const end = `${toDateValue(endDate)}T${toTimeValue(endTime)}`;
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    }

    if (e.recurrence_rule) {
      const rule = String(e.recurrence_rule).replace(/^RRULE:/i, "");
      lines.push(`RRULE:${rule}`);

      const overrides = overridesByEvent[e.event_id] || [];
      for (const ov of overrides) {
        if (!ov.is_cancelled) continue;
        const exDate = toDateValue(ov.occurrence_date);
        if (e.all_day || !hasStartTime) {
          lines.push(`EXDATE;VALUE=DATE:${exDate}`);
        } else {
          lines.push(`EXDATE:${exDate}T${toTimeValue(e.start_time)}`);
        }
      }
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export default buildICS;
