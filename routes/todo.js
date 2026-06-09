import express from "express";
import supabase from "../db/supabase.js";
import authRequire from "../utils/utils.js";

const router = express.Router();

router.get("/todo", authRequire, async (req, res) => {
  const { data: groupObj, error: profileError } = await req.supabase
    .from("profiles")
    .select(
      `
      profiles_groups!inner(
        groups_id,
        groups(
          tag_name
        )
      )`,
    )
    .eq("profiles_groups.user_id", req.cookies.userId);

  // User may have no group memberships — guard against undefined
  const memberships = groupObj?.[0]?.profiles_groups || [];

  const groupIDs = memberships.map((pg) => pg.groups_id);

  const tagNameObj = memberships
    .filter((pg) => pg.groups?.tag_name !== null)
    .map((pg) => ({ gid: pg.groups_id, tag: pg.groups.tag_name }));

  if (groupIDs.length === 0) {
    return res.json({ success: true, yourTaskLists: [], groupTagObj: [] });
  }

  const { data: task_list, error: taskListError } = await req.supabase
    .from("task_list")
    .select(
      `
    *,
    groups!inner(
    *,
    profiles_groups!inner(
    invite_status,
    profiles!inner (
    username
    )
    )
    )
    `,
    )
    .in("groups_id", groupIDs)
    .eq("groups.profiles_groups.invite_status", "accepted");

  if (taskListError) {
    return res.status(500).json({ success: false, error: taskListError.message });
  }

  const yourTaskListsPromises = (task_list || []).map(async (tl) => {
    const { data: tasks, error: errorTasks } = await req.supabase
      .from("task")
      .select(`*, profiles_task!left(user_id, profiles!inner(username))`)
      .eq("task_list_id", tl.task_list_id);

    if (errorTasks) {
      return {
        taskListInfo: {
          title: tl.task_list_title,
          desc: tl.task_list_description,
          tag_group: tl.groups.tag_name,
          idTl: tl.task_list_id,
          idG: tl.groups_id,
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
        idG: tl.groups_id,
      },
      taskItems:
        tasks
          .map((t) => {
            const assignees = (t.profiles_task || [])
              .filter((pt) => pt?.user_id)
              .map((pt) => ({ userId: pt.user_id, username: pt.profiles?.username || null }));
            return { ...t, assignees };
          })
          .sort(function (x, y) {
            return x.is_completed === y.is_completed
              ? 0
              : x.is_completed
                ? 1
                : -1;
          }) || [],
      totalTasks: tasks.length || 0,
      totalCompletedTasks:
        tasks.filter((t) => t.is_completed === true).length || 0,
      progressWidth: (() => {
        const total = tasks.length;
        const completedTasks = tasks.filter(
          (t) => t.is_completed === true,
        ).length;
        return total > 0 ? (completedTasks / total) * 100 : 0;
      })(),
    };
  });

  const yourTaskLists = await Promise.all(yourTaskListsPromises);

  res.json({
    success: true,
    yourTaskLists,
    groupTagObj: tagNameObj || [],
    currentUserId: req.cookies.userId,
  });
});

router.post("/createTaskList", authRequire, async (req, res) => {
  const { data: createTaskList, error: createTaskListError } = await req.supabase
    .from("task_list")
    .insert([
      {
        task_list_title: req.body.title,
        task_list_description: req.body.description,
        groups_id: req.body.groups_id,
      },
    ])
    .select();

  const { data: tagName, error: tagNameError } = await req.supabase
    .from("groups")
    .select("tag_name")
    .eq("groups_id", req.body.groups_id);

  if (createTaskListError) {
    res
      .status(400)
      .json({ success: false, error: "Unable to create Task List" });
  } else {
    res.json({
      success: true,
      createTaskList: createTaskList,
      tagName: tagName?.[0].tag_name || null,
    });
  }
});

router.post("/createTask", authRequire, async (req, res) => {
  const { data: insertTask, error: insertTaskError } = await req.supabase
    .from("task")
    .insert([
      {
        task_title: req.body.task_title,
        task_description: req.body.task_description,
        priority: req.body.priority,
        due_date: req.body?.due_date || null,
        task_list_id: req.body.task_list_id,
      },
    ])
    .select()
    .single();

  if (req.body.members && req.body.members.length >= 1) {
    const { data, error } = await req.supabase
      .from("profiles_task")
      .insert(
        req.body.members.map((m) => {
          return {
            user_id: m,
            task_id: insertTask.task_id,
            status: "accepted",
          };
        }),
      )
      .select();

    if (error) {
      console.log(`Could not add users: ${error}`);
    } else {
      let { data: usersTask } = await req.supabase
        .from("profiles")
        .select("username, user_id")
        .in("user_id", req.body.members);

        if (usersTask) insertTask.members = usersTask;
    }
  }

  if (insertTaskError) {
    res.json({ success: false, message: "Unable to create a Task." });
  } else {
    res.json({ success: true, insertTask });
  }
});

router.patch("/updateTaskDetails", authRequire, async (req, res) => {
  const { task_id, task_title, task_description, priority, due_date, members } = req.body;

  // Ownership check: verify the task belongs to a group the requesting user is a member of
  const { data: taskMeta, error: taskMetaError } = await req.supabase
    .from("task")
    .select("task_list_id, task_list(groups_id)")
    .eq("task_id", task_id)
    .single();

  if (taskMetaError || !taskMeta) {
    return res.status(404).json({ success: false, error: 'Task not found.' });
  }

  const groupsId = taskMeta.task_list?.groups_id;
  const { data: membership, error: membershipError } = await req.supabase
    .from("profiles_groups")
    .select("user_id")
    .eq("groups_id", groupsId)
    .eq("user_id", req.cookies.userId)
    .eq("invite_status", "accepted")
    .single();

  if (membershipError || !membership) {
    return res.status(403).json({ success: false, error: 'You do not have access to this task.' });
  }

  const { data: updatedTask, error: updateError } = await req.supabase
    .from("task")
    .update({
      task_title,
      task_description: task_description || null,
      priority,
      due_date: due_date || null,
    })
    .eq("task_id", task_id)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  await req.supabase.from("profiles_task").delete().eq("task_id", task_id);

  if (members && members.length > 0) {
    await req.supabase.from("profiles_task").insert(
      members.map((m) => ({ user_id: m, task_id, status: "accepted" }))
    );

    const { data: updatedMembers } = await req.supabase
      .from("profiles")
      .select("username, user_id")
      .in("user_id", members);

    updatedTask.members = updatedMembers || [];
  } else {
    updatedTask.members = [];
  }

  res.json({ success: true, updatedTask });
});

router.patch("/updateTask", authRequire, async (req, res) => {
  // Ownership check: verify the task belongs to a group the requesting user is a member of
  const { data: taskMeta, error: taskMetaError } = await req.supabase
    .from("task")
    .select("task_list_id, task_list(groups_id)")
    .eq("task_id", req.body.taskId)
    .single();

  if (taskMetaError || !taskMeta) {
    return res.status(404).json({ success: false, error: 'Task not found.' });
  }

  const groupsId = taskMeta.task_list?.groups_id;
  const { data: membership, error: membershipError } = await req.supabase
    .from("profiles_groups")
    .select("user_id")
    .eq("groups_id", groupsId)
    .eq("user_id", req.cookies.userId)
    .eq("invite_status", "accepted")
    .single();

  if (membershipError || !membership) {
    return res.status(403).json({ success: false, error: 'You do not have access to this task.' });
  }

  const { data: taskUpdate, error: taskUpdateError } = await req.supabase
    .from("task")
    .update({ is_completed: req.body.isCompleted })
    .eq("task_id", req.body.taskId)
    .select();

  if (taskUpdate) {
    res.json({ success: true, taskUpdate });
  } else {
    res.json({ success: false, message: "Unable to update the task." });
  }
});

// PUT /task/:taskId/assignees  body: { userIds: string[] }
// Replaces the task's assignees with the provided set (status 'assigned').
router.put("/task/:taskId/assignees", authRequire, async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (isNaN(taskId)) return res.status(400).json({ success: false, error: "Invalid task id." });

  const userIds = req.body?.userIds;
  if (!Array.isArray(userIds)) {
    return res.status(400).json({ success: false, error: "userIds must be an array." });
  }

  // Ownership check: task must belong to a group the requesting user is an accepted member of
  const { data: taskMeta, error: taskMetaError } = await req.supabase
    .from("task")
    .select("task_list_id, task_list(groups_id)")
    .eq("task_id", taskId)
    .single();

  if (taskMetaError || !taskMeta) {
    return res.status(404).json({ success: false, error: "Task not found." });
  }

  const groupsId = taskMeta.task_list?.groups_id;
  const { data: membership, error: membershipError } = await req.supabase
    .from("profiles_groups")
    .select("user_id")
    .eq("groups_id", groupsId)
    .eq("user_id", req.cookies.userId)
    .eq("invite_status", "accepted")
    .single();

  if (membershipError || !membership) {
    return res.status(403).json({ success: false, error: "You do not have access to this task." });
  }

  // Replace existing assignees
  const { error: deleteError } = await req.supabase
    .from("profiles_task")
    .delete()
    .eq("task_id", taskId);

  if (deleteError) {
    return res.status(500).json({ success: false, error: deleteError.message });
  }

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  let assignees = [];

  if (uniqueIds.length > 0) {
    const { error: insertError } = await req.supabase
      .from("profiles_task")
      .insert(uniqueIds.map((user_id) => ({ user_id, task_id: taskId, status: "assigned" })));

    if (insertError) {
      return res.status(500).json({ success: false, error: insertError.message });
    }

    const { data: profiles } = await req.supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", uniqueIds);

    assignees = (profiles || []).map((p) => ({ userId: p.user_id, username: p.username }));
  }

  return res.json({ success: true, assignees });
});

router.get("/membersTaskList/", authRequire, async (req, res) => {
  const { taskListId } = req.query;
  try {
    const { data: taskList } = await req.supabase
      .from("task_list")
      .select("groups_id")
      .eq("task_list_id", taskListId)
      .single();

    const { data: taskMembers, error: taskMembersError } = await req.supabase
      .from("profiles_groups")
      .select(`user_id, profiles!left(username))`)
      .eq("groups_id", taskList["groups_id"])
      .eq("invite_status", "accepted");

    if (taskMembersError) {
      return res
        .status(500)
        .json({ success: "false", message: taskMembersError.message });
    }

    const members = taskMembers?.map((tm) => {
      const username = tm?.profiles?.username;
      const userId = tm?.["user_id"];

      return {
        username: username,
        userId: userId,
      };
    });

    return res.status(200).json({ success: true, members: members });
  } catch (error) {
    return res.status(404).json({ success: "false", message: error.message });
  }
});

export default router;
