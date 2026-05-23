import express from "express";
import supabase from "../db/supabase.js";
import authRequire, { createEventObj } from "../utils/utils.js";

const router = express.Router()

router.post("/parseEvent", authRequire, async (req, res) => {

  const insertEventObj = createEventObj(req.body)

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
        groups_id: insertEventObj?.tagNames ? parseInt(insertEventObj?.tagNames) : null 
      },
    ])
    .select();

  if (eventDataError) {
    return res.status(500).json({ success: false, error: eventDataError.message });
  }

  if (eventData[0]['start_time']) eventData[0]['start_time'] = eventData[0]['start_time'].slice(0, -3);
  if (eventData[0]['end_time']) eventData[0]['end_time'] = eventData[0]['end_time'].slice(0, -3);

  if (insertEventObj.participants.length !== 0) {
    const insertUsersArray = insertEventObj.participants.map( (p) => {
      return {
        user_id: p.userId, 
        event_id: eventData[0].event_id,
        rsvp_status: 'accepted'
      }
    })

    const {data: eventUsersInvited, error: eventUsersInvitedError} = await req.supabase
    .from('profiles_events')
    .insert(insertUsersArray)
    .select()

    if (eventUsersInvitedError) {
      return res.status(500).json({ success: false, error: eventUsersInvitedError.message });
    } else {

      const userArray = [];
      insertEventObj.participants.forEach(u => { userArray.push(u.username)});
      
      const participants = eventUsersInvited.map( p => {

        const userMatch = insertEventObj.participants.find(u => u.userId === p.user_id);
        return {username: userMatch.username, userId: p.user_id}
      })

      res.json({ success: true, eventData: eventData, participants: participants });
    } 

  } else {

    const insertUsersArray = [{user_id: req.cookies.userId, event_id: eventData[0].event_id, rsvp_status: 'accepted'}];
    // After adding Event need to update the profiles_event table
    const {data: eventProfile, error: eventProfileError} = await req.supabase
    .from('profiles_events')
    .insert(insertUsersArray)
    .select()

    const {data: user, error: userError} = await req.supabase
    .from('profiles')
    .select('username')
    .eq('user_id', req.cookies.userId)
    .limit(1);

    if (eventProfileError) {
      return res.status(500).json({ success: false, error: eventProfileError.message });
    } else {

    res.json({ success: true, eventData, participants: [{
      username: user[0]?.username,
      userId: req.cookies.userId
    }]});
    } 
  } 

});

router.put('/parseEvent/:eventId', authRequire, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const updateEventObj = createEventObj(req.body);
    const newParticipants = updateEventObj.participants || [];

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
        groups_id: updateEventObj.tagNames ? parseInt(updateEventObj.tagNames) : null
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
    const newIds = newParticipants.map(p => p.userId);

    // Update rsvp_status for everyone already in the table
    if (existingIds.length > 0) {
      const updates = existingIds.map(uid => ({
        user_id: uid,
        event_id: eventId,
        rsvp_status: newIds.includes(uid) ? 'accepted' : 'declined'
      }));
      const { error: upsertError } = await req.supabase
        .from('profiles_events')
        .upsert(updates, { onConflict: 'user_id,event_id' });
      if (upsertError) {
        return res.status(500).json({ success: false, error: upsertError.message });
      }
    }

    // Insert anyone newly added who wasn't in the table at all
    const toInsert = newParticipants
      .filter(p => !existingIds.includes(p.userId))
      .map(p => ({ user_id: p.userId, event_id: eventId, rsvp_status: 'accepted' }));

    if (toInsert.length > 0) {
      const { error: insertError } = await req.supabase
        .from('profiles_events')
        .insert(toInsert);
      if (insertError) {
        return res.status(500).json({ success: false, error: insertError.message });
      }
    }

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
    const eventId = parseInt(req.params.eventId)

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

  try {
      const filteredEvents = combinedEvents.map((e) => {
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
          return {username: p.profiles.username, userId: p.user_id};
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

        return {
          id: e.event_id,
          title: e.event_title,
          start: start_date,
          end: end_date ?? undefined,
          backgroundColor: eventColor,
          borderColor: eventColor,
          extendedProps : {
            description: e.event_description,
            participants: participants,
            groupName: groupsTagNames?.[e.groups_id] || '',
            groupsId: e.groups_id || '',
          }
        }
      })
      res.json({success: true, events: filteredEvents, groupsTagNames: groupsTagNames});
    } catch (error) {
      res.status(500).json({success: false, error: error.message});
    }

});

router.get('/retrieveUsersSelectedGroup', authRequire, async (req, res) => {
  console.log(parseInt(req.query.groupId))
  const {data: groupUsers, error: groupUsersError } = await req.supabase
  .from('profiles_groups')
  .select(
  `
    user_id,
    profiles!inner(
    username
    )
  `)
  .eq('groups_id', parseInt(req.query.groupId));

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

export default router;