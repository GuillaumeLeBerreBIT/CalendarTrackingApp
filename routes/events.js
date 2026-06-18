import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import supabase, { supabaseAdmin } from "../db/supabase.js";
import authRequire, { createEventObj } from "../utils/utils.js";
import { notifyUsers } from "../utils/notifications.js";
import { attachTier, checkLimit } from "../utils/tier.js";
import { syncEventToGoogle } from "../utils/google.js";
import { expandRecurringEvent, capRuleUntil } from "../utils/recurrence.js";

const router = express.Router()

// Tighter limit on the public (no-auth) guest-vote endpoint than the global
// /api limiter — blunts ballot-stuffing from a single IP.
const publicVoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Max candidate date slots a tentative event may carry (set at creation + added later).
export const MAX_DATE_OPTIONS = 6;

// True if the user created the event, or is an admin of the event's group.
async function canManageEvent(reqSupabase, event, userId) {
  if (event.created_by === userId) return true;
  if (!event.groups_id) return false;
  const { data } = await reqSupabase
    .from('profiles_groups')
    .select('user_id')
    .eq('groups_id', event.groups_id)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

router.post("/parseEvent", authRequire, attachTier, checkLimit('events_month'), async (req, res) => {

  const insertEventObj = createEventObj(req.body)
  const eventStatus = req.body.status === 'tentative' ? 'tentative' : 'confirmed';
  const dateOptions = Array.isArray(req.body.dateOptions) ? req.body.dateOptions : [];

  const { data: eventData, error: eventDataError } = await req.supabase
    .from("events")
    .insert([
      {
        event_title: insertEventObj["calendar-title"],
        event_description: insertEventObj["calendar-description"],
        all_day: insertEventObj.allDay,
        start_date: insertEventObj.startDate,
        end_date: insertEventObj.endDate,
        start_time: insertEventObj.startTime,
        end_time: insertEventObj.endTime,
        groups_id: insertEventObj?.tagNames ? parseInt(insertEventObj?.tagNames) : null,
        created_by: req.cookies.userId,
        location: insertEventObj.location || null,
        image_url: insertEventObj.image_url || null,
        event_type: insertEventObj.event_type || 'appointment',
        recurrence_rule: insertEventObj.recurrence_rule || null,
        reminder_minutes: insertEventObj.reminder_minutes != null ? parseInt(insertEventObj.reminder_minutes) : null,
        status: eventStatus,
      },
    ])
    .select();

  if (eventDataError) {
    return res.status(500).json({ success: false, error: eventDataError.message });
  }

  if (eventData[0]['start_time']) eventData[0]['start_time'] = eventData[0]['start_time'].slice(0, -3);
  if (eventData[0]['end_time']) eventData[0]['end_time'] = eventData[0]['end_time'].slice(0, -3);

  const eventId = eventData[0].event_id;
  const creatorId = req.cookies.userId;

  // Insert candidate date options for tentative events
  if (eventStatus === 'tentative' && dateOptions.length > 0) {
    const optionRows = dateOptions.slice(0, MAX_DATE_OPTIONS).map((opt, i) => ({
      event_id: eventId,
      start_date: opt.startDate,
      start_time: opt.startTime || null,
      end_date: opt.endDate || null,
      end_time: opt.endTime || null,
      position: i,
    }));
    const { error: optionsError } = await supabaseAdmin
      .from('event_date_options')
      .insert(optionRows);
    if (optionsError) {
      return res.status(500).json({ success: false, error: optionsError.message });
    }
  }

  // Tentative event: ask all accepted group members (except the creator) to vote
  if (eventStatus === 'tentative' && eventData[0].groups_id) {
    try {
      const groupsId = eventData[0].groups_id;
      const { data: voteMembers } = await req.supabase
        .from('profiles_groups')
        .select('user_id')
        .eq('groups_id', groupsId)
        .eq('invite_status', 'accepted');

      const voterIds = (voteMembers || [])
        .map(m => m.user_id)
        .filter(id => id !== req.cookies.userId);

      if (voterIds.length > 0) {
        await notifyUsers(req.supabase, voterIds, 'event_invite', {
          title: 'Vote on a date',
          body: `Vote on a date for "${eventData[0].event_title}"`,
          link: `/groups/${groupsId}`,
        });
      }
    } catch (notifyError) {
      console.warn('Tentative vote notification failed:', notifyError.message);
    }
  }

  // Build the set of rows to upsert into profiles_events.
  // Use a map keyed by user_id so each user appears exactly once (no PK conflicts).
  const rsvpByUser = new Map();

  // 1. Social events: auto-invite ALL accepted group members as 'pending'
  if (req.body.event_type === 'social' && insertEventObj.tagNames) {
    const groupId = parseInt(insertEventObj.tagNames);
    if (!isNaN(groupId)) {
      const { data: groupMembers } = await req.supabase
        .from('profiles_groups')
        .select('user_id')
        .eq('groups_id', groupId)
        .eq('invite_status', 'accepted');

      (groupMembers || []).forEach(m => rsvpByUser.set(m.user_id, 'pending'));
    }
  }

  // 2. Appointment events: explicitly selected participants as 'pending'
  if (Array.isArray(insertEventObj.participants)) {
    insertEventObj.participants.forEach(p => {
      if (p?.userId) rsvpByUser.set(p.userId, 'pending');
    });
  }

  // 3. Creator is always 'going' (overrides any pending status set above)
  rsvpByUser.set(creatorId, 'going');

  // Upsert all rows at once — onConflict avoids duplicate-key errors
  const upsertRows = Array.from(rsvpByUser.entries()).map(([user_id, rsvp_status]) => ({
    user_id,
    event_id: eventId,
    rsvp_status,
  }));

  const { error: rsvpError } = await req.supabase
    .from('profiles_events')
    .upsert(upsertRows, { onConflict: 'user_id,event_id' });

  if (rsvpError) {
    return res.status(500).json({ success: false, error: rsvpError.message });
  }

  // Notify everyone invited (except the creator) that they're on a new event
  const inviteeIds = Array.from(rsvpByUser.keys()).filter((id) => id !== creatorId);
  await notifyUsers(req.supabase, inviteeIds, 'event_invite', {
    title: 'New event invite',
    body: `You're invited to "${eventData[0].event_title}".`,
    link: '/calendar',
  });

  // Build participant display list (username + userId) for the response
  const userIds = Array.from(rsvpByUser.keys());
  const { data: profiles } = await req.supabase
    .from('profiles')
    .select('user_id, username')
    .in('user_id', userIds);

  const participants = (profiles || []).map(pr => ({
    username: pr.username,
    userId: pr.user_id,
    rsvpStatus: rsvpByUser.get(pr.user_id),
  }));

  // Mirror to connected participants' Google calendars (non-blocking).
  syncEventToGoogle(eventData[0].event_id, 'upsert');

  return res.json({ success: true, eventData, participants });
});

router.put('/parseEvent/:eventId', authRequire, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    if (isNaN(eventId)) return res.status(400).json({ success: false, error: 'Invalid event ID.' });

    const { data: eventCheck, error: eventCheckError } = await req.supabase
      .from('events')
      .select('created_by, recurrence_rule, groups_id')
      .eq('event_id', eventId)
      .single();

    if (eventCheckError || !eventCheck) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    if (!(await canManageEvent(req.supabase, eventCheck, req.cookies.userId))) {
      return res.status(403).json({ success: false, error: 'You can only edit events you created.' });
    }

    const updateEventObj = createEventObj(req.body);
    const newParticipants = updateEventObj.participants || [];

    // Recurring "this occurrence only" → store a per-occurrence override, leave the series intact.
    const recurrenceScope = req.body.recurrenceScope || 'all';

    // Recurring "this and following" → cap the original series, then split off a new master.
    if (eventCheck.recurrence_rule && recurrenceScope === 'following' && req.body.occurrenceDate) {
      const occurrenceDate = req.body.occurrenceDate;
      const cappedRule = capRuleUntil(eventCheck.recurrence_rule, occurrenceDate);

      const { error: capError } = await req.supabase
        .from('events')
        .update({ recurrence_rule: cappedRule })
        .eq('event_id', eventId);
      if (capError) return res.status(500).json({ success: false, error: capError.message });

      // Create the new split master, carrying the original rule so the rest of the series continues.
      const { data: newMaster, error: newMasterError } = await req.supabase
        .from('events')
        .insert([
          {
            event_title: updateEventObj['calendar-title'],
            event_description: updateEventObj['calendar-description'],
            all_day: updateEventObj.allDay,
            start_date: occurrenceDate,
            end_date: updateEventObj.endDate,
            start_time: updateEventObj.startTime,
            end_time: updateEventObj.endTime,
            groups_id: updateEventObj.tagNames ? parseInt(updateEventObj.tagNames) : null,
            location: updateEventObj.location || null,
            image_url: updateEventObj.image_url || null,
            event_type: updateEventObj.event_type || 'appointment',
            recurrence_rule: eventCheck.recurrence_rule,
            reminder_minutes: updateEventObj.reminder_minutes != null ? parseInt(updateEventObj.reminder_minutes) : null,
            created_by: req.cookies.userId,
          },
        ])
        .select();
      if (newMasterError) return res.status(500).json({ success: false, error: newMasterError.message });

      const newEventId = newMaster[0].event_id;

      // Copy participants (with their existing RSVP responses) onto the new master.
      const { data: masterParts } = await req.supabase
        .from('profiles_events')
        .select('user_id, rsvp_status')
        .eq('event_id', eventId);

      if (masterParts && masterParts.length > 0) {
        const copyRows = masterParts.map(p => ({
          user_id: p.user_id,
          event_id: newEventId,
          rsvp_status: p.rsvp_status,
        }));
        const { error: copyError } = await req.supabase
          .from('profiles_events')
          .upsert(copyRows, { onConflict: 'user_id,event_id' });
        if (copyError) return res.status(500).json({ success: false, error: copyError.message });
      }

      // Overrides at/after the split date belong to the new series → drop them from the old master.
      await req.supabase
        .from('event_overrides')
        .delete()
        .eq('event_id', eventId)
        .gte('occurrence_date', occurrenceDate);

      return res.json({ success: true, scope: 'following' });
    }

    if (eventCheck.recurrence_rule && recurrenceScope === 'this' && req.body.occurrenceDate) {
      const { error: ovError } = await req.supabase
        .from('event_overrides')
        .upsert({
          event_id: eventId,
          occurrence_date: req.body.occurrenceDate,
          is_cancelled: false,
          event_title: updateEventObj['calendar-title'],
          event_description: updateEventObj['calendar-description'],
          start_date: updateEventObj.startDate,
          end_date: updateEventObj.endDate,
          start_time: updateEventObj.startTime,
          end_time: updateEventObj.endTime,
          all_day: updateEventObj.allDay,
        }, { onConflict: 'event_id,occurrence_date' });

      if (ovError) return res.status(500).json({ success: false, error: ovError.message });
      return res.json({ success: true, scope: 'this' });
    }

    const { data: updateEvent, error: updateEventError } = await req.supabase
      .from('events')
      .update({
        event_title: updateEventObj['calendar-title'],
        event_description: updateEventObj['calendar-description'],
        all_day: updateEventObj.allDay,
        start_date: updateEventObj.startDate,
        end_date: updateEventObj.endDate,
        start_time: updateEventObj.startTime,
        end_time: updateEventObj.endTime,
        groups_id: updateEventObj.tagNames ? parseInt(updateEventObj.tagNames) : null,
        location: updateEventObj.location || null,
        image_url: updateEventObj.image_url || null,
        event_type: updateEventObj.event_type || 'appointment',
        recurrence_rule: updateEventObj.recurrence_rule || null,
        reminder_minutes: updateEventObj.reminder_minutes != null ? parseInt(updateEventObj.reminder_minutes) : null,
      })
      .eq('event_id', eventId)
      .select();

    if (updateEventError) {
      return res.status(500).json({ success: false, error: updateEventError.message });
    }

    const { data: existing, error: existingError } = await req.supabase
      .from('profiles_events')
      .select('user_id')
      .eq('event_id', eventId);

    if (existingError) {
      return res.status(500).json({ success: false, error: existingError.message });
    }

    const existingIds = (existing || []).map(p => p.user_id);

    // Editing event details must NOT reset anyone's existing RSVP response.
    // Only ADD newly-invited people (as 'pending'); leave existing rows untouched.
    const toInsert = newParticipants
      .filter(p => p?.userId && !existingIds.includes(p.userId))
      .map(p => ({ user_id: p.userId, event_id: eventId, rsvp_status: 'pending' }));

    if (toInsert.length > 0) {
      const { error: insertError } = await req.supabase
        .from('profiles_events')
        .upsert(toInsert, { onConflict: 'user_id,event_id' });
      if (insertError) {
        return res.status(500).json({ success: false, error: insertError.message });
      }
    }

    const editedTitle = updateEvent?.[0]?.event_title || 'an event';

    // Newly-invited people get an invite; existing participants get a change notice.
    await notifyUsers(req.supabase, toInsert.map((r) => r.user_id), 'event_invite', {
      title: 'New event invite',
      body: `You're invited to "${editedTitle}".`,
      link: '/calendar',
    });
    await notifyUsers(
      req.supabase,
      existingIds.filter((id) => id !== req.cookies.userId),
      'event_changed',
      { title: 'Event updated', body: `"${editedTitle}" was updated.`, link: '/calendar' }
    );

    syncEventToGoogle(parseInt(req.params.eventId), 'upsert');

    return res.json({ success: true, eventData: updateEvent, participants: newParticipants });
  } catch (err) {
    console.error('PUT /parseEvent error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
})

/**
 * PATCH /parseEvent/:eventId
 * Lightweight update for drag-to-reschedule and resize operations.
 * Only updates date/time fields — does not touch title, description, or participants.
 * Body: { startDate, endDate, startTime, endTime, allDay }
 */
router.patch('/parseEvent/:eventId', authRequire, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    if (isNaN(eventId)) return res.status(400).json({ success: false, error: 'Invalid event ID.' });

    const { data: eventCheck, error: eventCheckError } = await req.supabase
      .from('events')
      .select('created_by, groups_id')
      .eq('event_id', eventId)
      .single();

    if (eventCheckError || !eventCheck) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    if (!(await canManageEvent(req.supabase, eventCheck, req.cookies.userId))) {
      return res.status(403).json({ success: false, error: 'You can only edit events you created.' });
    }

    const { startDate, endDate, startTime, endTime, allDay } = req.body;

    const { data: updatedEvent, error: updateError } = await req.supabase
      .from('events')
      .update({
        start_date: startDate,
        end_date: endDate || startDate,
        start_time: allDay ? null : (startTime || null),
        end_time: allDay ? null : (endTime || null),
        all_day: allDay === true || allDay === 'true',
      })
      .eq('event_id', eventId)
      .select();

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    syncEventToGoogle(eventId, 'upsert');

    return res.json({ success: true, eventData: updatedEvent });
  } catch (err) {
    console.error('PATCH /parseEvent error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/parseEvent/:eventId', authRequire, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    if (isNaN(eventId)) return res.status(400).json({ success: false, error: 'Invalid event ID.' });

    const { data: event, error: fetchError } = await req.supabase
      .from('events')
      .select('created_by, event_title, recurrence_rule, groups_id')
      .eq('event_id', eventId)
      .single();

    if (fetchError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    if (!(await canManageEvent(req.supabase, event, req.cookies.userId))) {
      return res.status(403).json({ success: false, error: 'You can only delete events you created.' });
    }

    const scope = req.query.scope || 'all';
    const occurrenceDate = req.query.date || null;

    // Recurring "this occurrence" → cancel just that date via an override.
    if (event.recurrence_rule && scope === 'this' && occurrenceDate) {
      const { error: ovError } = await req.supabase
        .from('event_overrides')
        .upsert({ event_id: eventId, occurrence_date: occurrenceDate, is_cancelled: true },
          { onConflict: 'event_id,occurrence_date' });
      if (ovError) return res.status(500).json({ success: false, error: ovError.message });
      return res.sendStatus(204);
    }

    // Recurring "this and following" → cap the series to end before this date.
    if (event.recurrence_rule && scope === 'following' && occurrenceDate) {
      const newRule = capRuleUntil(event.recurrence_rule, occurrenceDate);
      const { error: capError } = await req.supabase
        .from('events')
        .update({ recurrence_rule: newRule })
        .eq('event_id', eventId);
      if (capError) return res.status(500).json({ success: false, error: capError.message });
      await req.supabase
        .from('event_overrides')
        .delete()
        .eq('event_id', eventId)
        .gte('occurrence_date', occurrenceDate);
      syncEventToGoogle(eventId, 'upsert'); // re-push capped recurrence rule
      return res.sendStatus(204);
    }

    // Capture participants before deletion so we can notify them
    const { data: cancelParts } = await req.supabase
      .from('profiles_events')
      .select('user_id')
      .eq('event_id', eventId);

    // Remove the mirrored Google events first — deleting the event row cascades
    // google_event_links away, losing the ids we need to delete on Google's side.
    await syncEventToGoogle(eventId, 'delete');

    const {error: deleteEventError } = await req.supabase
    .from('events')
    .delete()
    .eq('event_id', eventId)

    if (deleteEventError) {
      return res.status(500).json({success: false, error: deleteEventError.message})
    }

    const {error: deleteProfileError } = await req.supabase
    .from('profiles_events')
    .delete()
    .eq('event_id', eventId)

    if (deleteProfileError) {
      return res.status(500).json({success: false, error: deleteProfileError.message})
    }

    await notifyUsers(
      req.supabase,
      (cancelParts || []).map((p) => p.user_id).filter((id) => id !== req.cookies.userId),
      'event_cancelled',
      { title: 'Event cancelled', body: `"${event.event_title}" was cancelled.`, link: '/calendar' }
    );

    res.sendStatus(204);
    
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
  
})


router.get('/renderEvents', authRequire, async (req, res) => {

  let {data: groupsIds, error: groupsIdsError} = await req.supabase
  .from('groups')
  .select(`groups_id, tag_name, shared_color,
    profiles_groups!inner(
    user_id
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId);

  if (groupsIdsError) {
    return res.status(500).json({success: false, error: groupsIdsError.message})
  }

  let groupsTagNames = {};
  // Build { groupId: tag_name } and { groupId: shared_color } lookups
  const groupSharedColorMap = {};
  groupsIds.forEach(g => {
    if (g.tag_name !== null) groupsTagNames[g.groups_id] = g.tag_name;
    groupSharedColorMap[g.groups_id] = g.shared_color || '#6B7280';
  });

  const groupIdArray = groupsIds.map(g => g.groups_id);

  // Group ids where the viewer is an admin — used to grant manage rights on group events.
  const { data: adminMemberships } = await req.supabase
    .from('profiles_groups')
    .select('groups_id, role')
    .eq('user_id', req.cookies.userId)
    .eq('invite_status', 'accepted');
  const adminGroupSet = new Set(
    (adminMemberships || []).filter(m => m.role === 'admin').map(m => m.groups_id)
  );

  // Fetch member colors for all groups upfront — avoids N+1 queries
  const { data: memberColors } = await req.supabase
    .from('profiles_groups')
    .select('user_id, groups_id, color')
    .in('groups_id', groupIdArray)
    .eq('invite_status', 'accepted');

  // Build { groupId: { userId: color } } lookup
  const memberColorMap = {};
  (memberColors || []).forEach(m => {
    if (!memberColorMap[m.groups_id]) memberColorMap[m.groups_id] = {};
    memberColorMap[m.groups_id][m.user_id] = m.color;
  });

  let { data: userEvents, error: userEventsError} = await req.supabase.
  from('events')
  .select(`*,
    profiles_events(
      user_id,
      rsvp_status,
      profiles(
      username
      )
    )`)
  .eq('profiles_events.user_id', req.cookies.userId)
  .is('groups_id', null);

  if (userEventsError) {
    console.warn('Could not retrieve any of the events specifically to the user.', userEventsError)
  }

  let {data: events, error: errorEvents} = await req.supabase
  .from('events')
  .select(`
    *,
    profiles_events(
    user_id,
    rsvp_status,
    profiles(
    username
    )
    )
    `)
  .in('groups_id', groupIdArray);

  if (errorEvents) {
    return res.status(400).json({success: false, error: errorEvents.message})
  }

  const combinedEvents = [...events, ...(userEvents ?? [])];

  // Expand recurring masters into concrete occurrences within a bounded window.
  const recurringIds = combinedEvents.filter(e => e.recurrence_rule).map(e => e.event_id);
  let overridesByEvent = {};
  if (recurringIds.length > 0) {
    const { data: overrides } = await req.supabase
      .from('event_overrides')
      .select('*')
      .in('event_id', recurringIds);
    (overrides || []).forEach(o => {
      (overridesByEvent[o.event_id] ||= []).push(o);
    });
  }

  const windowStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const expandedEvents = [];
  for (const e of combinedEvents) {
    if (e.recurrence_rule) {
      expandedEvents.push(...expandRecurringEvent(e, windowStart, windowEnd, overridesByEvent[e.event_id] || []));
    } else {
      expandedEvents.push(e);
    }
  }

  // Fetch pact data for locked events
  let pactByEventId = {};
  const lockedEvents = combinedEvents.filter(e => e.status === 'locked' && e.pact_id);
  if (lockedEvents.length > 0) {
    const pactIds = [...new Set(lockedEvents.map(e => e.pact_id))];
    const { data: pactsData } = await supabaseAdmin
      .from('pacts')
      .select('pact_id, completions_count, target_completions, ends_at, status')
      .in('pact_id', pactIds);
    (pactsData || []).forEach(p => {
      lockedEvents.filter(e => e.pact_id === p.pact_id).forEach(e => {
        pactByEventId[e.event_id] = p;
      });
    });
  }

  // Collect tentative event IDs so we can batch-fetch their options and votes
  const tentativeEventIds = combinedEvents
    .filter(e => e.status === 'tentative')
    .map(e => e.event_id);

  // Fetch date options and votes for all tentative events in parallel
  let optionsByEvent = {};
  let votesByEvent = {};
  let voterProfileMap = {};

  if (tentativeEventIds.length > 0) {
    const [optionsResult, votesResult] = await Promise.all([
      supabaseAdmin
        .from('event_date_options')
        .select('*')
        .in('event_id', tentativeEventIds)
        .order('position'),
      supabaseAdmin
        .from('event_date_votes')
        .select('*')
        .in('event_id', tentativeEventIds),
    ]);

    (optionsResult.data || []).forEach(o => {
      (optionsByEvent[o.event_id] ||= []).push(o);
    });

    const allVotes = votesResult.data || [];
    allVotes.forEach(v => {
      (votesByEvent[v.event_id] ||= []).push(v);
    });

    // Fetch usernames for all voters at once (guests have a null user_id — skip them here)
    const voterIds = [...new Set(allVotes.map(v => v.user_id).filter(Boolean))];
    if (voterIds.length > 0) {
      const { data: voterProfiles } = await supabaseAdmin
        .from('profiles')
        .select('user_id, username')
        .in('user_id', voterIds);
      (voterProfiles || []).forEach(p => { voterProfileMap[p.user_id] = p.username; });
    }
  }

  // Fetch accepted member counts per group (for totalGroupMembers)
  let groupMemberCountMap = {};
  if (groupIdArray.length > 0) {
    const { data: memberCounts } = await supabaseAdmin
      .from('profiles_groups')
      .select('groups_id, user_id')
      .in('groups_id', groupIdArray)
      .eq('invite_status', 'accepted');
    (memberCounts || []).forEach(m => {
      groupMemberCountMap[m.groups_id] = (groupMemberCountMap[m.groups_id] || 0) + 1;
    });
  }

  try {
      const filteredEvents = expandedEvents.map((e) => {
        let start_date, end_date;

        const hasStartTime = e.start_time != null && e.start_time.trim().length >= 5;
        const hasEndTime = e.end_time != null && e.end_time.trim().length >= 5;

        if (e.all_day || !hasStartTime) {
          start_date = e.start_date;
          end_date = e.end_date;
        } else if (!hasEndTime) {
          // Start-time-only event: show at specific time, no forced end
          start_date = `${e.start_date}T${e.start_time.substring(0, 5)}`;
          end_date = null;
        } else {
          start_date = `${e.start_date}T${e.start_time.substring(0, 5)}`;
          end_date = `${e.end_date}T${e.end_time.substring(0, 5)}`;
        }

        const participants = e.profiles_events.map((p) => {
          return {username: p.profiles.username, userId: p.user_id, rsvpStatus: p.rsvp_status};
        });

        let eventColor;
        if (!e.groups_id) {
          eventColor = '#3D82F6';
        } else if (participants.length === 1) {
          eventColor = memberColorMap[e.groups_id]?.[participants[0].userId] || '#3D82F6';
        } else {
          // Multiple attendees — use the group's shared color
          eventColor = groupSharedColorMap[e.groups_id] || '#6B7280';
        }

        const isRecurringInstance = !!e._isRecurringInstance;

        // Build tentative voting data when applicable
        const isTentative = e.status === 'tentative';
        let dateOptionsData = undefined;
        let myVotes = null;

        if (isTentative) {
          const eventVotes = votesByEvent[e.event_id] || [];
          const eventOptions = optionsByEvent[e.event_id] || [];

          // This user's availability per option: { [optionId]: 'yes'|'maybe'|'no' }
          myVotes = {};
          eventVotes.forEach(v => {
            if (v.user_id === req.cookies.userId) myVotes[v.option_id] = v.availability;
          });

          dateOptionsData = eventOptions.map(opt => {
            const optVotes = eventVotes.filter(v => v.option_id === opt.option_id);
            const yesCount = optVotes.filter(v => v.availability === 'yes').length;
            const maybeCount = optVotes.filter(v => v.availability === 'maybe').length;
            const noCount = optVotes.filter(v => v.availability === 'no').length;
            return {
              optionId: opt.option_id,
              startDate: opt.start_date,
              startTime: opt.start_time ? opt.start_time.slice(0, 5) : null,
              endDate: opt.end_date || null,
              endTime: opt.end_time ? opt.end_time.slice(0, 5) : null,
              position: opt.position,
              votes: optVotes.map(v => ({
                // Guests have no user_id — give them a stable synthetic id (so the
                // voter-count Set doesn't collapse every guest into one) and show
                // their chosen display name.
                userId: v.user_id || `guest:${v.guest_token}`,
                username: v.user_id ? (voterProfileMap[v.user_id] || null) : (v.guest_name || 'Guest'),
                availability: v.availability,
              })),
              yesCount,
              maybeCount,
              noCount,
              // voteCount kept as the "yes" tally for existing progress-bar callers
              voteCount: yesCount,
            };
          });
        }

        return {
          // Occurrences need a unique id; the master id is kept separately for editing
          id: isRecurringInstance ? `${e.event_id}::${e._occurrenceDate}` : e.event_id,
          title: e.event_title,
          start: start_date,
          end: end_date ?? undefined,
          backgroundColor: eventColor,
          borderColor: eventColor,
          // Recurring instances aren't drag/resizable; nor are read-only Google imports.
          editable: !isRecurringInstance && e.external_source !== 'google',
          extendedProps : {
            description: e.event_description,
            participants: participants,
            groupName: groupsTagNames?.[e.groups_id] || '',
            groupsId: e.groups_id || '',
            location: e.location || null,
            imageUrl: e.image_url || null,
            eventType: e.event_type || 'appointment',
            createdBy: e.created_by || null,
            publicToken: e.public_token || null,
            recurrenceRule: e.recurrence_rule || null,
            isRecurring: !!e.recurrence_rule,
            recurringEventId: e.event_id,
            occurrenceDate: e._occurrenceDate || null,
            canManage: e.external_source !== 'google' && (e.created_by === req.cookies.userId || adminGroupSet.has(e.groups_id)),
            reminderMinutes: e.reminder_minutes ?? null,
            status: e.status || 'confirmed',
            externalSource: e.external_source || null,
            ...(isTentative && {
              dateOptions: dateOptionsData,
              myVotes,
              totalGroupMembers: groupMemberCountMap[e.groups_id] || 0,
            }),
            ...(e.status === 'locked' && pactByEventId[e.event_id] && {
              pactId: pactByEventId[e.event_id].pact_id,
              pactCompletionsCount: pactByEventId[e.event_id].completions_count,
              pactTargetCompletions: pactByEventId[e.event_id].target_completions,
              pactEndsAt: pactByEventId[e.event_id].ends_at,
            }),
          }
        }
      })
      res.json({success: true, events: filteredEvents, groupsTagNames: groupsTagNames});
    } catch (error) {
      res.status(500).json({success: false, error: error.message});
    }

});

router.get('/retrieveUsersSelectedGroup', authRequire, async (req, res) => {
  const groupId = parseInt(req.query.groupId);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid group ID.' });

  const {data: groupUsers, error: groupUsersError } = await req.supabase
  .from('profiles_groups')
  .select(
  `
    user_id,
    profiles!inner(
    username
    )
  `)
  .eq('groups_id', groupId);

  if (groupUsersError) {
    return res.status(500).json({success: false, error: groupUsersError.message})
  };

  const selectUser = groupUsers.map((u) => {
    return {
      userId: u.user_id,
      username: u?.profiles?.username || []
    }
  });

  return res.json({success: true, selectUser: selectUser});
})

/**
 * PATCH /api/rsvp/:eventId
 * Updates the current user's RSVP status for an event.
 * Body: { status: 'going' | 'maybe' | 'no' }
 */
router.patch('/rsvp/:eventId', authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId)
  if (isNaN(eventId)) return res.status(400).json({ success: false, error: 'Invalid event ID.' })

  const { status } = req.body
  if (!['going', 'maybe', 'no'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid RSVP status.' })
  }

  const { data, error } = await req.supabase
    .from('profiles_events')
    .update({ rsvp_status: status })
    .eq('event_id', eventId)
    .eq('user_id', req.cookies.userId)
    .select()

  if (error) return res.status(500).json({ success: false, error: error.message })
  if (!data || data.length === 0) {
    // User not yet a participant — insert them
    const { error: insertError } = await req.supabase
      .from('profiles_events')
      .insert({ event_id: eventId, user_id: req.cookies.userId, rsvp_status: status })
    if (insertError) return res.status(500).json({ success: false, error: insertError.message })
  }

  // Notify the event's creator that someone responded (not for your own events)
  const { data: ev } = await req.supabase
    .from('events')
    .select('created_by, event_title')
    .eq('event_id', eventId)
    .single();

  if (ev?.created_by && ev.created_by !== req.cookies.userId) {
    const { data: me } = await req.supabase
      .from('profiles')
      .select('username')
      .eq('user_id', req.cookies.userId)
      .single();
    const label = status === 'no' ? "can't go" : status;
    await notifyUsers(req.supabase, [ev.created_by], 'rsvp_reply', {
      title: 'RSVP update',
      body: `${me?.username || 'Someone'} replied "${label}" to "${ev.event_title}".`,
      link: '/calendar',
    });
  }

  return res.json({ success: true, status })
})

/**
 * GET /api/e/:token
 * PUBLIC — no auth required. Returns non-sensitive event details for sharing.
 * Looks up by public_token (random UUID) so event IDs can't be enumerated.
 * Uses supabaseAdmin to bypass RLS (the events table requires auth.uid()).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/e/:token', async (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('event_id, event_title, event_description, start_date, start_time, end_date, end_time, all_day, location, groups_id, created_by, status')
    .eq('public_token', token)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  // For tentative events, surface the candidate date slots + availability tallies
  // so guests can vote on the public page. Mirrors renderEvents' aggregation.
  let dateOptions = null;
  if (event.status === 'tentative') {
    const [optsResult, votesResult] = await Promise.all([
      supabaseAdmin.from('event_date_options').select('*').eq('event_id', event.event_id).order('position'),
      supabaseAdmin.from('event_date_votes').select('option_id, availability').eq('event_id', event.event_id),
    ]);
    const allVotes = votesResult.data || [];
    dateOptions = (optsResult.data || []).map(opt => {
      const optVotes = allVotes.filter(v => v.option_id === opt.option_id);
      return {
        optionId: opt.option_id,
        startDate: opt.start_date,
        startTime: opt.start_time ? opt.start_time.slice(0, 5) : null,
        endDate: opt.end_date || null,
        endTime: opt.end_time ? opt.end_time.slice(0, 5) : null,
        position: opt.position,
        yesCount: optVotes.filter(v => v.availability === 'yes').length,
        maybeCount: optVotes.filter(v => v.availability === 'maybe').length,
        noCount: optVotes.filter(v => v.availability === 'no').length,
      };
    });
  }

  // Fetch group name, organiser username, and going-count in parallel
  const [groupResult, organiserResult, rsvpResult] = await Promise.all([
    event.groups_id
      ? supabaseAdmin
          .from('groups')
          .select('groups_title')
          .eq('groups_id', event.groups_id)
          .single()
      : Promise.resolve({ data: null, error: null }),

    event.created_by
      ? supabaseAdmin
          .from('profiles')
          .select('username')
          .eq('user_id', event.created_by)
          .single()
      : Promise.resolve({ data: null, error: null }),

    supabaseAdmin
      .from('profiles_events')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', event.event_id)
      .eq('rsvp_status', 'going'),
  ]);

  return res.json({
    success: true,
    event: {
      title: event.event_title,
      description: event.event_description || null,
      startDate: event.start_date,
      startTime: event.start_time ? event.start_time.slice(0, 5) : null,
      endDate: event.end_date,
      endTime: event.end_time ? event.end_time.slice(0, 5) : null,
      allDay: event.all_day,
      location: event.location || null,
      groupName: groupResult.data?.groups_title || null,
      organiserUsername: organiserResult.data?.username || null,
      goingCount: rsvpResult.count ?? 0,
      status: event.status,
      dateOptions,
    },
  });
});

/**
 * POST /api/e/:token/vote
 * PUBLIC — no auth. Lets a guest (no account) cast availability on one candidate
 * slot of a tentative event reached via its share link.
 * Body: { optionId, availability: 'yes'|'maybe'|'no'|'clear', guestToken?, guestName, guestEmail? }
 *   - No guestToken on first vote → the server mints one and returns it; the
 *     client stores it so the guest can edit their answers later.
 *   - 'clear' retracts this slot's answer (deletes the row).
 * Rate-limited to blunt ballot-stuffing; one row per (event, option, guest_token).
 */
router.post('/e/:token/vote', publicVoteLimiter, async (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  const optionId = parseInt(req.body.optionId);
  const availability = req.body.availability;
  const guestName = (req.body.guestName || '').toString().trim().slice(0, 80);
  const guestEmail = (req.body.guestEmail || '').toString().trim().slice(0, 254) || null;
  let guestToken = (req.body.guestToken || '').toString().trim();

  if (isNaN(optionId)) {
    return res.status(400).json({ success: false, error: 'Invalid optionId.' });
  }
  if (availability !== 'clear' && !VOTE_AVAILABILITY.includes(availability)) {
    return res.status(400).json({ success: false, error: 'Invalid availability.' });
  }
  if (!guestToken && !guestName) {
    return res.status(400).json({ success: false, error: 'A name is required to vote.' });
  }
  if (guestToken && !UUID_RE.test(guestToken)) {
    return res.status(400).json({ success: false, error: 'Invalid guest token.' });
  }

  // Resolve the tentative event from the public token.
  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('event_id, status')
    .eq('public_token', token)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }
  if (event.status !== 'tentative') {
    return res.status(400).json({ success: false, error: 'Voting is closed for this event.' });
  }

  // The option must belong to this event (stops cross-event tampering).
  const { data: option } = await supabaseAdmin
    .from('event_date_options')
    .select('option_id')
    .eq('option_id', optionId)
    .eq('event_id', event.event_id)
    .maybeSingle();

  if (!option) {
    return res.status(404).json({ success: false, error: 'Date option not found.' });
  }

  // First vote from this guest → mint a token they'll store and reuse.
  if (!guestToken) guestToken = crypto.randomUUID();

  if (availability === 'clear') {
    const { error: delError } = await supabaseAdmin
      .from('event_date_votes')
      .delete()
      .eq('event_id', event.event_id)
      .eq('option_id', optionId)
      .eq('guest_token', guestToken);
    if (delError) {
      return res.status(500).json({ success: false, error: delError.message });
    }
    return res.json({ success: true, guestToken, optionId, availability: null });
  }

  const row = { event_id: event.event_id, option_id: optionId, guest_token: guestToken, availability, guest_name: guestName || undefined };
  if (guestEmail) row.guest_email = guestEmail;

  const { error: voteError } = await supabaseAdmin
    .from('event_date_votes')
    .upsert(row, { onConflict: 'event_id,option_id,guest_token' });

  if (voteError) {
    return res.status(500).json({ success: false, error: voteError.message });
  }

  return res.json({ success: true, guestToken, optionId, availability });
});

/**
 * GET /api/e/:token/my-votes?guestToken=...
 * PUBLIC — returns a returning guest's prior answers so the page can pre-fill them.
 * Body-less; { [optionId]: 'yes'|'maybe'|'no' }.
 */
router.get('/e/:token/my-votes', async (req, res) => {
  const { token } = req.params;
  const guestToken = (req.query.guestToken || '').toString();
  if (!UUID_RE.test(token) || !UUID_RE.test(guestToken)) {
    return res.json({ success: true, votes: {} });
  }

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('event_id')
    .eq('public_token', token)
    .single();
  if (!event) return res.json({ success: true, votes: {} });

  const { data: rows } = await supabaseAdmin
    .from('event_date_votes')
    .select('option_id, availability')
    .eq('event_id', event.event_id)
    .eq('guest_token', guestToken);

  const votes = {};
  (rows || []).forEach(r => { votes[r.option_id] = r.availability; });
  return res.json({ success: true, votes });
});

/**
 * POST /api/voteEventDate
 * Set this user's availability for a single candidate date slot on a tentative
 * event. Multi-slot: a user can mark every option independently.
 * Body: { eventId: number, optionId: number, availability: 'yes'|'maybe'|'no'|'clear' }
 *   - 'clear' retracts the answer (deletes the row) so the slot reads "no opinion".
 */
const VOTE_AVAILABILITY = ['yes', 'maybe', 'no'];

router.post('/voteEventDate', authRequire, async (req, res) => {
  const eventId = parseInt(req.body.eventId);
  const optionId = parseInt(req.body.optionId);
  const availability = req.body.availability;

  if (isNaN(eventId) || isNaN(optionId)) {
    return res.status(400).json({ success: false, error: 'Invalid eventId or optionId.' });
  }
  if (availability !== 'clear' && !VOTE_AVAILABILITY.includes(availability)) {
    return res.status(400).json({ success: false, error: 'Invalid availability.' });
  }

  // Verify event exists and is tentative
  const { data: event, error: eventError } = await req.supabase
    .from('events')
    .select('event_id, status, groups_id')
    .eq('event_id', eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }
  if (event.status !== 'tentative') {
    return res.status(400).json({ success: false, error: 'Event is not tentative.' });
  }

  // Verify caller is an accepted group member
  if (event.groups_id) {
    const { data: membership } = await req.supabase
      .from('profiles_groups')
      .select('user_id')
      .eq('groups_id', event.groups_id)
      .eq('user_id', req.cookies.userId)
      .eq('invite_status', 'accepted')
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group.' });
    }
  }

  // 'clear' → retract this slot's answer; otherwise upsert the availability.
  // One row per (event, option, user) so every slot can be answered independently.
  if (availability === 'clear') {
    const { error: delError } = await supabaseAdmin
      .from('event_date_votes')
      .delete()
      .eq('event_id', eventId)
      .eq('option_id', optionId)
      .eq('user_id', req.cookies.userId);
    if (delError) {
      return res.status(500).json({ success: false, error: delError.message });
    }
    return res.json({ success: true, optionId, availability: null });
  }

  const { error: voteError } = await supabaseAdmin
    .from('event_date_votes')
    .upsert(
      { event_id: eventId, option_id: optionId, user_id: req.cookies.userId, availability },
      { onConflict: 'event_id,option_id,user_id' }
    );

  if (voteError) {
    return res.status(500).json({ success: false, error: voteError.message });
  }

  return res.json({ success: true, optionId, availability });
});

/**
 * POST /api/events/:eventId/date-options
 * Any accepted group member can propose an additional candidate slot on a
 * tentative event (up to MAX_DATE_OPTIONS). The proposer is auto-marked 'yes'
 * on the new slot, and other members are notified to come vote it.
 * Body: { startDate: 'YYYY-MM-DD', startTime?, endDate?, endTime? }
 */
router.post('/events/:eventId/date-options', authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event ID.' });
  }
  const { startDate, startTime, endDate, endTime } = req.body;
  if (!startDate) {
    return res.status(400).json({ success: false, error: 'A start date is required.' });
  }

  // Event must exist and be tentative
  const { data: event, error: eventError } = await req.supabase
    .from('events')
    .select('event_id, event_title, status, groups_id')
    .eq('event_id', eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }
  if (event.status !== 'tentative') {
    return res.status(400).json({ success: false, error: 'Event is not tentative.' });
  }

  // Caller must be an accepted member of the event's group
  if (event.groups_id) {
    const { data: membership } = await req.supabase
      .from('profiles_groups')
      .select('user_id')
      .eq('groups_id', event.groups_id)
      .eq('user_id', req.cookies.userId)
      .eq('invite_status', 'accepted')
      .maybeSingle();
    if (!membership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group.' });
    }
  }

  // Enforce the slot cap
  const { count: existingCount } = await supabaseAdmin
    .from('event_date_options')
    .select('option_id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  if ((existingCount || 0) >= MAX_DATE_OPTIONS) {
    return res.status(400).json({ success: false, error: `A doodle can have at most ${MAX_DATE_OPTIONS} date options.` });
  }

  // Insert the new option at the next position
  const { data: option, error: optionError } = await supabaseAdmin
    .from('event_date_options')
    .insert({
      event_id: eventId,
      start_date: startDate,
      start_time: startTime || null,
      end_date: endDate || null,
      end_time: endTime || null,
      position: existingCount || 0,
    })
    .select()
    .single();

  if (optionError) {
    return res.status(500).json({ success: false, error: optionError.message });
  }

  // Proposer is available on the slot they added
  await supabaseAdmin
    .from('event_date_votes')
    .upsert(
      { event_id: eventId, option_id: option.option_id, user_id: req.cookies.userId, availability: 'yes' },
      { onConflict: 'event_id,option_id,user_id' }
    );

  // Notify other accepted members so they come vote the new slot
  if (event.groups_id) {
    try {
      const { data: members } = await req.supabase
        .from('profiles_groups')
        .select('user_id')
        .eq('groups_id', event.groups_id)
        .eq('invite_status', 'accepted');
      const recipientIds = (members || [])
        .map(m => m.user_id)
        .filter(id => id !== req.cookies.userId);
      if (recipientIds.length > 0) {
        await notifyUsers(req.supabase, recipientIds, 'event_invite', {
          title: 'New date to vote on',
          body: `A new date was added to "${event.event_title}"`,
          link: `/groups/${event.groups_id}`,
        });
      }
    } catch (notifyError) {
      console.warn('Add-date-option notification failed:', notifyError.message);
    }
  }

  return res.json({
    success: true,
    option: {
      optionId: option.option_id,
      startDate: option.start_date,
      startTime: option.start_time ? option.start_time.slice(0, 5) : null,
      endDate: option.end_date || null,
      endTime: option.end_time ? option.end_time.slice(0, 5) : null,
      position: option.position,
      votes: [{ userId: req.cookies.userId, username: null, availability: 'yes' }],
      yesCount: 1,
      maybeCount: 0,
      noCount: 0,
      voteCount: 1,
    },
  });
});

/**
 * POST /api/confirmEventDate
 * Creator confirms a winning date option, locking the event as confirmed.
 * Body: { eventId: number, optionId: number }
 */
router.post('/confirmEventDate', authRequire, async (req, res) => {
  const eventId = parseInt(req.body.eventId);
  const optionId = parseInt(req.body.optionId);

  if (isNaN(eventId) || isNaN(optionId)) {
    return res.status(400).json({ success: false, error: 'Invalid eventId or optionId.' });
  }

  // Verify caller is the event creator
  const { data: event, error: eventError } = await req.supabase
    .from('events')
    .select('event_id, event_title, status, groups_id, created_by')
    .eq('event_id', eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }
  if (event.created_by !== req.cookies.userId) {
    return res.status(403).json({ success: false, error: 'Only the event creator can confirm a date.' });
  }
  if (event.status !== 'tentative') {
    return res.status(400).json({ success: false, error: 'Event is already confirmed.' });
  }

  // Fetch the winning option
  const { data: winningOption, error: optionError } = await supabaseAdmin
    .from('event_date_options')
    .select('*')
    .eq('option_id', optionId)
    .eq('event_id', eventId)
    .single();

  if (optionError || !winningOption) {
    return res.status(404).json({ success: false, error: 'Date option not found.' });
  }

  // Update the event to confirmed with the winning dates.
  // events.end_date is NOT NULL but a date option's end_date may be null
  // (single-day slot) — fall back to start_date. all_day follows whether the
  // chosen slot carries a time, so a timed slot no longer renders as all-day.
  const { error: updateError } = await req.supabase
    .from('events')
    .update({
      status: 'confirmed',
      start_date: winningOption.start_date,
      start_time: winningOption.start_time,
      end_date: winningOption.end_date || winningOption.start_date,
      end_time: winningOption.end_time,
      all_day: !winningOption.start_time,
    })
    .eq('event_id', eventId);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  // Notify all accepted group members
  if (event.groups_id) {
    const { data: members } = await supabaseAdmin
      .from('profiles_groups')
      .select('user_id')
      .eq('groups_id', event.groups_id)
      .eq('invite_status', 'accepted');

    const memberIds = (members || [])
      .map(m => m.user_id)
      .filter(id => id !== req.cookies.userId);

    await notifyUsers(req.supabase, memberIds, 'event_changed', {
      title: 'Date confirmed',
      body: `"${event.event_title}" has been confirmed.`,
      link: '/calendar',
    });
  }

  // Now that the event has a real date, mirror it to connected calendars.
  syncEventToGoogle(eventId, 'upsert');

  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

const ALLOWED_EMOJIS = new Set(["👍", "❤️", "🎉", "😂", "😮", "👎"]);

/**
 * GET /api/events/:eventId/reactions
 * Returns aggregated reaction counts and whether the current user reacted.
 */
router.get("/events/:eventId/reactions", authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: "Invalid event ID." });
  }

  const userId = req.cookies.userId;

  const { data: rows, error } = await req.supabase
    .from("event_reactions")
    .select("emoji, user_id")
    .eq("event_id", eventId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  // Group by emoji
  const byEmoji = {};
  for (const row of rows || []) {
    if (!byEmoji[row.emoji]) byEmoji[row.emoji] = { count: 0, iMine: false };
    byEmoji[row.emoji].count++;
    if (row.user_id === userId) byEmoji[row.emoji].iMine = true;
  }

  const reactions = Object.entries(byEmoji).map(([emoji, { count, iMine }]) => ({
    emoji,
    count,
    iMine,
  }));

  return res.json({ reactions });
});

/**
 * POST /api/events/:eventId/reactions
 * Toggle a reaction (insert if absent, delete if present).
 * Body: { emoji }
 */
router.post("/events/:eventId/reactions", authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: "Invalid event ID." });
  }

  const { emoji } = req.body;
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return res.status(400).json({ success: false, error: "Invalid emoji." });
  }

  const userId = req.cookies.userId;

  // Check for existing reaction
  const { data: existing, error: fetchError } = await req.supabase
    .from("event_reactions")
    .select("reaction_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ success: false, error: fetchError.message });

  if (existing) {
    // Toggle off — delete
    const { error: deleteError } = await req.supabase
      .from("event_reactions")
      .delete()
      .eq("reaction_id", existing.reaction_id);

    if (deleteError) return res.status(500).json({ success: false, error: deleteError.message });
    return res.json({ success: true, iMine: false });
  }

  // Toggle on — insert
  const { error: insertError } = await req.supabase
    .from("event_reactions")
    .insert({ event_id: eventId, user_id: userId, emoji });

  if (insertError) return res.status(500).json({ success: false, error: insertError.message });
  return res.json({ success: true, iMine: true });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * GET /api/events/:eventId/comments
 * Returns the 20 most recent comments for an event, oldest first.
 */
router.get("/events/:eventId/comments", authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: "Invalid event ID." });
  }

  const { data: rows, error } = await req.supabase
    .from("event_comments")
    .select("comment_id, body, user_id, created_at, profiles(username)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) return res.status(500).json({ success: false, error: error.message });

  const comments = (rows || []).map((r) => ({
    commentId: r.comment_id,
    body: r.body,
    userId: r.user_id,
    username: r.profiles?.username || null,
    createdAt: r.created_at,
  }));

  return res.json({ comments });
});

/**
 * POST /api/events/:eventId/comments
 * Post a comment and notify other participants.
 * Body: { body }
 */
router.post("/events/:eventId/comments", authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: "Invalid event ID." });
  }

  const { body } = req.body;
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Comment body is required." });
  }
  if (body.length > 1000) {
    return res.status(400).json({ success: false, error: "Comment must be 1000 characters or fewer." });
  }

  const userId = req.cookies.userId;
  const trimmedBody = body.trim();

  // Fetch event to get title and groups_id for notifications
  const { data: event, error: eventError } = await req.supabase
    .from("events")
    .select("event_id, event_title, groups_id")
    .eq("event_id", eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: "Event not found." });
  }

  // Insert comment
  const { data: inserted, error: insertError } = await req.supabase
    .from("event_comments")
    .insert({ event_id: eventId, user_id: userId, body: trimmedBody })
    .select("comment_id, body, user_id, created_at, profiles(username)")
    .single();

  if (insertError) return res.status(500).json({ success: false, error: insertError.message });

  // Collect notification recipients: event participants + group members (if any), minus current user
  const recipientSet = new Set();

  const { data: participants } = await req.supabase
    .from("profiles_events")
    .select("user_id")
    .eq("event_id", eventId);

  (participants || []).forEach((p) => {
    if (p.user_id !== userId) recipientSet.add(p.user_id);
  });

  if (event.groups_id) {
    const { data: members } = await req.supabase
      .from("profiles_groups")
      .select("user_id")
      .eq("groups_id", event.groups_id)
      .eq("invite_status", "accepted");

    (members || []).forEach((m) => {
      if (m.user_id !== userId) recipientSet.add(m.user_id);
    });
  }

  if (recipientSet.size > 0) {
    await notifyUsers(req.supabase, [...recipientSet], "event_comment", {
      title: `New comment on "${event.event_title}"`,
      body: trimmedBody.slice(0, 80),
      link: "/calendar",
    });
  }

  return res.json({
    success: true,
    comment: {
      commentId: inserted.comment_id,
      body: inserted.body,
      userId: inserted.user_id,
      username: inserted.profiles?.username || null,
      createdAt: inserted.created_at,
    },
  });
});

/**
 * DELETE /api/events/:eventId/comments/:commentId
 * Delete a comment the current user owns.
 */
router.delete("/events/:eventId/comments/:commentId", authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  const commentId = parseInt(req.params.commentId, 10);
  if (isNaN(eventId) || isNaN(commentId)) {
    return res.status(400).json({ success: false, error: "Invalid event or comment ID." });
  }

  const { error } = await req.supabase
    .from("event_comments")
    .delete()
    .eq("comment_id", commentId)
    .eq("event_id", eventId)
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.sendStatus(204);
});

export default router;