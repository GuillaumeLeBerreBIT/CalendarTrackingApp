const btnNewList = document.querySelector("#btn-new-list");

const modalNewList = document.querySelector("#modal-overlay-new-list");

const tagNameList = document.querySelector("#tag_name");
const hiddenGroups = document.querySelector("#groups_id");

const submitTaskList = document.querySelector("#task-list-submit");
const formTaskList = document.querySelector("#task-list-form");

const modalNewTask = document.querySelector("#modal-overlay-new-task");
const formTask = document.querySelector("#task-form");
// const btnAddTask = document.querySelector("#add-task-btn");
const closeBtnTask = document.querySelector(".close-btn-task");
const closeNewList = document.querySelector(".close-btn");

btnNewList.addEventListener("click", function (e) {
  modalNewList.classList.add("set-display-flex");
  updateGroupID();
});

// Need to add the Event Listener to all the Buttons
document.querySelectorAll(".group-card.card-shape").forEach((c) => {

    const btnAddTask = c.querySelector("#add-task-btn");

    btnAddTask.addEventListener("click", function (e) {
        modalNewTask.classList.add("set-display-flex");
        modalNewTask.querySelector("#task_list_id").value = this.dataset.taskListId; // Need to check why this

    });
});

closeNewList.addEventListener("click", function (e) {
  modalNewList.classList.remove("set-display-flex");
});

closeBtnTask.addEventListener("click", function () {
  modalNewTask.classList.remove("set-display-flex");
});

tagNameList.addEventListener("change", updateGroupID);

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

  const response = await axios.post("/createTask", payload);

  if (response.data.success) {
    let createdTask = response.data?.insertTask[0];

    createDivTask(createdTask);
  } else {
    alert(`Unable to create a task for this Task List: ${e}`);
  }

  console.log("Hel");
});

function updateGroupID() {
  const tags = document.querySelector("#tag_name");
  const selectedOption = tags.options[tags.selectedIndex];
  hiddenGroups.value = selectedOption.value;
}
function createDivTaskList(data, payload, tagName) {
  const taskListCont = document.querySelector(".group-container");

  const templateTaskList = document.querySelector("#task-list-template");
  const cloneTaskList = templateTaskList.content.cloneNode(true);

  cloneTaskList.querySelector(".task-list-title").textContent =
    data.task_list_title;
  cloneTaskList.querySelector(".task-list-tag").textContent = tagName;
  cloneTaskList.querySelector(".task-list-description").textContent =
    data.task_list_description;

  const cardCont = cloneTaskList.querySelector(".group-card.card-shape");
  cardCont.setAttribute("data-task-list-id", String(data.task_list_id));
  cardCont.setAttribute("data-group-id", String(data.groups_id));

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
    const taskCont = taskListCard.querySelector("#task-container");
    
    const emptyState = taskCont.querySelector('#empty-state');
        if (emptyState) {
            emptyState.remove();
        }
    taskCont.appendChild(cloneTaskTemp)

    
  }
}
