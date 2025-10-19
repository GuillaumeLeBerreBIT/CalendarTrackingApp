const addTaskBtn = document.querySelector('#add-task-button');
const btnNewList = document.querySelector('#btn-new-list');

const modalNewList = document.querySelector('#modal-overlay-new-list')
const closeNewList = document.querySelector('#close-btn');


btnNewList.addEventListener('click', function (e) {
    modalNewList.classList.add('set-display-flex')
});

closeNewList.addEventListener('click', function(e) {
    modalNewList.classList.remove('set-display-flex')
});
