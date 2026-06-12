import express from "express";
import supabase, { supabaseAdmin } from "../db/supabase.js";
import authRequire ,{retrieveEvents, retrieveTodoLists, retrieveAllTasks } from "../utils/utils.js"
import { notifyUsers } from "../utils/notifications.js";
import { attachTier, checkLimit } from "../utils/tier.js";
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
    return res.json({
      success: true,
      userGroups: [],
      yourGroups: 0,
      totalEvents: 0,
      userInvites: [],
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
            user_id: pg.user_id,
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
          tag_name: group.tag_name,
          groupId: group.groups_id,
          sharedColor: group.shared_color || null,
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

  res.json({
    success: true,
    userGroups: userGroups.sort((a, b) => new Date(b.groupInfo.created_at_raw) - new Date(a.groupInfo.created_at_raw)),
    yourGroups: groups.length,
    totalEvents,
    userInvites: userInvites || [],
    currentUserId: req.cookies.userId,
  });
});

router.post('/checkUser', authRequire ,async (req, res) => {

  try {
    const callerId = req.cookies.userId;

    const {data: isUserFound, error: noUser} = await req.supabase
    .from('profiles')
    .select('username, user_id, email, searchable')
    .or(`username.ilike.${req.body.isUser},email.ilike.${req.body.isUser}`)
    .limit(1)

    if (noUser) {
      return res.status(400).json({success: false, error: noUser.message})
    }

    if (isUserFound.length === 0) {
      return res.json({success: true, match: false})
    }

    const found = isUserFound[0];

    // If the found user has opted out of search, check for a shared group before exposing them
    if (found.searchable === false) {
      const [{ data: callerGroups }, { data: foundGroups }] = await Promise.all([
        req.supabase
          .from('profiles_groups')
          .select('groups_id')
          .eq('user_id', callerId)
          .eq('invite_status', 'accepted'),
        req.supabase
          .from('profiles_groups')
          .select('groups_id')
          .eq('user_id', found.user_id)
          .eq('invite_status', 'accepted'),
      ]);

      const callerGroupIds = new Set((callerGroups || []).map(r => r.groups_id));
      const sharesGroup = (foundGroups || []).some(r => callerGroupIds.has(r.groups_id));

      if (!sharesGroup) {
        return res.json({success: true, match: false})
      }
    }

    res.json({success: true, match: true, user: {
      username: found.username,
      user_id: found.user_id,
      email: found.email
    }})

  } catch (error) {
    res.status(500).json({success: false, error: `Internal server error occurred.${error.message}`})
  }

});

/**
 * GET /api/users/search?q=&groups_id=
 * Search for searchable users by username or email substring.
 * Returns at most 10 matches, excluding the requesting user and (optionally)
 * users already in the given group.
 */
