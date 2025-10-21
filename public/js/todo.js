const addTaskBtn = document.querySelector('#add-task-button');
const btnNewList = document.querySelector('#btn-new-list');

const modalNewList = document.querySelector('#modal-overlay-new-list')
const closeNewList = document.querySelector('#close-btn');

const tagNameList = document.querySelector('#tag_name');
const hiddenGroups = document.querySelector('#groups_id');

btnNewList.addEventListener('click', function (e) {
    modalNewList.classList.add('set-display-flex');
    updateGroupID();
});

closeNewList.addEventListener('click', function(e) {    
    modalNewList.classList.remove('set-display-flex');
});

tagNameList.addEventListener('change', updateGroupID);

function updateGroupID () {

    const tags = document.querySelector('#tag_name');
    const selectedOption = tags.options[tags.selectedIndex];
    hiddenGroups.value = selectedOption.value;
}