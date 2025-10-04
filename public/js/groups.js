const selectedUsers = document.querySelector('#selectedUsers');
const addUserBtn = document.querySelector('#addUserBtn');
const userToAdd = document.querySelector('#invite-user');
const closeBtnModal = document.querySelector('#close-btn');

const modalOverlayGroups = document.querySelector('#modal-overlay-groups');
const createGroupBtn = document.querySelector('#create-group-btn');

addUserBtn.addEventListener('click', function (e) {
    e.preventDefault();

    const userText = userToAdd.value;
    const newDiv = document.createElement('div');

    newDiv.innerText = userText;
    newDiv.classList.add("badge-secondary");

    selectedUsers.appendChild(newDiv);

    userToAdd.value = '';

});

closeBtnModal.addEventListener('click', function() {

    modalOverlayGroups.classList.remove('active');
})

createGroupBtn.addEventListener('click', function () {
    modalOverlayGroups.classList.add('active');
})