router.get('/users/search', authRequire, async (req, res) => {
  try {
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (raw.length < 2 || raw.length > 100) {
      return res.json({ success: true, users: [] });
    }

    // Sanitize for PostgREST or() filter syntax — strip injection-capable chars
    const q = raw.replace(/[,()%*]/g, '');
    if (q.length < 2) {
      return res.json({ success: true, users: [] });
    }

    let query = req.supabase
      .from('profiles')
      .select('user_id, username, email')
      .eq('searchable', true)
      .or(`username.ilike.*${q}*,email.ilike.*${q}*`)
      .neq('user_id', req.cookies.userId)
      .limit(10);

    const { data: users, error } = await query;
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    let results = users || [];

    // Optionally exclude users already in a given group (any invite_status)
    const groupsId = req.query.groups_id ? parseInt(req.query.groups_id) : NaN;
    if (!isNaN(groupsId) && results.length > 0) {
      const { data: existingMembers, error: membersError } = await req.supabase
        .from('profiles_groups')
        .select('user_id')
        .eq('groups_id', groupsId)
        .in('user_id', results.map(u => u.user_id));

      if (!membersError && existingMembers) {
        const memberIds = new Set(existingMembers.map(m => m.user_id));
        results = results.filter(u => !memberIds.has(u.user_id));
      }
    }

    return res.json({
      success: true,
      users: results.map(u => ({ user_id: u.user_id, username: u.username, email: u.email })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
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

    // Notify each newly-invited user (respects their notification prefs)
    const { data: invitedGroup } = await req.supabase
      .from('groups')
      .select('groups_title')
      .eq('groups_id', req.body.groupId)
      .single();
    const invitedGroupTitle = invitedGroup?.groups_title || 'a group';
    await notifyUsers(req.supabase, users2Invite.map(u => u.user_id), 'group_invite', {
      title: 'New group invite',
      body: `You've been invited to ${invitedGroupTitle}.`,
      link: '/groups',
    });

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

router.post('/createGroup', authRequire, attachTier, checkLimit('groups'), async (req, res) => {

  // Optional creator-picked color (hex only — same validation as setGroupSharedColor)
  const sharedColor = typeof req.body['shared-color'] === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body['shared-color'])
    ? req.body['shared-color']
    : null;

  const {data: newGroup, error: newGroupError} = await req.supabase
  .from('groups')
  .insert({
      groups_title: req.body['group-title'],
      groups_description: req.body['group-description'],
      tag_name: req.body['tag-name'],
      ...(sharedColor && { shared_color: sharedColor }),
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

  if (!/^#[0-9a-fA-F]{6}$/.test(sharedColor)) {
    return res.status(400).json({ success: false, error: 'sharedColor must be a hex color like #aabbcc.' });
  }

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupsId)
    .eq('user_id', req.cookies.userId)
    .single();

  if (membershipError || membership?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only group admins can change the shared color.' });
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

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ success: false, error: 'color must be a hex color like #aabbcc.' });
  }

  const { error } = await req.supabase
    .from('profiles_groups')
    .update({ color })
    .eq('groups_id', groupsId)
    .eq('user_id', req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  res.json({ success: true });
});

// GET /api/groupActivity/:groupId
// Returns the last 20 activity items across the group, sorted by created_at DESC.
// Sources: event_added, task_completed, member_joined, rsvp_going.
// Each source is fetched in parallel; per-source errors are caught and logged
// individually so a missing column never fails the whole request.
router.get('/groupActivity/:groupId', authRequire, async (req, res) => {
  const { groupId } = req.params;
  const userId = req.cookies.userId;

  // Security: verify requesting user is an accepted member of this group
  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('user_id')
    .eq('groups_id', groupId)
    .eq('user_id', userId)
    .eq('invite_status', 'accepted')
    .single();

  if (membershipError || !membership) {
    return res.status(403).json({ success: false, error: 'You are not a member of this group.' });
  }

  // Source 1: event_added
  // events.created_by and events.created_at both confirmed to exist.
  const fetchEventAdded = async () => {
    const { data, error } = await req.supabase
      .from('events')
      .select('event_id, event_title, created_at, profiles!events_created_by_fkey(username)')
      .eq('groups_id', groupId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[groupActivity] event_added query failed:', error.message);
      return [];
    }

    return (data || [])
      .filter(e => e.created_at && e.profiles?.username)
      .map(e => ({
        user_id: null,
        username: e.profiles.username,
        action_type: 'event_added',
        object_title: e.event_title,
        created_at: e.created_at,
      }));
  };

  // Source 2: task_completed
  // task.updated_at does NOT exist in this schema; profiles_task has no timestamp either.
  // Skipped — would produce items with no sortable created_at.
  const fetchTaskCompleted = async () => {
    // Column task.updated_at does not exist in this schema.
    // Returning empty array to preserve merge logic without erroring.
    return [];
  };

  // Source 3: member_joined
  // profiles_groups.joined_at confirmed to exist.
  const fetchMemberJoined = async () => {
    const { data, error } = await req.supabase
      .from('profiles_groups')
      .select('user_id, joined_at, profiles(username)')
      .eq('groups_id', groupId)
      .eq('invite_status', 'accepted')
      .order('joined_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[groupActivity] member_joined query failed:', error.message);
      return [];
    }

    return (data || [])
      .filter(pg => pg.joined_at && pg.profiles?.username)
      .map(pg => ({
        user_id: pg.user_id,
        username: pg.profiles.username,
        action_type: 'member_joined',
        object_title: null,
        created_at: pg.joined_at,
      }));
  };

  // Source 4: rsvp_going
  // profiles_events.created_at does NOT exist in this schema.
  // Skipped — items would have no created_at and be filtered out anyway.
  const fetchRsvpGoing = async () => {
    // Column profiles_events.created_at does not exist in this schema.
    return [];
  };

  const [eventAdded, taskCompleted, memberJoined, rsvpGoing] = await Promise.all([
    fetchEventAdded(),
    fetchTaskCompleted(),
    fetchMemberJoined(),
    fetchRsvpGoing(),
  ]);

  const merged = [...eventAdded, ...taskCompleted, ...memberJoined, ...rsvpGoing]
    .filter(item => item.created_at && item.username)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20);

  res.json({ success: true, activity: merged });
});

// ─── Shareable group invite links ────────────────────────────────────────────

/**
 * POST /api/generateInviteLink
 * Admin-only. Creates a time-limited invite token for a group.
 * Body: { groupId: number }
 * Returns: { success: true, token: uuid, url: string }
 */
router.post('/generateInviteLink', authRequire, async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ success: false, error: 'groupId is required.' });
  }

  // Verify the caller is an admin of this group
  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupId)
    .eq('user_id', req.cookies.userId)
    .single();

  if (membershipError || membership?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only group admins can generate invite links.' });
  }

  // Insert the token row — RLS insert policy checks admin role again server-side
  const { data: tokenRow, error: tokenError } = await req.supabase
    .from('group_invite_tokens')
    .insert({ groups_id: groupId, created_by: req.cookies.userId })
    .select('token')
    .single();

  if (tokenError) {
    return res.status(500).json({ success: false, error: tokenError.message });
  }

  const base = process.env.APP_URL || 'http://localhost:5173';
  return res.json({
    success: true,
    token: tokenRow.token,
    url: `${base}/join/${tokenRow.token}`,
  });
});

