// Which IANA zone an event's naive date + time is read in.
import { EVENT_TZ } from "./wallClock.js";
import { isValidTimeZone } from "./dailySummary.js";

// The zone of a stored event row. Rows from before events.timezone existed (or a
// bad value) fall back to EVENT_TZ so a sweep never throws on one odd row.
export function eventTimeZone(event) {
  return isValidTimeZone(event?.timezone) ? event.timezone : EVENT_TZ;
}

// The zone to stamp on a newly created event: the one the client says it is in,
// else the creator's stored profile zone, else EVENT_TZ.
export async function creatorTimeZone(db, userId, requested) {
  if (isValidTimeZone(requested)) return requested;
  const { data } = await db
    .from("profiles")
    .select("notification_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  const stored = data?.notification_prefs?.timezone;
  return isValidTimeZone(stored) ? stored : EVENT_TZ;
}
