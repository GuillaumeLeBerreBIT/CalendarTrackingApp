import supabase from "../db/supabase.js";

export default async function authRequire (req, res, next) {
  const supaToken = req.cookies.authCookie;

  if (!supaToken) {

    if (!req.cookies.refreshToken) {
      res.clearCookie('expiresAt');
      return res.redirect("/login");
    }

    try {
      const userRefresh = await refreshSession(req, res)
      req.user = userRefresh
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
      const userRefresh = await refreshSession(req, res);
      req.user = userRefresh;
      return next();

    } catch (error) {
      res.clearCookie("authCookie");
      res.clearCookie("userId");
      res.clearCookie('refreshToken');
      res.clearCookie('expiresAt'); 
      return res.redirect("login");
    } 
  }
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
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('userId', user.id, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    })

    return user
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

    if (!eventObj.startTime || !eventObj.endTime) {
        eventObj.allDay = true;
    }

    if (eventObj.allDay) {
        eventObj.startTime = null;
        eventObj.endTime = null;
    }

    return eventObj
}

export async function retrieveTodoLists(groupId) {

  try {
    const {data: todoLists, error: todoListsError} = await supabase
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

export async function retrieveEvents(groupId) {

  try {
    const {data: events, error: eventsError} = await supabase
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

export async function retrieveAllTasks(todoLists) {

  const taskListIds = todoLists.map(t => t.task_list_id)

  const {data: allEvents, error: allEventsError } = await supabase
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
