import cron from 'node-cron';
import supabase, { supabaseAdmin } from '../db/supabase.js';
import { sendDigestForUser } from '../routes/email.js';
import { expandRecurringEvent } from './recurrence.js';
import { notifyUsers } from './notifications.js';

/**
 * Build a server-local Date for an occurrence given its date string and a time string.
 * timeStr may be 'HH:MM:SS', 'HH:MM', or falsy (→ midnight).
 */
function occurrenceStartDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let hh = 0, mm = 0;
  if (timeStr) {
    const parts = timeStr.split(':').map(Number);
    hh = parts[0] || 0;
    mm = parts[1] || 0;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * Sweep events with per-event reminders set and fire in-app notifications for any
 * occurrence whose reminder time has arrived (and hasn't fired yet). Runs with the
 * module supabase singleton (no user JWT). Never throws.
 */
export async function runReminderSweep() {
  try {
    const now = new Date();
    // Cross-user trusted job → must bypass RLS (anon client sees no rows: auth.uid() is null).
    const db = supabaseAdmin;

    const { data: events, error } = await db
      .from('events')
      .select('event_id, event_title, start_date, start_time, all_day, end_date, end_time, recurrence_rule, reminder_minutes')
      .not('reminder_minutes', 'is', null);

    if (error) {
      console.error('[scheduler] reminder sweep could not fetch events:', error.message);
      return;
    }
    if (!events || events.length === 0) return;

    // Batch-fetch overrides for recurring events up front.
    const recurringIds = events.filter(e => e.recurrence_rule).map(e => e.event_id);
    const overridesByEvent = {};
    if (recurringIds.length > 0) {
      const { data: overrides } = await db
        .from('event_overrides')
        .select('*')
        .in('event_id', recurringIds);
      (overrides || []).forEach(o => {
        (overridesByEvent[o.event_id] ||= []).push(o);
      });
    }

    let fired = 0;

    for (const event of events) {
      const reminderMinutes = event.reminder_minutes;
      if (reminderMinutes == null) continue;

      // Candidate occurrences: one for non-recurring, expanded set for recurring.
      let occurrences;
      if (event.recurrence_rule) {
        const windowEnd = new Date(now.getTime() + (reminderMinutes + 6) * 60 * 1000);
        occurrences = expandRecurringEvent(event, now, windowEnd, overridesByEvent[event.event_id] || []);
      } else {
        occurrences = [{ ...event, _occurrenceDate: event.start_date }];
      }

      for (const occ of occurrences) {
        const occurrenceDate = occ._occurrenceDate || occ.start_date;
        const occurrenceStart = occurrenceStartDate(occ.start_date, occ.all_day ? '00:00:00' : occ.start_time);
        const reminderTime = new Date(occurrenceStart.getTime() - reminderMinutes * 60 * 1000);

        if (!(now >= reminderTime && now < occurrenceStart)) continue;

        // Skip if we already fired for this (event, occurrence).
        const { data: sent } = await db
          .from('event_reminders_sent')
          .select('event_id')
          .eq('event_id', event.event_id)
          .eq('occurrence_date', occurrenceDate)
          .maybeSingle();
        if (sent) continue;

        const { data: parts } = await db
          .from('profiles_events')
          .select('user_id')
          .eq('event_id', event.event_id);
        const participantIds = (parts || []).map(p => p.user_id);

        await notifyUsers(db, participantIds, 'event_reminder', {
          title: 'Reminder',
          body: `"${event.event_title}" starts soon`,
          link: '/calendar',
        });

        await db
          .from('event_reminders_sent')
          .upsert(
            { event_id: event.event_id, occurrence_date: occurrenceDate, fired_at: now.toISOString() },
            { onConflict: 'event_id,occurrence_date', ignoreDuplicates: true }
          );

        fired++;
      }
    }

    if (fired > 0) console.log(`[scheduler] Reminder sweep complete — fired ${fired} reminder(s).`);
  } catch (err) {
    console.error('[scheduler] Reminder sweep failed:', err.message);
  }
}

/**
 * Start the cron scheduler.
 * Schedules the daily digest email job at 07:00 server time.
 */
export function startScheduler() {
  // 0 7 * * *  →  every day at 07:00 (server local time)
  cron.schedule('0 7 * * *', async () => {
    console.log('[scheduler] Starting daily digest run...');

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, email');

    if (error) {
      console.error('[scheduler] Could not fetch profiles:', error.message);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('[scheduler] No profiles found — nothing to send.');
      return;
    }

    console.log(`[scheduler] Sending digest to ${profiles.length} user(s)...`);

    // Send to each user in sequence to avoid hammering Resend rate limits
    for (const profile of profiles) {
      try {
        const result = await sendDigestForUser(profile.user_id);

        if (result.skipped) {
          console.log(`[scheduler] Skipped ${profile.email}: ${result.reason}`);
        } else {
          console.log(`[scheduler] Sent digest to ${profile.email} (emailId: ${result.emailId})`);
        }
      } catch (err) {
        // Log and continue — one failure must not stop the rest of the run
        console.error(`[scheduler] Failed to send digest to ${profile.email}:`, err.message);
      }
    }

    console.log('[scheduler] Daily digest run complete.');
  });

  console.log('[scheduler] Daily digest cron registered (07:00 server time).');

  // */5 * * * *  →  every 5 minutes: fire any due per-event reminders.
  cron.schedule('*/5 * * * *', () => {
    runReminderSweep();
  });

  console.log('[scheduler] Reminder sweep cron registered (every 5 minutes).');
}
