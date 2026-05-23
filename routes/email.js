// Required env vars:
// RESEND_API_KEY=re_...
// Optional: FROM_EMAIL=digest@yourdomain.com

import express from 'express';
import { Resend } from 'resend';
import supabase from '../db/supabase.js';
import authRequire from '../utils/utils.js';

const router = express.Router();

// UUID v4 validation regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FROM_EMAIL = process.env.FROM_EMAIL || 'digest@calendartracking.app';

// ---------------------------------------------------------------------------
// Shared digest-building + sending logic (also used by the scheduler)
// ---------------------------------------------------------------------------

/**
 * Fetch all data needed for the digest for a given userId.
 * Returns { username, email, todayEvents, upcomingEvents, taskSummary }
 */
export async function fetchDigestData(userId) {
  // -- Profile --
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username, email')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error(`Could not fetch profile for userId ${userId}: ${profileError?.message}`);
  }

  const today = new Date();
  // Use local date parts to build YYYY-MM-DD without timezone drift
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  const sevenDaysStr = `${sevenDaysLater.getFullYear()}-${pad(sevenDaysLater.getMonth() + 1)}-${pad(sevenDaysLater.getDate())}`;

  // -- Today's events --
  const { data: todayEventsRaw, error: todayEventsError } = await supabase
    .from('events')
    .select(`
      event_id, event_title, all_day, start_time,
      groups_id,
      groups ( groups_title ),
      profiles_events!inner ( user_id )
    `)
    .eq('start_date', todayStr)
    .eq('profiles_events.user_id', userId);

  if (todayEventsError) {
    console.warn(`[digest] Could not fetch today's events for ${userId}: ${todayEventsError.message}`);
  }

  // -- Next 7 days events (exclusive of today) --
  const { data: upcomingEventsRaw, error: upcomingEventsError } = await supabase
    .from('events')
    .select(`
      event_id, event_title, all_day, start_date, start_time,
      groups_id,
      groups ( groups_title ),
      profiles_events!inner ( user_id )
    `)
    .gt('start_date', todayStr)
    .lte('start_date', sevenDaysStr)
    .eq('profiles_events.user_id', userId)
    .order('start_date', { ascending: true });

  if (upcomingEventsError) {
    console.warn(`[digest] Could not fetch upcoming events for ${userId}: ${upcomingEventsError.message}`);
  }

  // -- Groups the user belongs to (for task query) --
  const { data: memberGroups, error: memberGroupsError } = await supabase
    .from('profiles_groups')
    .select('groups_id')
    .eq('user_id', userId)
    .eq('invite_status', 'accepted');

  if (memberGroupsError) {
    console.warn(`[digest] Could not fetch groups for ${userId}: ${memberGroupsError.message}`);
  }

  const groupIds = (memberGroups || []).map((g) => g.groups_id);

  // -- Incomplete tasks in those groups, grouped by task list --
  let taskSummary = [];

  if (groupIds.length > 0) {
    const { data: taskLists, error: taskListsError } = await supabase
      .from('task_list')
      .select('task_list_id, list_title')
      .in('groups_id', groupIds);

    if (taskListsError) {
      console.warn(`[digest] Could not fetch task lists for ${userId}: ${taskListsError.message}`);
    }

    if (taskLists && taskLists.length > 0) {
      const taskListIds = taskLists.map((tl) => tl.task_list_id);

      const { data: incompleteTasks, error: incompleteTasksError } = await supabase
        .from('task')
        .select('task_list_id')
        .in('task_list_id', taskListIds)
        .eq('is_completed', false);

      if (incompleteTasksError) {
        console.warn(`[digest] Could not fetch tasks for ${userId}: ${incompleteTasksError.message}`);
      }

      // Count incomplete tasks per list
      const countByList = {};
      (incompleteTasks || []).forEach((t) => {
        countByList[t.task_list_id] = (countByList[t.task_list_id] || 0) + 1;
      });

      taskSummary = taskLists
        .filter((tl) => countByList[tl.task_list_id] > 0)
        .map((tl) => ({ listTitle: tl.list_title, pendingCount: countByList[tl.task_list_id] }));
    }
  }

  // Normalise event shapes
  const formatTime = (t) => (t ? t.slice(0, 5) : null); // HH:MM:SS -> HH:MM

  const todayEvents = (todayEventsRaw || []).map((e) => ({
    title: e.event_title,
    allDay: e.all_day,
    startTime: formatTime(e.start_time),
    groupName: e.groups?.groups_title || null,
  }));

  const upcomingEvents = (upcomingEventsRaw || []).map((e) => ({
    title: e.event_title,
    allDay: e.all_day,
    startDate: e.start_date,
    startTime: formatTime(e.start_time),
    groupName: e.groups?.groups_title || null,
  }));

  return {
    username: profile.username,
    email: profile.email,
    todayEvents,
    upcomingEvents,
    taskSummary,
    todayStr,
  };
}

