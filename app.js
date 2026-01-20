import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import {validatePassword, createEventObj} from "./utils/utils.js";
import { stat } from "fs";
import { error, group } from "console";
import { format } from 'date-fns';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(
  "https://fhaffbgrrepbowirthcb.supabase.co",
  supabaseKey
);

const authRequire = async function (req, res, next) {
  const supaToken = req.cookies.authCookie;

  if (!supaToken) {
    res.clearCookie('refreshToken');
    res.clearCookie('expiresAt'); 
    return res.redirect("/login");
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
      samesite: 'lax'
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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cors());
app.use(cookieParser());

const SALT_ROUNDS = 10;

app.set("port", process.env.PORT || 3000);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.listen(app.get("port"), () => {
  console.log(`Listening on port: ${app.get("port")}`);
});

app.get("/calendar", authRequire, async (req, res) => {
  
  const {data: groupsIds, error: groupsIdsError} = await supabase
  .from('groups')
  .select(`groups_id, tag_name,
    profiles_groups!inner(
    user_id
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId);

  if (groupsIdsError) {
    res.status(500).json({success: false, error: groupsIdsError.message})
  }

  let groupsTagNames = {};
  groupsIds.filter(g => g.tag_name !== null).forEach(g => {
    groupsTagNames[g.groups_id] = g.tag_name
  })

  res.render("calendar.ejs", {groupsTagNames: groupsTagNames, currentPage: 'calendar'});
});

app.get("/todo", authRequire, async (req, res) => {
  const { data: groupObj, error: profileError } = await supabase
    .from("profiles")
    .select(
      `
      profiles_groups!inner(
        groups_id,
        groups(
          tag_name
        )
      )`
    )
    .eq("profiles_groups.user_id", req.cookies.userId);

  const groupIDs = groupObj[0]?.profiles_groups.map((pg) => {
    return pg.groups_id;
  });

  const tagNameObj =
    groupObj[0]?.profiles_groups
      .filter(pg => pg.groups.tag_name !== null)
      .map(pg =>  ({gid: pg.groups_id, tag: pg.groups.tag_name})) || {};

  const { data: task_list, error: taskListError } = await supabase
    .from("task_list")
    .select(
      `
    *,
    groups!inner(
    *
    )
    `
    )
    .in("groups_id", groupIDs);

  const yourTaskListsPromises = task_list.map(async (tl) => {
    const { data: tasks, error: errorTasks } = await supabase
      .from("task")
      .select("*")
      .eq("task_list_id", tl.task_list_id);

    if (errorTasks) {
      return {
        taskListInfo: {
          title: tl.task_list_title,
          desc: tl.task_list_description,
          tag_group: tl.groups.tag_name,
          idTl: tl.task_list_id,
          idG: tl.groups_id
        },
        taskItems: [],
        totalTasks: 0,
      };
    }

    // Need to find all tags that a user can use.
    return {
      taskListInfo: {
        title: tl.task_list_title,
        desc: tl.task_list_description,
        tag_group: tl.groups.tag_name,
        idTl: tl.task_list_id,
        idG: tl.groups_id
      },
      taskItems: tasks.sort(function(x, y) { return (x.is_completed === y.is_completed) ? 0: x.is_completed? 1: -1}) || [],
      totalTasks: tasks.length || 0,
      totalCompletedTasks: tasks.filter(t => t.is_completed === true).length || 0,
      progressWidth: (() => {
        const total = tasks.length;
        const completedTasks = tasks.filter(t => t.is_completed === true).length;
        return total > 0 ? (completedTasks / total * 100) : 0
    })()
    };
  });

  const yourTaskLists = await Promise.all(yourTaskListsPromises);

  res.render("todo.ejs", {
    yourTaskLists,
    groupTagObj: tagNameObj, 
    currentPage: 'todo'
  });
});

app.get("/groups", authRequire, async (req, res) => {

  const {data: userMemberships, error: userMembershipsError} = await supabase
  .from('profiles_groups')
  .select('groups_id')
  .eq('user_id', req.cookies.userId)
  .eq('invite_status', 'accepted');

  if (userMembershipsError) {
    return res.status(400).json({success: false, error: userMembershipsError.message});
  }

  const groupIds = userMemberships.map(pg => pg.groups_id)

  if (groupIds.length === 0) {
    return res.render("groups.ejs", { 
      userGroups: [], 
      yourGroups: 0, 
      totalEvents: 0, 
      userInvites: [] 
    });
  } 

  //Need to use the INNNER join to filter on nested tables and only return the
  // data if there is a match in the lower table.
  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select(
      `
        *,
        profiles_groups!inner (
        *,
        profiles (
        username,
        email)
        )
        `
    )
    .in("groups_id", groupIds)

  if (groupsError) {
    res.status(400).json({success: false, error: groupsError.message});
  }

  const userGroups =
    await Promise.all(groups.map(async (group) => {
      const members =
        group.profiles_groups?.map((pg) => {
          return {
            profile: pg.profiles,
            role: pg.role,
          };
        }) || [];

      // Need to retrieve all events
      const events = await retrieveEvents(group.groups_id);
      //Need to retrieve all ToDo Lists
      const todoLists = await retrieveTodoLists(group.groups_id);

      const totalTasks = todoLists.length > 0 ? await retrieveAllTasks(todoLists) : {all: 0, completed: 0};;

      return {
        groupInfo: {
          title: group.groups_title,
          description: group.groups_description,
          tag: group.tag_name,
          groupId: group.groups_id,
          created_at: format(new Date(group.created_at), 'dd-MM-yyyy'),
          totalTasks: totalTasks,
          progressWidth: (() => {
            return totalTasks.all > 0 ? (totalTasks.completed / totalTasks.all) * 100 : 0 
          })()
        },
        members,
        events,
        todoLists
      };
    }) || []);

  const {data: todayEvents, error: todayEventsError} = await supabase
  .from('profiles_events')
  .select('*')
  .eq('user_id', req.cookies.userId)
  .eq('rsvp_status', 'accepted');
  
  let totalEvents;
  if (todayEventsError) {
    totalEvents = 0;
  }
  totalEvents = todayEvents.length;

  const {data: userInvites, error: UserInvitesError } = await supabase
  .from('profiles_groups')
  .select(
    `*,
    groups(
      groups_title,
      groups_description,
      tag_name
    )`)
    .eq('user_id', req.cookies.userId)
    .eq('invite_status', 'pending');

  res.render("groups.ejs", { userGroups, yourGroups: groups.length, 
    totalEvents, 
    userInvites : userInvites || [], 
    currentPage: 'groups' });
});

//Load the User login pages
app.get("/", authRequire, (req, res) => {
  res.redirect("/groups");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
// Processing the user login form.
app.post("/login", async (req, res) => {
  //Now need to login the user

  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.body["email"],
    password: req.body["password"],
  });

  if (error) {
    return res
      .status(400)
      .render("login.ejs", { success: false, message: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('userId', data.user.id,  { 
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/groups");
  }
});

app.post("/register", async (req, res) => {
  // Need to register a user and then also log in direclty.

  if (req.body["password"] != req.body["passwordConfirm"]) {
    return res.status(422).render("register.ejs", {
      success: false,
      error: "Make sure the passwords entered are identical to each other.",
    });
  }

  const [isValid, messageSuccess] = validatePassword(req.body["password"]);

  if (!isValid) {
    return res
      .status(422)
      .render("register.ejs", { success: false, error: messageSuccess });
  }

  // let hash_pass = await bcrypt.hash(req.body['password'], SALT_ROUNDS)
  // console.log(hash_pass);
  const { data, error } = await supabase.auth.signUp({
    email: req.body["email"],
    password: req.body["password"],
    options: {
      data: {
        username: req.body["username"],
      },
    },
  });
  const refreshToken = data.session.refresh_token;

  if (error) {
    return res
      .status(400)
      .render("register.ejs", { success: false, error: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });
    res.cookie('userId', data.user.id,  { 
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/groups");
  }
});

app.post("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.redirect("/login");
});

app.get("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.redirect("/login");
});

app.post('/checkUser', authRequire ,async (req, res) => {

  try {
    const {data: isUserFound, error: noUser} = await supabase
    .from('profiles')
    .select('username, user_id, email')
    .or(`username.ilike.${req.body.isUser},email.ilike.${req.body.isUser}`)
    .limit(1)

    if (noUser) {
      res.status(400).json({success: false, error: noUser.message})
    } else if (isUserFound.length === 0) {
      res.json({success: true, match: false})
    } else {
      res.json({success: true, match: true, user: {
        username: isUserFound[0].username,
        user_id: isUserFound[0].user_id,
        email: isUserFound[0].email
      }})
    }

  } catch (error) {
    res.status(500).json({success: false, error: `Internal server error occurred.${error.message}`})
  }
  
});

app.post('/InviteUsers', authRequire, async (req, res) => {

  try {

    const userIds = req.body.userList.map(u => u.user_id)

    const {data: users2Check, error: users2CheckError } = await supabase
    .from('profiles_groups')
    .select()
    .in('user_id', userIds)
    .eq('groups_id', req.body.groupId);

    const existingUsers = users2Check.filter(u => u.invite_status === 'accepted'
      || u.invite_status === 'pending'
    ).map(u => u.user_id) || [];

    const users2Invite = req.body.userList.filter(u => !existingUsers.includes(u.user_id))

    if (users2Invite.length === 0) {
      return res.json({
        success: true,
        message: 'All users are already members or invited',
      })
    }

    const inviteUserDb = users2Invite.map(u => {
      return {
        invite_status: 'pending',
        user_id: u.user_id,
        groups_id: req.body.groupId,
        role: 'member'
      }
    })

    const {data: inviteUsers, error: inviteUsersError} = await supabase
      .from('profiles_groups')
      .upsert(inviteUserDb) // Need upsert if there is a declined in there
      .select()

    if (inviteUsersError) {
      return res.status(500).json({success: false, error: inviteUsersError.message})
    }

    const emailIdList = inviteUsers.map(u => u.user_id)

    const {data: userProfile, error: userProfileError} = await supabase
      .from('profiles')
      .select('email, user_id, username')
      .in('user_id', emailIdList)
    
    if (userProfileError) {
      return res.status(500).json({success: false, error: userProfileError.message})
    }

    const invitedUsersCompleted = inviteUsers.map(invite => {
      const profile = userProfile?.find(p => p.user_id === invite.user_id);
      return {
        ...invite,
        username: profile.username,
        email: profile.email
      }
    })

    if (invitedUsersCompleted) {
      res.json({success: true, message: `You invited ${invitedUsersCompleted.length}`,
      invitedUsers: invitedUsersCompleted})
    } else {
      res.status(400).json({success: false, error: "Couldn't send invite to the selected users."})
    }
    
  } catch (e) {
    res.status(500).json({success: false, error: e})
  }
});

app.post('/createGroup', authRequire, async (req, res) => {

  const {data: newGroup, error: newGroupError} = await supabase
  .from('groups')
  .insert({
      groups_title: req.body['group-title'],
      groups_description: req.body['group-description'],
      tag_name: req.body['tag-name'],
    })
  .select()

  if (newGroupError) {
    res.status(400).json({success: false, error: `Could not create Group ${newGroup}`})
  }

  const {data: newProfilesGroup, error: newProfilesGroupError} = await supabase
  .from('profiles_groups')
  .insert([{
    groups_id: newGroup[0].groups_id,
    user_id: req.cookies.userId,
    role: 'admin',
    invite_status: 'accepted'
  }])
  .select()

  if (newProfilesGroupError) {
    const {error: deleteGroupError} = await supabase
    .from('groups')
    .delete()
    .eq('groups_id', newGroup[0].groups_id) 

    res.status(500).json({success: false, error: `Something went wrong after creating the groups: ${newProfilesGroupError}`})
  }

  // Now need to ahndle sending invites to other users
  let promiseInviteResults
  if (req.body.usersInvite) {
    // Need to use map to catch alle results and do async programming with it.
    promiseInviteResults = await Promise.all(req.body.usersInvite.map( async (user) => {
      let {data: inviteUser, error: inviteUserError} = await supabase
      .from('profiles_groups')
      .upsert([{
        groups_id: newGroup[0].groups_id,
        user_id: user.user_id,
        role: 'member',
        invite_status: 'pending'
      }])
      .select()
      .limit(1)
    
      if (inviteUserError) {
        return { success: false, user: user.username, error: inviteUserError.message };
      }
      
      inviteUser[0]['username'] = user.username;
      inviteUser[0]['email'] = user.email;

      return inviteUser[0];
    }));
  }

  res.json({success: true, newGroup: newGroup, newUsers: promiseInviteResults || []})
})

app.post('/acceptInviteGroup', authRequire, async (req, res) => {

  const {data: inviteAccepted, error: InviteAcceptedError} = await supabase
  .from('profiles_groups')
  .update({invite_status: 'accepted'})
  .eq('groups_id', req.body.groupId)
  .eq('user_id', req.cookies.userId)
  .select();

  if (InviteAcceptedError) {
    res.status(400).json({success: false, error: InviteAcceptedError.message})
  }

  const { data: group, error: groupsError } = await supabase
    .from("groups")
    .select(
      `
        *,
        profiles_groups!inner (
        *,
        profiles (
        username,
        email)
        )
        `
    )
    .eq('groups_id', req.body.groupId)
    .limit();

  if (groupsError) {
    res.status(400).json({success: false, error: groupsError.message});
  }

  const members = group[0].profiles_groups?.map((pg) => {
    return {
      role: pg.role,
      username: pg.profiles.username,
      email: pg.profiles.email,
      invite_status: pg.invite_status,
      user_id: pg.user_id
    };
  }) || [];

  // Need to retrieve all events
  const events = await retrieveEvents(req.body.groupsId);
  //Need to retrieve all ToDo Lists
  const todoLists = await retrieveTodoLists(req.body.groupsId);

  const {data: todayEvents, error: todayEventsError} = await supabase
  .from('profiles_events')
  .select('*')
  .eq('user_id', req.cookies.userId)
  .eq('rsvp_status', 'accepted');

  group[0].created_at = format(new Date(group[0].created_at), 'dd-MM-yyyy');
  
  let totalEvents;
  if (todayEventsError) {
    totalEvents = 0;
  }
  totalEvents = todayEvents.length;

  res.json({
    success: true, 
    group: group, 
    members: members, 
    events: events,
    todoLists: todoLists,
    totalEvents: totalEvents
  })

});

app.post('/declineInviteGroup', authRequire, async (req, res) => {

  const {data: inviteAccepted, error: InviteAcceptedError} = await supabase
  .from('profiles_groups')
  .update({invite_status: 'declined'})
  .eq('groups_id', req.body.groupId)
  .eq('user_id', req.cookies.userId)
  .select();

  if (InviteAcceptedError) {
    res.status(500).json({success: false, error: InviteAcceptedError.message})
  }

  res.json({success: true})
})

//API Endpoints
app.post("/parseEvent", authRequire, async (req, res) => {

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
        groups_id: insertEventObj?.tagNames ? parseInt(insertEventObj?.tagNames) : '' 
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

app.put('/parseEvent/:eventId', authRequire, async (req, res) => {
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

app.delete('/parseEvent/:eventId', authRequire, async (req, res) => {
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


app.get('/renderEvents', authRequire, async (req, res) => {
  const {data: profileEvents, error: profileEventsError} = await supabase
  .from('profiles_events')
  .select(`
    event_id
    `)
  .eq('user_id', req.cookies.userId)

  if (profileEventsError) {
    res.status(400).json({success: false, error: profileEventsError.message})
  }

  const {data: groupsIds, error: groupsIdsError} = await supabase
  .from('groups')
  .select(`groups_id, tag_name,
    profiles_groups!inner(
    user_id
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId);

  if (groupsIdsError) {
    res.status(500).json({success: false, error: groupsIdsError.message})
  }

  let groupsTagNames = {};
  groupsIds.filter(g => g.tag_name !== null).forEach(g => {
    groupsTagNames[g.groups_id] = g.tag_name
  })

  const taskIdsArray = profileEvents.map( e => e.event_id);

  const {data: events, error: errorEvents} = await supabase
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
  .in('event_id', taskIdsArray);

  if (errorEvents) {
    res.status(400).json({success: false, error: errorEvents.message})
  } else {
    try {
      const filteredEvents = events.map((e) => {
        let start_date, end_date;

        const hasStartTime = e.start_time != null && e.start_time.length >= 5;
        const hasEndTime = e.end_time != null && e.end_time.length >= 5;
        if (
          e.all_day ||
          !hasStartTime ||
          !hasEndTime
        ) {
          start_date = `${e.start_date}`;
          end_date   = `${e.end_date}`;

        } else if (e.start_time === e.end_time || (e.start_time === '00:00' && e.end_time === '00:00')) {
          start_date = `${e.start_date}`;
          end_date   = `${e.end_date}`;

        } else if (e.all_day) {
          start_date = `${e.start_date}`;
          end_date   = `${e.end_date}`;

        } else if (e.start_time === '00:00' && e.end_time === '00:00') {
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
  }

});

app.get('/retrieveUsersSelectedGroup', authRequire, async (req, res) => {
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

app.post("/createTaskList", authRequire, async (req, res) => {

  const { data: createTaskList, error: createTaskListError } = await supabase
    .from("task_list")
    .insert([
      {
        task_list_title: req.body.title,
        task_list_description: req.body.description,
        groups_id: req.body.groups_id
      },
    ])
    .select();

  const {data: tagName, error: tagNameError } = await supabase
  .from('groups')
  .select('tag_name')
  .eq('groups_id', req.body.groups_id); 

  if (createTaskListError) {
    res
      .status(400)
      .json({success: false, error: "Unable to create Task List" });
  } else {
    // Send data back to the frontend >> Need to customize the submit of form
    res.json({success: true, createTaskList: createTaskList, tagName: tagName?.[0].tag_name || null})
  }

});

app.post('/createTask', authRequire, async (req, res) => {

  const { data: insertTask, error: insertTaskError } = await supabase
  .from('task')
  .insert([
    {
      task_title: req.body.task_title,
      task_description: req.body.task_description,
      priority: req.body.priority,
      due_date: req.body?.due_date || null,
      task_list_id: req.body.task_list_id
    }
  ])
  .select()

  if (insertTaskError) {
    res.json({success: false, message: "Unable to create a Task."})
  } else {
    res.json({success: true, insertTask})
  }
})

app.patch('/updateTask', authRequire, async(req, res) => {
  
  const {data: taskUpdate, error: taskUpdateError} = await supabase
  .from('task')
  .update({is_completed: req.body.isCompleted})
  .eq('task_id', req.body.taskId)
  .select();

  if (taskUpdate) {
    res.json({success: true, taskUpdate})
  } else {
    res.json({success: false, message: 'Unable to update the task.'})
  }
})

async function retrieveTodoLists(groupId) {

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

async function retrieveEvents(groupId) {

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

async function retrieveAllTasks(todoLists) {

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
