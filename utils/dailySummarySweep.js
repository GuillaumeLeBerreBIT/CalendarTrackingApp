/**
 * The every-15-minutes sweep behind the daily "you have events today" push.
 * Pure text/time logic lives in ./dailySummary.js; this file is the I/O half.
 */

import { supabaseAdmin } from "../db/supabase.js";
import { expandRecurringEvent } from "./recurrence.js";
import { notifyUsers } from "./notifications.js";
import { normalizeTime, localSlot, isValidTimeZone, buildSummaryBody } from "./dailySummary.js";

/**
 * For each user who has the daily summary enabled and whose local time now
 * matches their send time, push a list of today's events (in their zone) and
 * stamp the send so a mid-slot restart can't double-fire. Runs with
 * supabaseAdmin (cross-user, bypasses RLS). Never throws.
 */
export async function runDailySummarySweep() {
  try {
    const db = supabaseAdmin;
    const now = new Date();

    const { data: profiles, error } = await db
      .from("profiles")
      .select("user_id, notification_prefs")
      .eq("notification_prefs->>daily_summary_enabled", "true");

    if (error) {
      console.error("[scheduler] daily summary could not fetch profiles:", error.message);
      return;
    }
    if (!profiles || profiles.length === 0) return;

    // Keep only users whose local slot matches their chosen time and who have
    // not already been sent today (in their own local date).
    const due = [];
    for (const p of profiles) {
      const prefs = p.notification_prefs || {};
      const tz = isValidTimeZone(prefs.timezone) ? prefs.timezone : "UTC";
      const wanted = normalizeTime(prefs.daily_summary_time || "08:00");
      const slot = localSlot(now, tz);
      if (!slot || !wanted) continue;
      if (slot.time !== wanted) continue;
      if (prefs.daily_summary_last_sent === slot.date) continue;
      due.push({ userId: p.user_id, prefs, today: slot.date });
    }
    if (due.length === 0) return;

    let sent = 0;
    for (const { userId, prefs, today } of due) {
      const events = await eventsForUserOnDate(db, userId, today);
      const body = buildSummaryBody(events);

      if (body) {
        await notifyUsers(db, [userId], "event_reminder", {
          title: "Today's schedule",
          body,
          link: "/calendar",
        });
        sent++;
      }

      await db
        .from("profiles")
        .update({ notification_prefs: { ...prefs, daily_summary_last_sent: today } })
        .eq("user_id", userId);
    }

    if (sent > 0) console.log(`[scheduler] Daily summary sent to ${sent} user(s).`);
  } catch (err) {
    console.error("[scheduler] Daily summary sweep failed:", err.message);
  }
}

/**
 * A user's events (as a participant) that fall on `dateStr`, recurring
 * occurrences included. Shaped for buildSummaryBody.
 */
async function eventsForUserOnDate(db, userId, dateStr) {
  const { data: links } = await db
    .from("profiles_events")
    .select("event_id")
    .eq("user_id", userId);
  const eventIds = (links || []).map((l) => l.event_id);
  if (eventIds.length === 0) return [];

  const { data: rows } = await db
    .from("events")
    .select("event_id, event_title, start_date, end_date, start_time, all_day, recurrence_rule")
    .in("event_id", eventIds);
  if (!rows || rows.length === 0) return [];

  const recurringIds = rows.filter((e) => e.recurrence_rule).map((e) => e.event_id);
  const overridesByEvent = {};
  if (recurringIds.length > 0) {
    const { data: overrides } = await db
      .from("event_overrides")
      .select("*")
      .in("event_id", recurringIds);
    (overrides || []).forEach((o) => {
      (overridesByEvent[o.event_id] ||= []).push(o);
    });
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

  const out = [];
  for (const e of rows) {
    if (e.recurrence_rule) {
      const occ = expandRecurringEvent(e, dayStart, dayEnd, overridesByEvent[e.event_id] || []);
      if (occ.some((o) => (o._occurrenceDate || o.start_date) === dateStr)) {
        out.push({ title: e.event_title, start_time: e.start_time, all_day: e.all_day });
      }
    } else {
      const start = e.start_date;
      const end = e.end_date || e.start_date;
      if (start <= dateStr && dateStr <= end) {
        out.push({ title: e.event_title, start_time: e.start_time, all_day: e.all_day });
      }
    }
  }
  return out;
}