/**
 * Build the plain-text body of the digest email.
 */
function buildTextBody({ username, todayEvents, upcomingEvents, taskSummary, todayStr }) {
  const dayLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines = [];
  lines.push(`Good morning ${username},`);
  lines.push('');
  lines.push("Here's your day at a glance.");
  lines.push('');

  // Today's events
  lines.push('TODAY\'S EVENTS');
  if (todayEvents.length === 0) {
    lines.push('  No events today.');
  } else {
    todayEvents.forEach((e) => {
      const timeLabel = e.allDay ? 'All day' : e.startTime || 'All day';
      const group = e.groupName ? ` (${e.groupName})` : '';
      lines.push(`  • [${timeLabel}] ${e.title}${group}`);
    });
  }
  lines.push('');

  // Open tasks
  lines.push('OPEN TASKS');
  if (taskSummary.length === 0) {
    lines.push('  All caught up!');
  } else {
    taskSummary.forEach((t) => {
      lines.push(`  • ${t.listTitle}: ${t.pendingCount} task${t.pendingCount === 1 ? '' : 's'} pending`);
    });
  }
  lines.push('');

  // Coming up this week
  lines.push('COMING UP THIS WEEK');
  if (upcomingEvents.length === 0) {
    lines.push('  Nothing scheduled in the next 7 days.');
  } else {
    upcomingEvents.forEach((e) => {
      const dateLabel = new Date(e.startDate + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const timeLabel = e.allDay ? '' : e.startTime ? ` at ${e.startTime}` : '';
      const group = e.groupName ? ` (${e.groupName})` : '';
      lines.push(`  • ${dateLabel} — ${e.title}${timeLabel}${group}`);
    });
  }
  lines.push('');
  lines.push('— CalendarTracking');

  return lines.join('\n');
}

/**
 * Build the HTML body of the digest email.
 */
function buildHtmlBody({ username, todayEvents, upcomingEvents, taskSummary, todayStr }) {
  const dayLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const sectionStyle = 'margin: 24px 0;';
  const headingStyle =
    'font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 10px 0;';
  const itemStyle = 'margin: 6px 0; font-size: 15px; color: #111827;';
  const mutedStyle = 'font-size: 14px; color: #6b7280;';
  const tagStyle =
    'display: inline-block; font-size: 12px; background: #f3f4f6; color: #374151; border-radius: 4px; padding: 1px 6px; margin-left: 6px;';

  const todayEventsHtml =
    todayEvents.length === 0
      ? `<p style="${mutedStyle}">No events today.</p>`
      : todayEvents
          .map((e) => {
            const timeLabel = e.allDay ? 'All day' : e.startTime || 'All day';
            const groupTag = e.groupName ? `<span style="${tagStyle}">${e.groupName}</span>` : '';
            return `<p style="${itemStyle}">&#8226; <strong>${timeLabel}</strong> &mdash; ${e.title}${groupTag}</p>`;
          })
          .join('');

  const tasksHtml =
    taskSummary.length === 0
      ? `<p style="${mutedStyle}">All caught up!</p>`
      : taskSummary
          .map(
            (t) =>
              `<p style="${itemStyle}">&#8226; ${t.listTitle}: <strong>${t.pendingCount} task${t.pendingCount === 1 ? '' : 's'} pending</strong></p>`
          )
          .join('');

  const upcomingHtml =
    upcomingEvents.length === 0
      ? `<p style="${mutedStyle}">Nothing scheduled in the next 7 days.</p>`
      : upcomingEvents
          .map((e) => {
            const dateLabel = new Date(e.startDate + 'T12:00:00').toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            const timeLabel = e.allDay ? '' : e.startTime ? ` at ${e.startTime}` : '';
            const groupTag = e.groupName ? `<span style="${tagStyle}">${e.groupName}</span>` : '';
            return `<p style="${itemStyle}">&#8226; <strong>${dateLabel}</strong> &mdash; ${e.title}${timeLabel}${groupTag}</p>`;
          })
          .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;max-width:600px;width:100%;">
        <tr><td>
          <p style="font-size:13px;color:#9ca3af;margin:0 0 4px 0;">CalendarTracking</p>
          <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px 0;">Good morning, ${username}</h1>
          <p style="font-size:14px;color:#6b7280;margin:0 0 32px 0;">${dayLabel}</p>

          <div style="${sectionStyle}">
            <p style="${headingStyle}">Today's Events</p>
            ${todayEventsHtml}
          </div>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

          <div style="${sectionStyle}">
            <p style="${headingStyle}">Open Tasks</p>
            ${tasksHtml}
          </div>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

          <div style="${sectionStyle}">
            <p style="${headingStyle}">Coming Up This Week</p>
            ${upcomingHtml}
          </div>

          <p style="font-size:12px;color:#9ca3af;margin:32px 0 0 0;">
            You're receiving this because you have a CalendarTracking account.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send the daily digest for a single user.
 * Returns { success: true } or throws with a descriptive message.
 */
export async function sendDigestForUser(userId) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const digestData = await fetchDigestData(userId);

  // Check email digest preference gracefully — default to enabled
  let digestEnabled = true;
  try {
    const { data: prefRow, error: prefError } = await supabase
      .from('profiles')
      .select('email_digest_enabled')
      .eq('user_id', userId)
      .single();

    if (!prefError && prefRow && prefRow.email_digest_enabled !== undefined) {
      digestEnabled = prefRow.email_digest_enabled;
    } else if (prefError && prefError.code !== 'PGRST116') {
      // PGRST116 = column doesn't exist; anything else is a real error worth logging
      console.warn(`[digest] Could not read email_digest_enabled for ${userId}: ${prefError.message}`);
    }
  } catch (_) {
    console.warn(`[digest] email_digest_enabled column may not exist — defaulting to enabled.`);
  }

  if (!digestEnabled) {
    return { success: true, skipped: true, reason: 'digest disabled by user preference' };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const dayLabel = new Date(`${digestData.todayStr}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const subject = `Your day — ${dayLabel}`;
  const textBody = buildTextBody(digestData);
  const htmlBody = buildHtmlBody(digestData);

  const { data: sendResult, error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: digestData.email,
    subject,
    text: textBody,
    html: htmlBody,
  });

  if (sendError) {
    throw new Error(`Resend error for ${digestData.email}: ${sendError.message}`);
  }

  return { success: true, emailId: sendResult?.id };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /send-digest/:userId
 * Send the digest email for a specific user. No auth required — intended for
 * internal scheduler use. userId is validated as a UUID before any DB query.
 */
router.post('/send-digest/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!UUID_RE.test(userId)) {
    return res.status(400).json({ success: false, error: 'Invalid userId format.' });
  }

  try {
    const result = await sendDigestForUser(userId);
    return res.json(result);
  } catch (error) {
    console.error(`[digest] Failed to send digest for ${userId}:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /email-preferences
 * Return the current user's email digest preference.
 */
router.get('/email-preferences', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email_digest_enabled')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Column likely doesn't exist yet — return default
      if (error.code === 'PGRST116' || error.message?.includes('column')) {
        return res.json({ success: true, emailDigestEnabled: true, note: 'column not yet migrated, defaulting to true' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({
      success: true,
      emailDigestEnabled: data?.email_digest_enabled ?? true,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /email-preferences
 * Toggle or set the user's email digest preference.
 * Body: { emailDigestEnabled: boolean }
 */
router.post('/email-preferences', authRequire, async (req, res) => {
  const userId = req.cookies.userId;
  const { emailDigestEnabled } = req.body;

  if (typeof emailDigestEnabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'emailDigestEnabled must be a boolean.' });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ email_digest_enabled: emailDigestEnabled })
    .eq('user_id', userId);

  if (error) {
    // Column doesn't exist — inform caller but don't crash
    if (error.message?.includes('column') || error.code === '42703') {
      console.warn('[digest] email_digest_enabled column does not exist. Run a migration to add it.');
      return res.status(422).json({
        success: false,
        error: 'email_digest_enabled column is not yet present in the profiles table. Please run the required migration.',
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.json({ success: true, emailDigestEnabled });
});

export default router;
