const btnNewList = document.querySelector("#btn-new-list");

const modalNewList = document.querySelector("#modal-overlay-new-list");
const modalNewTask = document.querySelector("#modal-overlay-new-task");

const tagNameList = document.querySelector("#tag_name");
const hiddenGroups = document.querySelector("#groups_id");

const submitTaskList = document.querySelector("#task-list-submit");
const formTaskList = document.querySelector("#task-list-form");

const formTask = document.querySelector("#task-form");
const closeBtnTask = document.querySelector("#close-btn-task");
const closeNewList = document.querySelector("#close-btn");

const searchTask = document.querySelector('#search-task');
const selectTasks = document.querySelector('#select-tasks')
const taskCards = document.querySelectorAll('div.task-card.card-shape');


function updateGroupID() {
  const tags = document.querySelector("#tag_name");
  const selectedOption = tags.options[tags.selectedIndex];
  hiddenGroups.value = selectedOption.value;
}

closeNewList.addEventListener("click", function (e) {
  modalNewList.classList.remove("set-display-flex");
});

closeBtnTask.addEventListener("click", function () {
  modalNewTask.classList.remove("set-display-flex");
});

tagNameList.addEventListener("change", updateGroupID);

btnNewList.addEventListener("click", function (e) {
  modalNewList.classList.add("set-display-flex");
  updateGroupID();
});

// ADD EVENT LISTENER TO ALL ADD TASK BUTTONS
document.querySelectorAll(".group-card.card-shape").forEach((c) => {
  const btnAddTask = c.querySelector(".add-task-btn");
  c.querySelectorAll('.task-container').forEach(tc => {checkCompletedTasks(tc)});

  btnAddTask.addEventListener("click", function (e) {

    addAssignees(this.dataset.taskListId);

    modalNewTask.classList.add("set-display-flex");
    modalNewTask.querySelector("#task_list_id").value = this.dataset.taskListId; // Need to check why this
  });

});

async function addAssignees(taskListId) {

  try {

    const response = await axios.get('/membersTaskList/', {
      params: { taskListId: taskListId}
    })

    if (!response.data.success) {
      console.log('No members could not be found.')
      return
    }

    const { members } = response.data

    document.querySelector('#assign-member-container').innerHTML = ''

    members.forEach(m => {

      const newDiv = document.createElement('div');
      newDiv.className = "user-pill"
      newDiv.dataset.userId = m.userId
      newDiv.textContent = m.username

      newDiv.addEventListener('click', (event) => {
        event.stopPropagation()

        event.currentTarget.classList.toggle('selected')
      })

      document.querySelector('#assign-member-container').appendChild(newDiv)

    })
    
  } catch (error) {
    console.log(`Could not retrieve any of the users from Task List: ${e}`)
  }

}

searchTask.addEventListener('input', (e) => {
  [...taskCards].forEach(c => {

    const task = c.querySelector('h4')?.textContent;
    if (task.toLowerCase().includes(e.target.value.toLowerCase())) {
      console.log(task)
      c.classList.remove('hidden')
    } else {
      c.classList.add('hidden')
    }
  })
  
})

selectTasks.addEventListener('change', (e) => {

  const action = e.target.value

  if (action === 'all') {
    [...taskCards].forEach(c => {
      c.classList.contains('hidden') ? c.classList.remove('hidden') : null
    })
  } else if (action === 'completed') {
    [...taskCards].forEach(c => {
      c.querySelector('input[type=checkbox]:checked') ? c.classList.remove('hidden') : c.classList.add('hidden')
    })
  
  }
})

// TASKS HANDLING
function checkCompletedTasks(taskContainer) {

  const allTasks = taskContainer.querySelectorAll('.task-card.card-shape') || [];
  allTasks.forEach((t) => {
    const isChecked = t.querySelector('input[type=checkbox]:checked') || false;

    if (isChecked) {
      t.classList.add('task-completion');
    } else {
      t.classList.remove('task-completion');
    }
  })
}

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

async function TaskUpdate(taskId, isCompleted) {
  try {
    const response = await axios.patch("/updateTask", {
      taskId: taskId,
      isCompleted: isCompleted,
    });

    if (!response.data.success) {
      alert("Something went wrong updating the task.");
    }
  } catch (e) {
    alert("Unable to update the selected task. Try again later.");
  }
}

function updateTaskUI(isChecked, taskCard) {
  //Count the tasks
  let [completedTasks, allTasks] = [0, 0];
  const taskContainer = taskCard.closest('.task-container');
  if (!taskCard.querySelector('#empty-state')) {
  completedTasks = taskContainer.querySelectorAll('input[type="checkbox"]:checked').length || 0;
  allTasks = taskContainer.querySelectorAll('input[type="checkbox"]').length;
  } 
  //Update the text
  const groupCard = taskContainer.closest('.group-card.card-shape');
  const progressSection = groupCard.querySelector('.progress-section')
  const progressBarProg = progressSection.querySelector('.progress-bar-prog');
  progressBarProg.textContent = `${completedTasks} of ${allTasks}`;
  //Update the progress bar
  const progressBar = progressSection.querySelector('.progress');
  progressBar.setAttribute('style', `width: ${(completedTasks / allTasks) * 100}%;`)
  //Update the ARIA values progress bar
  const progressCont = progressSection.querySelector('.progress-container');
  progressCont.setAttribute('aria-valuenow', completedTasks);
  progressCont.setAttribute('aria-valuemax', allTasks);
  //Cross line the task text.
  if (isChecked) {
    taskCard.classList.add('task-completion');
  } else {
    taskCard.classList.remove('task-completion');
  }
}

