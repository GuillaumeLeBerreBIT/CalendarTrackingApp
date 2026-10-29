// Convert an absolute instant to the wall-clock date/time seen in an IANA timezone.
export function toWallClock(instant, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour; // some ICU builds emit "24"
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}:${p.second}` };
}

// Events carry a naive date + time with no zone. This is the zone those wall
// clocks are read in wherever the server needs a real instant (reminders,
// countdowns, cron times). Same default as the Google sync.
export const EVENT_TZ = process.env.EVENT_TZ || process.env.GOOGLE_DEFAULT_TZ || "Europe/Brussels";

// The calendar date ("YYYY-MM-DD") it is right now in an IANA timezone.
export function todayIn(tz, now = new Date()) {
  return toWallClock(now, tz).date;
}

// Inverse of toWallClock: the absolute instant at which a naive date + time
// ("HH:MM" or "HH:MM:SS"; falsy → midnight) is shown on the clocks of `tz`.
// Never reads the host's timezone. A time skipped by spring-forward resolves to
// the instant just after the gap; an ambiguous fall-back time to either one.
export function wallClockToInstant(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = (timeStr || "00:00:00").split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = wallAsUtc;
  // Two passes settle the offset even when the first guess lands across a DST edge.
  for (let i = 0; i < 2; i++) {
    const seen = toWallClock(new Date(guess), tz);
    const [sy, sm, sd] = seen.date.split("-").map(Number);
    const [sh, smin, ss2] = seen.time.split(":").map(Number);
    guess += wallAsUtc - Date.UTC(sy, sm - 1, sd, sh, smin, ss2);
  }
  return new Date(guess);
}
