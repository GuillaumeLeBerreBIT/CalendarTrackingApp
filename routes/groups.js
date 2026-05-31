import express from "express";
import supabase from "../db/supabase.js";
import authRequire ,{retrieveEvents, retrieveTodoLists, retrieveAllTasks } from "../utils/utils.js"
import { format } from "date-fns";
const router = express.Router();


router.get("/groups", authRequire, async (req, res) => {

  const {data: userMemberships, error: userMembershipsError} = await req.supabase
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
      userInvites: [],
      currentPage: 'groups'
    });
  } 

  //Need to use the INNNER join to filter on nested tables and only return the
  // data if there is a match in the lower table.
  const { data: groups, error: groupsError } = await req.supabase
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
    return res.status(400).json({success: false, error: groupsError.message});
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
      const events = await retrieveEvents(group.groups_id, req.supabase);
      //Need to retrieve all ToDo Lists
      const todoLists = await retrieveTodoLists(group.groups_id, req.supabase);

      const totalTasks = todoLists.length > 0 ? await retrieveAllTasks(todoLists, req.supabase) : {all: 0, completed: 0};

      return {
        groupInfo: {
          title: group.groups_title,
          description: group.groups_description,
          tag: group.tag_name,
          groupId: group.groups_id,
          created_at: format(new Date(group.created_at), 'dd-MM-yyyy'),
          created_at_raw: group.created_at,
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

  const {data: todayEvents, error: todayEventsError} = await req.supabase
  .from('profiles_events')
  .select('*')
  .eq('user_id', req.cookies.userId)
  .eq('rsvp_status', 'accepted');
  
  let totalEvents;
  if (todayEventsError) {
    totalEvents = 0;
  }
  totalEvents = todayEvents.length;

  const {data: userInvites, error: UserInvitesError } = await req.supabase
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

  res.render("groups.ejs", {
    userGroups: userGroups.sort((a, b) => new Date(b.groupInfo.created_at_raw) - new Date(a.groupInfo.created_at_raw)),
    yourGroups: groups.length,
    totalEvents,
    userInvites: userInvites || [],
    currentUserId: req.cookies.userId,
    currentPage: 'groups'
  });
});

router.post('/checkUser', authRequire ,async (req, res) => {

  try {
    const {data: isUserFound, error: noUser} = await req.supabase
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

router.post('/inviteUsers', authRequire, async (req, res) => {

  try {

    const { data: membership, error: membershipError } = await req.supabase
      .from('profiles_groups')
      .select('role')
      .eq('groups_id', req.body.groupId)
      .eq('user_id', req.cookies.userId)
      .single();

    if (membershipError || membership?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only group admins can invite members.' });
    }

    const userIds = req.body.userList.map(u => u.user_id)

    const {data: users2Check, error: users2CheckError } = await req.supabase
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

    const {data: inviteUsers, error: inviteUsersError} = await req.supabase
      .from('profiles_groups')
      .upsert(inviteUserDb) // Need upsert if there is a declined in there
      .select()

    if (inviteUsersError) {
      return res.status(500).json({success: false, error: inviteUsersError.message})
    }

    const emailIdList = inviteUsers.map(u => u.user_id)

    const {data: userProfile, error: userProfileError} = await req.supabase
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

router.post('/createGroup', authRequire, async (req, res) => {

  const {data: newGroup, error: newGroupError} = await req.supabase
  .from('groups')
  .insert({
      groups_title: req.body['group-title'],
      groups_description: req.body['group-description'],
      tag_name: req.body['tag-name'],
    })
  .select()

  if (newGroupError) {
    return res.status(400).json({success: false, error: `Could not create Group: ${newGroupError.message}`})
  }

  const {data: newProfilesGroup, error: newProfilesGroupError} = await req.supabase
  .from('profiles_groups')
  .insert([{
    groups_id: newGroup[0].groups_id,
    user_id: req.cookies.userId,
    role: 'admin',
    invite_status: 'accepted'
  }])
  .select()

  if (newProfilesGroupError) {
    await req.supabase
    .from('groups')
    .delete()
    .eq('groups_id', newGroup[0].groups_id)

    return res.status(500).json({success: false, error: `Something went wrong after creating the group: ${newProfilesGroupError.message}`})
  }

  // Now need to ahndle sending invites to other users
  let promiseInviteResults
  if (req.body.usersInvite) {
    // Need to use map to catch alle results and do async programming with it.
    promiseInviteResults = await Promise.all(req.body.usersInvite.map( async (user) => {
      let {data: inviteUser, error: inviteUserError} = await req.supabase
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

router.post('/acceptInviteGroup', authRequire, async (req, res) => {

  const {data: inviteAccepted, error: InviteAcceptedError} = await req.supabase
  .from('profiles_groups')
  .update({invite_status: 'accepted'})
  .eq('groups_id', req.body.groupId)
  .eq('user_id', req.cookies.userId)
  .select();

  if (InviteAcceptedError) {
    return res.status(400).json({success: false, error: InviteAcceptedError.message})
  }

  const { data: group, error: groupsError } = await req.supabase
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
    .limit(1);

  if (groupsError) {
    return res.status(400).json({success: false, error: groupsError.message});
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
  const events = await retrieveEvents(req.body.groupsId, req.supabase);
  //Need to retrieve all ToDo Lists
  const todoLists = await retrieveTodoLists(req.body.groupsId, req.supabase);

  const {data: todayEvents, error: todayEventsError} = await req.supabase
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

router.post('/declineInviteGroup', authRequire, async (req, res) => {

  const {data: inviteAccepted, error: InviteAcceptedError} = await req.supabase
  .from('profiles_groups')
  .update({invite_status: 'declined'})
  .eq('groups_id', req.body.groupId)
  .eq('user_id', req.cookies.userId)
  .select();

  if (InviteAcceptedError) {
    return res.status(500).json({success: false, error: InviteAcceptedError.message})
  }

  res.json({success: true})
});

router.get('/getGroupMembers/:groupId', authRequire, async (req, res) => {
  const { groupId } = req.params;

  const [{ data: members, error }, { data: group, error: groupError }] = await Promise.all([
    req.supabase
      .from('profiles_groups')
      .select(`user_id, role, color, profiles (username, email)`)
      .eq('groups_id', groupId)
      .eq('invite_status', 'accepted'),
    req.supabase
      .from('groups')
      .select('shared_color')
      .eq('groups_id', groupId)
      .single()
  ]);

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (groupError) return res.status(500).json({ success: false, error: groupError.message });

  res.json({
    success: true,
    sharedColor: group.shared_color || '#6B7280',
    members: members.map(m => ({
      user_id: m.user_id,
      username: m.profiles.username,
      email: m.profiles.email,
      role: m.role,
      color: m.color
    }))
  });
});

router.post('/setGroupSharedColor', authRequire, async (req, res) => {
  const { groupsId, sharedColor } = req.body;

  if (!groupsId || !sharedColor) {
    return res.status(400).json({ success: false, error: 'groupsId and sharedColor are required' });
  }

  const { error } = await req.supabase
    .from('groups')
    .update({ shared_color: sharedColor })
    .eq('groups_id', groupsId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  res.json({ success: true });
});

router.post('/setMemberColor', authRequire, async (req, res) => {
  const { groupsId, color } = req.body;

  if (!groupsId || !color) {
    return res.status(400).json({ success: false, error: 'groupsId and color are required' });
  }

  const { error } = await req.supabase
    .from('profiles_groups')
    .update({ color })
    .eq('groups_id', groupsId)
    .eq('user_id', req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  res.json({ success: true });
});

export default router;