const debouncedTaskUpdate = debounce(TaskUpdate, 500);

document.querySelectorAll(".task-card.card-shape").forEach((t) => {
  t.querySelectorAll("input[type=checkbox]").forEach((c) => {
    c.addEventListener("change", async function () {
      updateTaskUI(this.checked, t);

      debouncedTaskUpdate(this.dataset.taskId, this.checked);
    });
  });
});

// TASKLIST FORM HANDLING TO CREATE A NEW ONE
formTaskList.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(formTaskList);

  let payload = {};
  for (let [key, val] of formData.entries()) {
    payload[key] = val;
  }

  try {
    const response = await axios.post("/createTaskList", payload);

    if (response.data.success) {
      let createdTaskList = response.data?.createTaskList[0];

      createDivTaskList(createdTaskList, payload, response.data.tagName);
    }
  } catch (e) {
    alert(`Unable to create a task list: ${e}`);
  }
});

formTask.addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = new FormData(formTask);

  payload = {};
  for (let [key, val] of form.entries()) {
    payload[key] = val;
  }

  payload.members = [...document.querySelectorAll('user-pill.selected')].map((u) => u.dataset.userId);

  const response = await axios.post("/createTask", payload);

  if (response.data.success) {
    let createdTask = response.data?.insertTask[0];

    createDivTask(createdTask);
  } else {
    alert(`Unable to create a task for this Task List: ${e}`);
  }
});

function createDivTaskList(data, payload, tagName) {
  const taskListCont = document.querySelector(".group-container");

  const templateTaskList = document.querySelector("#task-list-template");
  const cloneTaskList = templateTaskList.content.cloneNode(true);

  cloneTaskList.querySelector(".task-list-title").textContent =
    data.task_list_title;
  cloneTaskList.querySelector(".task-list-tag").textContent = tagName;
  cloneTaskList.querySelector(".task-list-description").textContent =
    data.task_list_description;

  const cardContTemp = cloneTaskList.querySelector(".group-card.card-shape");
  cardContTemp.setAttribute("data-task-list-id", String(data.task_list_id)); // Convert to string to accept in HTML content
  cardContTemp.setAttribute("data-group-id", String(data.groups_id));

  const addTaskBtnTemp = cloneTaskList.querySelector('.add-task-btn')
  addTaskBtnTemp.setAttribute('data-task-list-id', String(data.task_list_id))
  // ADD DYNAMIC CONTENT SO BUTTONS CAN BE ADDED
  // NEED TO USE A ANONYMOUS FUNCTION SINCE """THIS""" IN A ARROW FUNCTION DOESNT REFER TO TEH ELEMENT THAT IS CLICKED BUT THE LEXICAL SCOPE
  addTaskBtnTemp.addEventListener('click', function () {
    modalNewTask.classList.add("set-display-flex");
    modalNewTask.querySelector("#task_list_id").value = this.dataset.taskListId;
  })

  // Insert before the first Task List that was already loaded in.
  taskListCont.insertBefore(cloneTaskList, taskListCont.firstChild);

  modalNewList.classList.remove("set-display-flex");
  formTaskList.reset();
}

function createDivTask(data) {
  const taskTemp = document.querySelector("#task-template");
  const cloneTaskTemp = taskTemp.content.cloneNode(true);

  cloneTaskTemp.querySelector("#task-title").textContent = data.task_title;
  cloneTaskTemp.querySelector("#task-priority").textContent = data.priority;
  cloneTaskTemp.querySelector("#task-description").textContent =
    data.task_description;

  const taskCardTemp = cloneTaskTemp.querySelector(".task-card.card-shape");
  taskCardTemp.setAttribute("data-task-id", String(data.task_id));
  taskCardTemp.setAttribute("data-task-list-id", String(data.task_list_id));

  if (data.due_date) {
    cloneTaskTemp.querySelector("#task-deadline").textContent = data.due_date;
  }

  const taskListCard = document.querySelector(
    `[data-task-list-id="${data.task_list_id}"]`
  );

  if (taskListCard) {
    const taskCont = taskListCard.querySelector(".task-container");

    const emptyState = taskCont.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
      // Add the progression contents in here. 
      addProgressionContent(taskListCard)
    }

    // ADD DYNAMIC INTERACTION
    cloneTaskTemp.querySelector('input[type=checkbox]')
    .addEventListener('change', function() {
        updateTaskUI(this.checked, taskCardTemp);
        debouncedTaskUpdate(taskCardTemp.dataset.taskId, this.checked);
      })

    taskCont.appendChild(cloneTaskTemp);
    // UPDATE UI AFTER ADDING TEMP TASK CARD TO TASKLIST ITSEFL (Need to go in depth here)
    updateTaskUI(cloneTaskTemp.querySelector('input[type=checkbox]'), taskCardTemp)
    modalNewTask.classList.remove("set-display-flex");
    formTask.reset();

  } else {
    modalNewTask.classList.remove("set-display-flex");
    formTask.reset();
    alert("Unable to create task.");
  }
}

function addProgressionContent (taskListCard) {
  const progressionTemp = document.querySelector('#progress-template');
  const progressionTempClone = progressionTemp.content.cloneNode(true);
  const progressionSection = taskListCard.querySelector('.progress-section');

  progressionSection.append(progressionTempClone);
}
