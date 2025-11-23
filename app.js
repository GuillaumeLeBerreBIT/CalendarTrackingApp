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
import validatePassword from "./utils/utils.js";
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
    return res.redirect("/login");
  }

  const { data, error } = await supabase.auth.getUser(supaToken);

  if (error || !data.user) {
    res.clearCookie("authCookie");
    return res.redirect("login");
  }

  req.user = data.user;

  next();
};

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

app.get("/", authRequire, (req, res) => {
  res.render("index.ejs");
});

app.get("/calendar", authRequire, async (req, res) => {
  //Later need to also make sure there is filtering done on Groups as well to find matching tasks

  res.render("calendar.ejs");
});

app.get("/todo", authRequire, async (req, res) => {
  const { data: groupObj, error: profileError } = await supabase
    .from("profiles")
    .select(
      `
      profiles_groups(
        groups_id,
        groups(
          tag_name
        )
      )`
    )
    .eq("profiles_groups.user_id", req.user.id);

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
    groups(
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

    return {
      taskListInfo: {
        title: tl.task_list_title,
        desc: tl.task_list_description,
        tag_group: tl.groups.tag_name,
        idTl: tl.task_list_id,
        idG: tl.groups_id
      },
      taskItems: tasks || [],
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
  });
});

app.get("/groups", authRequire, async (req, res) => {
  //Need to use the INNNER join to filter on nested tables and only return the
  // data if there is a match in the lower table.
  const { data: groups, error } = await supabase
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
    .eq("profiles_groups.user_id", req.cookies.userId);

  const userGroups =
    groups.map((group) => {
      const members =
        group.profiles_groups?.map((pg) => {
          return {
            profile: pg.profiles,
            role: pg.role,
          };
        }) || [];

      return {
        groupInfo: {
          title: group.groups_title,
          description: group.groups_description,
          tag: group.tag_name,
          groupId: group.groups_id,
          created_at: format(new Date(group.created_at), 'dd-MM-yyyy')
        },
        members,
      };
    }) || [];

  res.render("groups.ejs", { userGroups, yourGroups: groups.length });
});

app.post("/create-group", authRequire, async (req, res) => {
  try {
    // Handle the creation of the User who creates the group.
    const { data: newGroup, error: groupError } = await supabase
      .from("groups")
      .insert([
        {
          groups_title: req.body["group-title"],
          groups_description: req.body["group-description"] || null,
          tag_name: req.body["tag-name"] || null,
        },
      ])
      .select();

    if (groupError) {
      return res
        .status(400)
        .render("groups.ejs", { success: false, message: groupError.message });
    }

    const { data: newProfile, error: profileError } = await supabase
      .from("profiles_groups")
      .insert([
        {
          groups_id: newGroup[0].groups_id,
          user_id: req.user.id,
          role: "admin",
          invite_status: "accepted",
        },
      ])
      .select();

    if (profileError) {
      const { error } = await supabase
        .from("groups")
        .delete()
        .eq("groups_id", newGroup[0].groups_id);
      return res.status(400).render("groups.ejs", {
        success: false,
        message: "Failed to add the creator as admin.",
      });
    }

    // Handle the invitation of ONE member. (Will implement multiple later.)
    if (req.body["invite-user"]) {
      const { data: profileMatches, error: noMatches } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", req.body["invite-user"]);

      if (profileMatches && profileMatches.length > 0) {
        const { data: userInvite, error: inviteError } = await supabase
          .from("profile_groups")
          .insert([
            {
              user_id: profileMatches[0].user_id,
              groups_id: newGroup.groups_id,
              role: "member",
              invite_status: "pending",
            },
          ]);

        if (inviteError) {
          console.log("groups.ejs", {
            success: false,
            message: "Group created, but unable to add user to the group.",
          });
        }
      }
    }

    res.redirect("/groups");
    // res.render("groups.ejs", {
    //   success: true,
    //   message: "Group created succesfully.",
    // });
  } catch (error) {
    res
      .status(500)
      .render("groups.ejs", { success: false, message: error.message });
  }
});

//Load the User login pages
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
// Processing the user login form.
app.post("/login", async (req, res) => {
  console.log(req.body);
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
    });
    res.cookie('userId', data.user.id,  { httpOnly: true });

    res.redirect("/groups");
  }
});

app.post("/register", async (req, res) => {
  console.log(req.body);
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
    });
    res.cookie('userId', data.user.id,  { httpOnly: true });

    res.redirect("/groups");
  }
});

app.post("/logout", async (req, res) => {
  res.clearCookie("authCookie");
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
    const invitePromises = req.body.userList.map(async (u) => {
      const {data: inviteUser, error: inviteUserError} = await supabase
      .from('profiles_groups')
      .upsert({
        invite_status: 'pending',
        user_id: u.user_id,
        groups_id: req.body.groupId,
        role: 'member'
      })
      .select()

      const {data: userMail, error: userMailError} = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', u.user_id)
      .limit(1)

      if (userMailError) throw userMailError;

      if (inviteUserError) throw inviteUserError;

      inviteUser[0]['email'] = userMail[0]?.email
      return inviteUser;
    });

    const result = await Promise.all(invitePromises) // ForEach doesnt work well with Async, won't wait.

    if (result) {
      res.json({success: true, message: `You invited ${result.length}`,
      invitedUsers: result})
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

//API Endpoints
app.post("/addEvent", authRequire, async (req, res) => {
  const insertEventObj = {};

  for (let [key, val] of Object.entries(req.body)) {
    insertEventObj[key] = val;
  }

  if (!insertEventObj["startTime"] || !insertEventObj["startTime"]) {
    insertEventObj.allDay = true
  }

  if (insertEventObj.allDay) {
    insertEventObj['startTime'] = null,
    insertEventObj['endTime'] = null
  }

  const { data: eventData, error: eventDataError } = await supabase
    .from("events")
    .insert([
      {
        event_title: insertEventObj["calendar-title"],
        event_description: insertEventObj["calendar-description"],
        all_day: insertEventObj["allDay"],
        start_date: insertEventObj["startDate"],
        end_date: insertEventObj["endDate"],
        start_time: insertEventObj["startTime"],
        end_time: insertEventObj["endTime"],
      },
    ])
    .select();

  if (eventDataError) {
    res.status(400).json({ success: false, error: error.message });
  }

  // After adding Event need to update the profiles_event table
  const {data: eventProfile, error: eventProfileError} = await supabase
  .from('profiles_events')
  .insert([
    {user_id: req.cookies.userId, event_id: eventData[0].event_id}
  ])
  .select()

  if (eventProfileError) {
    res.status(400).json({ success: false, error: error.message });
  } else {

    eventData["start_time"] = eventData['start_time'] ? eventData['start_time'].slice(0,-3) : '';
    eventData["end_time"] = eventData['end_time'] ? eventData['end_time'].slice(0,-3) : '';
    res.json({ success: true, eventData });
  } 
});

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
    const filteredEvents = events.map((e) => {
      let start_date, end_date;
      if (!e.all_day && (e.start_time && e.end_time)) {
        start_date = `${e.start_date}T${e.start_time.substring(0, 5)}`;
        end_date = `${e.end_date}T${e.end_time.substring(0, 5)}`;

      } else {
        start_date = e.start_date 
        end_date = e.start_date 
      }

      const participants = e.profiles_events.map((p) => {
        return p.profiles.username
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
          groupName: ''
        }
      }
    })
    res.json({success: true, events: filteredEvents})
  }

});

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
