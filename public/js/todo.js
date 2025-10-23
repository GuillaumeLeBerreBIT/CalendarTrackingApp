const addTaskBtn = document.querySelector('#add-task-button');
const btnNewList = document.querySelector('#btn-new-list');

const modalNewList = document.querySelector('#modal-overlay-new-list')
const closeNewList = document.querySelector('#close-btn');

const tagNameList = document.querySelector('#tag_name');
const hiddenGroups = document.querySelector('#groups_id');

const submitTaskList = document.querySelector('#task-list-submit');
const formTaskList = document.querySelector('#task-list-form');

btnNewList.addEventListener('click', function (e) {
    modalNewList.classList.add('set-display-flex');
    updateGroupID();
});

closeNewList.addEventListener('click', function(e) {    
    modalNewList.classList.remove('set-display-flex');
});

tagNameList.addEventListener('change', updateGroupID);

formTaskList.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(formTaskList);

    let payload = {};
    for (let [key, val] of formData.entries()) {
        payload[key] = val;
    };

    try {
        const response = await axios.post('/createTaskList', payload)
        
        if (response.status === 200) {
            let createdTaskList = response.data?.createTaskList[0]

            createDivTaskList(createdTaskList, payload,
                response.data.tagName
            );
        }

    } catch (e) {
        console.log(`Unable to create a task list: ${e}`)
    }

})

function updateGroupID () {

    const tags = document.querySelector('#tag_name');
    const selectedOption = tags.options[tags.selectedIndex];
    hiddenGroups.value = selectedOption.value;
}
function createDivTaskList (data, payload, tagName) {

    const taskListCont = document.querySelector('.group-container');

    const templateTaskList = document.querySelector('#task-list-template');
    const cloneTaskList = templateTaskList.content.cloneNode(true);

    cloneTaskList.querySelector('.task-list-title').textContent = data.task_list_title;
    cloneTaskList.querySelector('.task-list-tag').textContent = tagName;
    cloneTaskList.querySelector('.task-list-description').textContent = data.task_list_description

    const cardCont = cloneTaskList.querySelector('.group-card.card-shape');
    cardCont.setAttribute('data-task-list-id', String(data.task_list_id));
    cardCont.setAttribute('data-group-id', String(data.groups_id));

    // Insert before the first Task List that was already loaded in.
    taskListCont.insertBefore(cloneTaskList, taskListCont.firstChild)

    modalNewList.classList.remove('set-display-flex');
    formTaskList.reset();
    
}