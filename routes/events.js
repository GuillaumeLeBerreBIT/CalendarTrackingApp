import express from "express";
import supabase from "../db/supabase.js";
import authRequire, { createEventObj } from "../utils/utils.js";

const router = express.Router()

router.post("/parseEvent", authRequire, async (req, res) => {

  const insertEventObj = createEventObj(req.body)

  const { data: eventData, error: eventDataError } = await supabase
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
    res.status(500).json({ success: false, error: error.message });
  }

  eventData["start_time"] = eventData['start_time'] ? eventData['start_time'].slice(0,-3) : '';
  eventData["end_time"] = eventData['end_time'] ? eventData['end_time'].slice(0,-3) : '';

  if (insertEventObj.participants.length !== 0) {
    const insertUsersArray = insertEventObj.participants.map( (p) => {
      return {
        user_id: p.userId, 
        event_id: eventData[0].event_id,
        rsvp_status: 'accepted'
      }
    })

    const {data: eventUsersInvited, error: eventUsersInvitedError} = await supabase
    .from('profiles_events')
    .insert(insertUsersArray)
    .select()

    if (eventUsersInvitedError) {
      res.status(500).json({ success: false, error: error.message });
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
    const {data: eventProfile, error: eventProfileError} = await supabase
    .from('profiles_events')
    .insert(insertUsersArray)
    .select()

    const {data: user, error: userError} = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', req.cookies.userId)
    .limit(1);

    if (eventProfileError) {
      res.status(500).json({ success: false, error: error.message });
    } else {

    res.json({ success: true, eventData, participants: [{
      username: user[0]?.username,
      userId: req.cookies.userId
    }]});
    } 
  } 

});

router.put('/parseEvent/:eventId', authRequire, async (req, res) => {
  const eventId = parseInt(req.params.eventId);
  const updateEventObj = createEventObj(req.body)

  const {data: updateEvent, error: updateEventError} = await supabase
  .from('events')
  .update({
    event_title: updateEventObj["calendar-title"],
    event_description: updateEventObj["calendar-description"],
    all_day: updateEventObj.allDay,
    start_date: updateEventObj.startDate,
    end_date: updateEventObj.endDate,
    start_time: updateEventObj.startTime,
    end_time: updateEventObj.endTime,
    groups_id: updateEventObj?.tagNames ? parseInt(updateEventObj?.tagNames) : '' 
  })
  .eq('event_id', eventId)
  .select()

  if (updateEventError) {
    return res.status(500).json({success: false, error: updateEventError.message})
  }

  const {data: eventParticipants, error: eventParticipantsError} = await supabase
  .from('profiles_events')
  .select()
  .eq('event_id', eventId);
  
  if (eventParticipantsError) {

    res.status(500).json({success: false, error: eventParticipantsError.message})
  }

  const userIdArray = updateEventObj.participants.map(p => p.userId)

  let updatedParticipants;
  if (eventParticipants) {
    const eventParticipantsUpdated = eventParticipants.map(p => {

      if (userIdArray.includes(p.user_id)) {
        return {
          user_id: p.user_id,
          event_id: eventId,
          rsvp_status: 'accepted',
        }
      } else {
          return {
            user_id: p.user_id,
            event_id: eventId,
            rsvp_status: 'declined',
        }
      }

    })

    const users2Update = eventParticipantsUpdated.map( p => p.user_id)
    updateEventObj.participants.forEach(p => {
      if (!users2Update.includes(p.userId)) {
        eventParticipantsUpdated.push({
          user_id: p.userId,
          event_id: eventId,
          rsvp_status: 'accepted',
        })
      }
    })

    const {data: upsertUsers, error: upsertUsersError} = await supabase
    .from('profiles_events')
    .upsert(eventParticipantsUpdated)
    .select()

    if (upsertUsersError) {
      return res.status(500).json({success: false, error: updateEventError.message})
    }

    updatedParticipants = updateEventObj.participants;

  } else {

    const { data: updateUser, error: updateUserError } = await supabase
    .from('profiles_events')
    .update({
      user_id: req.cookies.userId,
      event_id: eventId,
      rsvp_status: 'accepted',
    })
    .eq('event_id', eventId)
    .select()

    const {data: user, error: userError} = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', req.cookies.userId)
    .limit(1);

    if (eventProfileError) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      updatedParticipants = {
        userId: req.cookies.userId,
        username: user[0].username
      }
    }
  }

  res.json({success: true, eventData: updateEvent, participants: updatedParticipants || []})
})

router.delete('/parseEvent/:eventId', authRequire, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId)

    const {error: deleteEventError } = await supabase
    .from('events')
    .delete()
    .eq('event_id', eventId)

    if (deleteEventError) {
      return res.status(500).json({success: false, error: deleteEventError.message})
    }

    const {error: deleteProfileError } = await supabase
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

  let {data: groupsIds, error: groupsIdsError} = await supabase
  .from('groups')
  .select(`groups_id, tag_name,
    profiles_groups!inner(
    user_id
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId);

  if (groupsIdsError) {
    return res.status(500).json({success: false, error: groupsIdsError.message})
  }

  let groupsTagNames = {};
  groupsIds.filter(g => g.tag_name !== null).forEach(g => {
    groupsTagNames[g.groups_id] = g.tag_name
  })

  const groupIdArray = groupsIds.map(g => g.groups_id);

  let { data: userEvents, error: userEventsError} = await supabase.
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

  let {data: events, error: errorEvents} = await supabase
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

        const hasStartTime = e.start_time != null && e.start_time.length >= 5;
        const hasEndTime = e.end_time != null && e.end_time.length >= 5;
        if (
          e.all_day ||
          !hasStartTime ||
          !hasEndTime ||
          e.start_time === e.end_time ||
          (e.start_time === '00:00' && e.end_time === '00:00')
        ) {
          start_date = `${e.start_date}`;
          end_date   = `${e.end_date}`;

        } else {
          // Normal timed multi-day or single-day
          start_date = `${e.start_date}T${e.start_time.substring(0,5)}`;
          end_date   = `${e.end_date}T${e.end_time.substring(0,5)}`;
        }

        const participants = e.profiles_events.map((p) => {
          return {username: p.profiles.username, userId: p.user_id};
        });

        return {
          id: e.event_id,
          title: e.event_title,
          start: start_date,
          end: end_date,
          backgroundColor: '#4A9D5F', // Need to make it custom
          borderColor: '#4A9D5F',
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
  const {data: groupUsers, error: groupUsersError } = await supabase
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