import supabase, { createUserClient} from "../db/supabase.js";

export default async function authRequire (req, res, next) {
  const supaToken = req.cookies.authCookie;

  if (!supaToken) {

    if (!req.cookies.refreshToken) {
      res.clearCookie('expiresAt');
      return res.redirect("/login");
    }

    try {
      const { user, accessToken } = await refreshSession(req, res)
      req.user = user
      req.supabase = createUserClient(accessToken)
      return next()

    } catch (error) {
      res.clearCookie("authCookie");
      res.clearCookie("userId");
      res.clearCookie('refreshToken');
      res.clearCookie('expiresAt');
      return res.redirect("/login");
    }
  }

  const { data, error } = await supabase.auth.getUser(supaToken);

  if (error || !data.user) {

    try {
      const { user, accessToken } = await refreshSession(req, res);
      req.user = user;
      req.supabase = createUserClient(accessToken)
      return next();

    } catch (error) {
      res.clearCookie("authCookie");
      res.clearCookie("userId");
      res.clearCookie('refreshToken');
      res.clearCookie('expiresAt');
      return res.redirect("/login");
    }
  }
  // Proactively refresh if token expires within 30 minutes
  const expiresAt = parseInt(req.cookies.expiresAt || '0');
  const thirtyMinFromNow = Math.floor(Date.now() / 1000) + 30 * 60;
  if (expiresAt && expiresAt < thirtyMinFromNow && req.cookies.refreshToken) {
    try {
      const { user: freshUser, accessToken: freshToken } = await refreshSession(req, res);
      req.user = freshUser;
      req.supabase = createUserClient(freshToken);
      return next();
    } catch (_) {
      // Fall through to use existing valid token
    }
  }

  req.supabase = createUserClient(supaToken)
  req.user = data.user;
  return next();
};

async function refreshSession(req, res) {
  if (!req.cookies.refreshToken) throw new Error('Could not find a refresh token from the cookies.')

  const {data: refreshSes, error: refreshSesError} = await supabase.auth.refreshSession({refresh_token: req.cookies.refreshToken});

  if (refreshSesError) throw new Error('Could not retrieve a bearer token for the user.')
  
  try{
    const {session, user} = refreshSes

    res.cookie("authCookie", session.access_token, {
        maxAge: 3 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
      });

    res.cookie('refreshToken', session.refresh_token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('userId', user.id, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    })

    return { user, accessToken: session.access_token }
  } catch (error) {
    throw new Error('Could not set the cookies for the User.')
  }
}

export function validatePassword (password) {

    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*/]/.test(password)

    if (password.length < minLength) {

        return [false, 'Password is too short. Please provide a password with at least 8 characters.']
    } 

    if (!hasUpper) {
        return [false, 'Provide at least one capital.']
    } 
    if (!hasNumber) {
        return [false, 'Provide at least one number.']
    }

    if (!hasSpecialChar) {
        return [false, 'Use at least one special character: !@#$%^&*']
    }

    return [true, null]

};

export function createEventObj (events) {

    let eventObj = {}
    for (const [key, val] of Object.entries(events)) {
        eventObj[key] = val
    }

    // Normalize checkbox value ('on' when checked, false/absent when not) to boolean
    eventObj.allDay = eventObj.allDay === 'on' || eventObj.allDay === true;

    // No start time → treat as all-day regardless of checkbox state
    if (!eventObj.startTime) {
        eventObj.allDay = true;
    }

    if (eventObj.allDay) {
        eventObj.startTime = null;
        eventObj.endTime = null;
    } else {
        // Start time present; normalize empty end time to null (allows start-only events)
        eventObj.endTime = eventObj.endTime || null;
    }

    return eventObj
}

export async function retrieveTodoLists(groupId, client = supabase) {

  try {
    const {data: todoLists, error: todoListsError} = await client
    .from('task_list')
    .select('*')
    .eq('groups_id', groupId);

    if (todoListsError) {
      console.log(`Couldn't retrieve any ToDo lists for groups Id: ${groupId}`)
      return [];
    }

    return todoLists
  } catch (error) {
    console.log(`Couldn't retrieve any ToDo lists for groups Id: ${groupId}`)
    return []
  }
}

export async function retrieveEvents(groupId, client = supabase) {

  try {
    const {data: events, error: eventsError} = await client
    .from('events')
    .select(`
      event_title, event_description, all_day,
      groups_id, start_date,
      end_date, start_time, end_time
      `)
    .eq('groups_id', groupId);

    if (eventsError) {
      console.log(`Couldn't retrieve any Events for groups Id: ${groupId}`)
      return [];
    }

    return events
  } catch (error) {
    console.log(`Couldn't retrieve any Events for groups Id: ${groupId}`)
    return []
  }
}

export async function retrieveAllTasks(todoLists, client = supabase) {

  const taskListIds = todoLists.map(t => t.task_list_id)

  const {data: allEvents, error: allEventsError } = await client
  .from('task')
  .select(`*`)
  .in('task_list_id', taskListIds);

  if (allEventsError) {
    console.error(`Something went wrong retrieving any events for this group: ${allEventsError.message}`)
    return {all: 0, completed: 0};
  }

  const completedEvents = allEvents.filter(e => e.is_completed)

  return {all: allEvents.length || 0, completed: completedEvents.length || 0}
}
