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
            { event_id: event.event_id, occurrence_date: occurrenceDate, fired_at: now.toISOString(), reminder_type: 'reminder' },
            { onConflict: 'event_id,occurrence_date,reminder_type', ignoreDuplicates: true }
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
 * Sweep all upcoming events and send D-7 and D-1 push/in-app notifications
 * to attendees who haven't received them yet. Runs daily at 08:00. Never throws.
 */
async function runCountdownSweep() {
  try {
    const db = supabaseAdmin;
    const now = new Date();

    // Look ahead 8 days so both D-7 and D-1 windows are covered in one query.
    const windowStart = new Date(now);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 8);

    const { data: events, error } = await db
      .from('events')
      .select('event_id, event_title, start_date, start_time, all_day')
      .gte('start_date', windowStart.toISOString().slice(0, 10))
      .lte('start_date', windowEnd.toISOString().slice(0, 10));

    if (error || !events || events.length === 0) return;

    let fired = 0;

    for (const event of events) {
      const occStart = occurrenceStartDate(event.start_date, event.all_day ? '00:00:00' : event.start_time);
      const diffMs = occStart.getTime() - now.getTime();
      const diffDays = diffMs / 86400000;

      // Only act on the D-7 window (6.5–7.5 days out) or D-1 window (0.5–1.5 days out)
      const type = diffDays >= 6.5 && diffDays < 7.5
        ? 'countdown_7d'
        : diffDays >= 0.5 && diffDays < 1.5
          ? 'countdown_1d'
          : null;
      if (!type) continue;

      // Deduplicate: skip if this reminder_type already fired for this event
      const { data: sent } = await db
        .from('event_reminders_sent')
        .select('event_id')
        .eq('event_id', event.event_id)
        .eq('occurrence_date', event.start_date)
        .eq('reminder_type', type)
        .maybeSingle();
      if (sent) continue;

      const { data: parts } = await db
        .from('profiles_events')
        .select('user_id')
        .eq('event_id', event.event_id)
        .in('rsvp_status', ['going', 'pending']);
      const participantIds = (parts || []).map(p => p.user_id);
      if (participantIds.length === 0) continue;

      const label = type === 'countdown_7d' ? '7 days away' : 'tomorrow';
      await notifyUsers(db, participantIds, 'event_reminder', {
        title: `📅 ${event.event_title} is ${label}`,
        body: `Starts ${event.all_day ? 'all day' : (event.start_time || '').slice(0, 5)} on ${event.start_date}`,
        link: '/calendar',
      });

      await db.from('event_reminders_sent').upsert(
        { event_id: event.event_id, occurrence_date: event.start_date, fired_at: now.toISOString(), reminder_type: type },
        { onConflict: 'event_id,occurrence_date,reminder_type', ignoreDuplicates: true }
      );

      fired++;
    }

    if (fired > 0) console.log(`[scheduler] Countdown sweep fired ${fired} notification(s).`);
  } catch (err) {
    console.error('[scheduler] Countdown sweep failed:', err.message);
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

  // 0 8 * * *  →  every day at 08:00: send D-7 and D-1 countdown notifications.
  cron.schedule('0 8 * * *', () => {
    runCountdownSweep();
  });

  console.log('[scheduler] Countdown sweep cron registered (08:00 server time).');

  // 5 0 * * *  →  every day at 00:05 UTC: resolve expired pacts.
  cron.schedule('5 0 * * *', async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: expired } = await supabaseAdmin
        .from('pacts')
        .select('pact_id, completions_count, target_completions, reward_event_id')
        .lt('ends_at', today)
        .eq('status', 'active');
      for (const pact of expired || []) {
        const newStatus = pact.completions_count >= pact.target_completions ? 'succeeded' : 'failed';
        const eventStatus = newStatus === 'succeeded' ? 'confirmed' : 'failed';
        await supabaseAdmin.from('pacts').update({ status: newStatus }).eq('pact_id', pact.pact_id);
        if (pact.reward_event_id) {
          await supabaseAdmin.from('events').update({ status: eventStatus }).eq('event_id', pact.reward_event_id);
        }
      }
      if (expired?.length) console.log(`[scheduler] Resolved ${expired.length} expired pact(s).`);
    } catch (err) {
      console.error('[scheduler] Pact resolution failed:', err.message);
    }
  });

  console.log('[scheduler] Pact resolution cron registered (00:05 UTC).');

  // 0 20 * * *  →  every day at 20:00: remind users who haven't logged their daily habits.
  cron.schedule('0 20 * * *', async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const { data: habits } = await supabaseAdmin
        .from('habits')
        .select('habit_id, user_id, title, emoji')
        .eq('frequency', 'daily');

      if (!habits?.length) return;

      const habitIds = habits.map(h => h.habit_id);
      const { data: completions } = await supabaseAdmin
        .from('habit_completions')
        .select('habit_id, user_id')
        .in('habit_id', habitIds)
        .eq('completed_date', today);

      const completedSet = new Set((completions || []).map(c => `${c.user_id}:${c.habit_id}`));

      // Group unlogged habits by user
      const unloggedByUser = new Map();
      for (const h of habits) {
        if (!completedSet.has(`${h.user_id}:${h.habit_id}`)) {
          if (!unloggedByUser.has(h.user_id)) unloggedByUser.set(h.user_id, []);
          unloggedByUser.get(h.user_id).push(h);
        }
      }

      if (!unloggedByUser.size) return;

      for (const [userId, unlogged] of unloggedByUser) {
        const body = unlogged.length === 1
          ? `Don't forget: ${unlogged[0].emoji} ${unlogged[0].title}`
          : `${unlogged.length} habits still to log today`;
        await notifyUsers(supabaseAdmin, [userId], 'habit_reminder', {
          title: 'Habit check-in',
          body,
          link: '/habits',
        });
      }

      console.log(`[scheduler] Habit reminders sent to ${unloggedByUser.size} user(s).`);
    } catch (err) {
      console.error('[scheduler] Habit reminder sweep failed:', err.message);
    }
  });

  console.log('[scheduler] Habit reminder cron registered (20:00 server time).');
}