/**
 * GET /api/joinGroup/:token
 * PUBLIC — no auth required. Returns a preview of the group behind the link.
 * Does NOT join the user; the POST below handles that.
 */
router.get('/joinGroup/:token', async (req, res) => {
  const { token } = req.params;

  // Use the anon singleton — this is a public, read-only preview
  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from('group_invite_tokens')
    .select('token, groups_id, expires_at, max_uses, use_count')
    .eq('token', token)
    .single();

  if (tokenError || !tokenRow) {
    return res.status(404).json({ success: false, error: 'Invalid or expired invite link.' });
  }

  const now = new Date();
  if (new Date(tokenRow.expires_at) < now || tokenRow.use_count >= tokenRow.max_uses) {
    return res.status(404).json({ success: false, error: 'Invalid or expired invite link.' });
  }

  // Fetch group info + member count in parallel
  const [{ data: group, error: groupError }, { count, error: countError }] = await Promise.all([
    supabaseAdmin
      .from('groups')
      .select('groups_title, tag_name')
      .eq('groups_id', tokenRow.groups_id)
      .single(),
    supabaseAdmin
      .from('profiles_groups')
      .select('user_id', { count: 'exact', head: true })
      .eq('groups_id', tokenRow.groups_id)
      .eq('invite_status', 'accepted'),
  ]);

  if (groupError) {
    return res.status(500).json({ success: false, error: groupError.message });
  }

  return res.json({
    success: true,
    groupName: group.groups_title,
    memberCount: count ?? 0,
    tag: group.tag_name,
    token,
  });
});

/**
 * POST /api/joinGroup/:token
 * AUTHENTICATED. Validates the token and adds the current user as a member.
 */
