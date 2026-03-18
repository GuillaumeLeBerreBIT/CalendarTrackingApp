import express from "express";
import supabase from "../db/supabase.js";
import authRequire from "../utils/utils.js";

const router = express.Router();

router.get("/todo", authRequire, async (req, res) => {
  const { data: groupObj, error: profileError } = await supabase
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

  const groupIDs = groupObj[0]?.profiles_groups.map((pg) => {
    return pg.groups_id;
  });

  const tagNameObj =
    groupObj[0]?.profiles_groups
      .filter((pg) => pg.groups.tag_name !== null)
      .map((pg) => ({ gid: pg.groups_id, tag: pg.groups.tag_name })) || [];

  const { data: task_list, error: taskListError } = await supabase
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

  const yourTaskListsPromises = task_list.map(async (tl) => {
    const { data: tasks, error: errorTasks } = await supabase
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
        tasks.sort(function (x, y) {
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

  res.render("todo.ejs", {
    yourTaskLists,
    groupTagObj: tagNameObj || [],
    currentPage: "todo",
  });
});

router.post("/createTaskList", authRequire, async (req, res) => {
  const { data: createTaskList, error: createTaskListError } = await supabase
    .from("task_list")
    .insert([
      {
        task_list_title: req.body.title,
        task_list_description: req.body.description,
        groups_id: req.body.groups_id,
      },
    ])
    .select();

  const { data: tagName, error: tagNameError } = await supabase
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
  const { data: insertTask, error: insertTaskError } = await supabase
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
    const { data, error } = await supabase
    .from("profiles_task")
    .insert(req.body.members.map(m =>  {
      return {
        user_id: m, 
        task_id: insertTask.task_id, 
        status: 'accepted'
      }}))
      .select();

      if (error) console.log(`Could not add users: ${error}`)
  }

  if (insertTaskError) {
    res.json({ success: false, message: "Unable to create a Task." });
  } else {
    res.json({ success: true, insertTask });
  }
});

router.patch("/updateTask", authRequire, async (req, res) => {
  const { data: taskUpdate, error: taskUpdateError } = await supabase
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

router.get("/membersTaskList/", async (req, res) => {
  const { taskListId } = req.query;
  try {
    const { data: taskList } = await supabase
      .from("task_list")
      .select("groups_id")
      .eq("task_list_id", taskListId)
      .single();

    const { data: taskMembers, error: taskMembersError } = await supabase
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
    return res.status(404).json({ success: "false", message: e });
  }
});

export default router;
