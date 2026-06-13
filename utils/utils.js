import supabase, { createUserClient} from "../db/supabase.js";

export default async function authRequire (req, res, next) {
  const supaToken = req.cookies.authCookie;

  if (!supaToken) {

    if (!req.cookies.refreshToken) {
      res.clearCookie('expiresAt');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
      const { user, accessToken } = await refreshSession(req, res)
      req.user = user
      req.supabase = createUserClient(accessToken)
      // Bind the userId cookie to the verified JWT — the cookie itself is
      // attacker-controllable, so never let downstream code trust it raw.
      req.cookies.userId = user.id
      return next()

    } catch (error) {
      res.clearCookie("authCookie");
      res.clearCookie("userId");
      res.clearCookie('refreshToken');
      res.clearCookie('expiresAt');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  const { data, error } = await supabase.auth.getUser(supaToken);

  if (error || !data.user) {

    try {
      const { user, accessToken } = await refreshSession(req, res);
      req.user = user;
      req.supabase = createUserClient(accessToken)
      req.cookies.userId = user.id
      return next();

    } catch (error) {
      res.clearCookie("authCookie");
      res.clearCookie("userId");
      res.clearCookie('refreshToken');
      res.clearCookie('expiresAt');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
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
      req.cookies.userId = freshUser.id
      return next();
    } catch (_) {
      // Fall through to use existing valid token
    }
  }

  req.supabase = createUserClient(supaToken)
  req.user = data.user;
  req.cookies.userId = data.user.id
  return next();
};

// Supabase refresh tokens are single-use (rotated on every exchange, with only a
// ~10s reuse window). A page load fires many API calls in parallel; if each one
// exchanged the same cookie token independently, the losers would replay a
// consumed token and Supabase would revoke the whole session. So concurrent
// requests carrying the same refresh token share one exchange, and a successful
// result is kept for a short grace period for requests that raced in before the
// rotated cookie reached the browser.
const inflightRefreshes = new Map();
const REFRESH_RESULT_GRACE_MS = 30 * 1000;

async function exchangeRefreshToken(refreshToken) {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error) throw new Error('Could not retrieve a bearer token for the user.');

  return data; // { session, user }
}

async function refreshSession(req, res) {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) throw new Error('Could not find a refresh token from the cookies.')

  let pending = inflightRefreshes.get(refreshToken);
  if (!pending) {
    pending = exchangeRefreshToken(refreshToken);
    inflightRefreshes.set(refreshToken, pending);
    pending.then(
      () => {
        const timer = setTimeout(() => inflightRefreshes.delete(refreshToken), REFRESH_RESULT_GRACE_MS);
        timer.unref?.();
      },
      () => inflightRefreshes.delete(refreshToken)
    );
  }

  const { session, user } = await pending;

  setSessionCookies(res, session, user);
  return { user, accessToken: session.access_token }
}

export function setSessionCookies(res, session, user) {
  const secure = process.env.NODE_ENV === 'production';
  const base = { httpOnly: true, sameSite: 'lax', secure };

  // The access-token cookies live exactly as long as the JWT inside them
  // (expires_in is in seconds). The refresh token defines the real session
  // length — once the access token lapses, authRequire silently exchanges it.
  const accessMaxAge = (session.expires_in ?? 3600) * 1000;
  const sessionMaxAge = 30 * 24 * 60 * 60 * 1000;

  res.cookie('authCookie', session.access_token, { ...base, maxAge: accessMaxAge });
  res.cookie('expiresAt', session.expires_at, { ...base, maxAge: accessMaxAge });
  res.cookie('refreshToken', session.refresh_token, { ...base, maxAge: sessionMaxAge });
  res.cookie('userId', user.id, { ...base, maxAge: sessionMaxAge });
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