router.post('/joinGroup/:token', authRequire, async (req, res) => {
  const { token } = req.params;
  const userId = req.cookies.userId;

  // Validate token (use req.supabase so RLS is enforced with the user's JWT)
  const { data: tokenRow, error: tokenError } = await req.supabase
    .from('group_invite_tokens')
    .select('token, groups_id, expires_at, max_uses, use_count')
    .eq('token', token)
    .single();

  if (tokenError || !tokenRow) {
    return res.status(404).json({ success: false, error: 'Invalid or expired invite link.' });
  }

  const now = new Date();
  if (new Date(tokenRow.expires_at) < now || tokenRow.use_count >= tokenRow.max_uses) {
    return res.status(404).json({ success: false, error: 'Invalid or expired invite link.' });
  }

  // Check if user is already a member
  const { data: existing } = await req.supabase
    .from('profiles_groups')
    .select('user_id, invite_status')
    .eq('groups_id', tokenRow.groups_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.invite_status === 'accepted') {
    return res.status(409).json({ success: false, error: 'You are already a member of this group.' });
  }

  // Fetch group name for the response
  const { data: group, error: groupError } = await supabaseAdmin
    .from('groups')
    .select('groups_title')
    .eq('groups_id', tokenRow.groups_id)
    .single();

  if (groupError) {
    return res.status(500).json({ success: false, error: groupError.message });
  }

  // Add the user as an accepted member
  const { error: insertError } = await req.supabase
    .from('profiles_groups')
    .upsert({
      groups_id: tokenRow.groups_id,
      user_id: userId,
      role: 'member',
      invite_status: 'accepted',
    });

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  // Increment use_count via the admin client (bypasses RLS update restriction)
  await supabaseAdmin
    .from('group_invite_tokens')
    .update({ use_count: tokenRow.use_count + 1 })
    .eq('token', token);

  return res.json({
    success: true,
    groupId: tokenRow.groups_id,
    groupName: group.groups_title,
  });
});

// PATCH /api/groups/:groupId — edit group metadata (admin only)
router.patch('/groups/:groupId', authRequire, async (req, res) => {
  const { groupId } = req.params;
  const callerId = req.cookies.userId;

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupId)
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ success: false, error: membershipError.message });
  }
  if (!membership) {
    return res.status(403).json({ success: false, error: 'Only group admins can edit the group.' });
  }

  const updates = {};
  if (req.body.groups_title !== undefined)       updates.groups_title       = req.body.groups_title;
  if (req.body.groups_description !== undefined) updates.groups_description = req.body.groups_description;
  if (req.body.tag_name !== undefined)           updates.tag_name           = req.body.tag_name;

  const { data: updatedGroup, error: updateError } = await req.supabase
    .from('groups')
    .update(updates)
    .eq('groups_id', groupId)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  return res.json({ success: true, group: updatedGroup });
});

