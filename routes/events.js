import express from "express";
import supabase, { supabaseAdmin } from "../db/supabase.js";
import authRequire, { createEventObj } from "../utils/utils.js";
import { notifyUsers } from "../utils/notifications.js";
import { expandRecurringEvent, capRuleUntil } from "../utils/recurrence.js";

const router = express.Router()

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

router.post("/parseEvent", authRequire, async (req, res) => {

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
    const optionRows = dateOptions.slice(0, 4).map((opt, i) => ({
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
      return res.sendStatus(204);
    }

    // Capture participants before deletion so we can notify them
    const { data: cancelParts } = await req.supabase
      .from('profiles_events')
      .select('user_id')
      .eq('event_id', eventId);

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

    // Fetch usernames for all voters at once
    const voterIds = [...new Set(allVotes.map(v => v.user_id))];
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
        let myVote = null;

        if (isTentative) {
          const eventVotes = votesByEvent[e.event_id] || [];
          const eventOptions = optionsByEvent[e.event_id] || [];

          // Find this user's current vote
          const myVoteRow = eventVotes.find(v => v.user_id === req.cookies.userId);
          myVote = myVoteRow ? myVoteRow.option_id : null;

          dateOptionsData = eventOptions.map(opt => {
            const optVotes = eventVotes.filter(v => v.option_id === opt.option_id);
            return {
              optionId: opt.option_id,
              startDate: opt.start_date,
              startTime: opt.start_time ? opt.start_time.slice(0, 5) : null,
              endDate: opt.end_date || null,
              endTime: opt.end_time ? opt.end_time.slice(0, 5) : null,
              position: opt.position,
              votes: optVotes.map(v => ({
                userId: v.user_id,
                username: voterProfileMap[v.user_id] || null,
              })),
              voteCount: optVotes.length,
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
          // Recurring instances aren't drag/resizable (ambiguous which occurrences to move)
          editable: !isRecurringInstance,
          extendedProps : {
            description: e.event_description,
            participants: participants,
            groupName: groupsTagNames?.[e.groups_id] || '',
            groupsId: e.groups_id || '',
            location: e.location || null,
            imageUrl: e.image_url || null,
            eventType: e.event_type || 'appointment',
            createdBy: e.created_by || null,
            recurrenceRule: e.recurrence_rule || null,
            isRecurring: !!e.recurrence_rule,
            recurringEventId: e.event_id,
            occurrenceDate: e._occurrenceDate || null,
            canManage: e.created_by === req.cookies.userId || adminGroupSet.has(e.groups_id),
            reminderMinutes: e.reminder_minutes ?? null,
            status: e.status || 'confirmed',
            ...(isTentative && {
              dateOptions: dateOptionsData,
              myVote,
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
 * GET /api/e/:eventId
 * PUBLIC — no auth required. Returns non-sensitive event details for sharing.
 * Uses supabaseAdmin to bypass RLS (the events table requires auth.uid()).
 */
router.get('/e/:eventId', async (req, res) => {
  const eventId = parseInt(req.params.eventId);
  if (isNaN(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event ID.' });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('event_id, event_title, event_description, start_date, start_time, end_date, end_time, all_day, location, groups_id, created_by')
    .eq('event_id', eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
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
      .eq('event_id', eventId)
      .eq('rsvp_status', 'going'),
  ]);

  return res.json({
    success: true,
    event: {
      eventId: event.event_id,
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
    },
  });
});

/**
 * POST /api/voteEventDate
 * Cast or change a vote for a candidate date slot on a tentative event.
 * Body: { eventId: number, optionId: number }
 */
router.post('/voteEventDate', authRequire, async (req, res) => {
  const eventId = parseInt(req.body.eventId);
  const optionId = parseInt(req.body.optionId);

  if (isNaN(eventId) || isNaN(optionId)) {
    return res.status(400).json({ success: false, error: 'Invalid eventId or optionId.' });
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

  // Upsert vote — one per user per event, option can change
  const { error: voteError } = await supabaseAdmin
    .from('event_date_votes')
    .upsert(
      { event_id: eventId, option_id: optionId, user_id: req.cookies.userId },
      { onConflict: 'event_id,user_id' }
    );

  if (voteError) {
    return res.status(500).json({ success: false, error: voteError.message });
  }

  return res.json({ success: true, optionId });
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

  // Update the event to confirmed with the winning dates
  const { error: updateError } = await req.supabase
    .from('events')
    .update({
      status: 'confirmed',
      start_date: winningOption.start_date,
      start_time: winningOption.start_time,
      end_date: winningOption.end_date,
      end_time: winningOption.end_time,
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