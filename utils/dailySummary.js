/**
 * Daily "you have events today" push summary — pure helpers.
 *
 * No I/O here so this stays unit-testable in isolation (tests/dailySummary.test.js).
 * The sweep that reads the DB and sends the push lives in utils/dailySummarySweep.js.
 *
 * Everything is timezone-aware: each user stores an IANA zone in
 * profiles.notification_prefs.timezone and the sweep matches their *local*
 * wall-clock time against their chosen send time.
 */

const MAX_NAMES = 3;

/**
 * Validate an IANA time zone name (e.g. "Europe/Paris"). Offsets and junk fail.
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  // Node's Intl also accepts bare UTC offsets ("+02:00"); we only want IANA
  // region names, so require an "Area/Location" shape (or the "UTC" singleton).
  if (tz !== "UTC" && !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate "H:MM"/"HH:MM" and snap it to the nearest 15-minute grid point.
 * Rolls the hour (and wraps past midnight) when minutes round up to 60.
 * @param {string} str
 * @returns {string|null} "HH:MM" or null if unparseable / out of range
 */
export function normalizeTime(str) {
  if (typeof str !== "string") return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let hh = Number(m[1]);
  let mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;

  mm = Math.round(mm / 15) * 15;
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * The local date and 15-minute-floored wall time of `date` in `timeZone`.
 * @param {Date} date
 * @param {string} timeZone  IANA zone name
 * @returns {{date: string, time: string}|null}  { "YYYY-MM-DD", "HH:MM" } or null for a bad zone
 */
export function localSlot(date, timeZone) {
  if (!isValidTimeZone(timeZone)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  let hh = get("hour");
  const mm = Number(get("minute"));

  // Intl can emit "24" for midnight in some engines — normalise to "00".
  if (hh === "24") hh = "00";
  const floored = Math.floor(mm / 15) * 15;

  return {
    date: `${y}-${mo}-${d}`,
    time: `${hh}:${String(floored).padStart(2, "0")}`,
  };
}

function hm(startTime) {
  return (startTime || "").slice(0, 5);
}

/**
 * Notification body for a user's events on a single day.
 * All-day events sort first and are labelled "(all day)"; timed events follow in
 * chronological order. Beyond three names the remainder is summarised as "+N more".
 * @param {{title: string, start_time: string|null, all_day: boolean}[]} events
 * @returns {string|null} null when there are no events
 */
export function buildSummaryBody(events) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const sorted = [...events].sort((a, b) => {
    const at = a.all_day ? "" : hm(a.start_time) || "99:99";
    const bt = b.all_day ? "" : hm(b.start_time) || "99:99";
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  const count = sorted.length;
  const noun = count === 1 ? "event" : "events";

  if (count === 1) {
    const e = sorted[0];
    const tail = e.all_day ? " (all day)" : ` at ${hm(e.start_time)}`;
    return `1 event today — ${e.title}${tail}`;
  }

  const shown = sorted.slice(0, MAX_NAMES).map((e) =>
    e.all_day ? `${e.title} (all day)` : `${e.title} ${hm(e.start_time)}`,
  );
  const remainder = count - shown.length;
  if (remainder > 0) shown.push(`+${remainder} more`);

  return `${count} ${noun} today — ${shown.join(", ")}`;
}