// DELETE /api/groups/:groupId — delete group and all associated data (admin only)
router.delete('/groups/:groupId', authRequire, async (req, res) => {
  const { groupId } = req.params;
  const callerId = req.cookies.userId;

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupId)
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ success: false, error: membershipError.message });
  }
  if (!membership) {
    return res.status(403).json({ success: false, error: 'Only group admins can delete the group.' });
  }

  // 1. Fetch task_list IDs for this group so we can delete child tasks first
  const { data: taskLists, error: taskListFetchError } = await req.supabase
    .from('task_list')
    .select('task_list_id')
    .eq('groups_id', groupId);

  if (taskListFetchError) {
    return res.status(500).json({ success: false, error: taskListFetchError.message });
  }

  if (taskLists && taskLists.length > 0) {
    const taskListIds = taskLists.map(tl => tl.task_list_id);

    const { error: taskDeleteError } = await req.supabase
      .from('task')
      .delete()
      .in('task_list_id', taskListIds);

    if (taskDeleteError) {
      return res.status(500).json({ success: false, error: taskDeleteError.message });
    }
  }

  // 2. Delete task_list rows
  const { error: taskListDeleteError } = await req.supabase
    .from('task_list')
    .delete()
    .eq('groups_id', groupId);

  if (taskListDeleteError) {
    return res.status(500).json({ success: false, error: taskListDeleteError.message });
  }

  // 3. Fetch event IDs for this group so we can delete profiles_events first
  const { data: events, error: eventFetchError } = await req.supabase
    .from('events')
    .select('event_id')
    .eq('groups_id', groupId);

  if (eventFetchError) {
    return res.status(500).json({ success: false, error: eventFetchError.message });
  }

  if (events && events.length > 0) {
    const eventIds = events.map(e => e.event_id);

    const { error: profilesEventsDeleteError } = await req.supabase
      .from('profiles_events')
      .delete()
      .in('event_id', eventIds);

    if (profilesEventsDeleteError) {
      return res.status(500).json({ success: false, error: profilesEventsDeleteError.message });
    }
  }

  // 4. Delete events
  const { error: eventsDeleteError } = await req.supabase
    .from('events')
    .delete()
    .eq('groups_id', groupId);

  if (eventsDeleteError) {
    return res.status(500).json({ success: false, error: eventsDeleteError.message });
  }

  // 5. Delete group_invite_tokens
  const { error: tokensDeleteError } = await req.supabase
    .from('group_invite_tokens')
    .delete()
    .eq('groups_id', groupId);

  if (tokensDeleteError) {
    return res.status(500).json({ success: false, error: tokensDeleteError.message });
  }

  // 6. Delete profiles_groups
  const { error: profilesGroupsDeleteError } = await req.supabase
    .from('profiles_groups')
    .delete()
    .eq('groups_id', groupId);

  if (profilesGroupsDeleteError) {
    return res.status(500).json({ success: false, error: profilesGroupsDeleteError.message });
  }

  // 7. Delete the group itself
  const { error: groupDeleteError } = await req.supabase
    .from('groups')
    .delete()
    .eq('groups_id', groupId);

  if (groupDeleteError) {
    return res.status(500).json({ success: false, error: groupDeleteError.message });
  }

  return res.json({ success: true });
});

// POST /api/groups/:groupId/leave — leave a group
router.post('/groups/:groupId/leave', authRequire, async (req, res) => {
  const { groupId } = req.params;
  const callerId = req.cookies.userId;

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupId)
    .eq('user_id', callerId)
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ success: false, error: membershipError.message });
  }
  if (!membership) {
    return res.status(404).json({ success: false, error: 'You are not a member of this group.' });
  }

  // If caller is an admin, ensure at least one other admin exists before leaving
  if (membership.role === 'admin') {
    const { count, error: adminCountError } = await req.supabase
      .from('profiles_groups')
      .select('user_id', { count: 'exact', head: true })
      .eq('groups_id', groupId)
      .eq('role', 'admin')
      .neq('user_id', callerId);

    if (adminCountError) {
      return res.status(500).json({ success: false, error: adminCountError.message });
    }

    if (count === 0) {
      return res.status(400).json({
        success: false,
        error: 'You are the only admin. Delete the group or promote another member first.',
      });
    }
  }

  const { error: deleteError } = await req.supabase
    .from('profiles_groups')
    .delete()
    .eq('groups_id', groupId)
    .eq('user_id', callerId);

  if (deleteError) {
    return res.status(500).json({ success: false, error: deleteError.message });
  }

  return res.json({ success: true });
});

// DELETE /api/groups/:groupId/members/:userId — kick a member (admin only)
router.delete('/groups/:groupId/members/:userId', authRequire, async (req, res) => {
  const { groupId, userId } = req.params;
  const callerId = req.cookies.userId;

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('role')
    .eq('groups_id', groupId)
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ success: false, error: membershipError.message });
  }
  if (!membership) {
    return res.status(403).json({ success: false, error: 'Only group admins can remove members.' });
  }

  if (userId === callerId) {
    return res.status(400).json({ success: false, error: 'Cannot remove yourself. Use leave instead.' });
  }

  const { error: deleteError } = await req.supabase
    .from('profiles_groups')
    .delete()
    .eq('groups_id', groupId)
    .eq('user_id', userId);

  if (deleteError) {
    return res.status(500).json({ success: false, error: deleteError.message });
  }

  return res.json({ success: true });
});

export default router;