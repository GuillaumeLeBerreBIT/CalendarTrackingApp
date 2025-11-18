const selectedUsers = document.querySelector('#selectedUsers');
const addUserBtn = document.querySelector('#addUserBtn');
const addUserBtnModal = document.querySelector('#addUserBtnModal');
const userToAdd = document.querySelector('#invite-user');
const closeBtnModal = document.querySelectorAll('#close-btn');
const inviteUserBtn = document.querySelectorAll('#invite-user-btn')
const inviteUserModal = document.querySelector('#invite-user-modal')

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

closeBtnModal.forEach(c => c.addEventListener('click', function() {
    modalOverlayGroups.classList.remove('active');
    inviteUserModal.classList.remove('active');
}))

createGroupBtn.addEventListener('click', function () {
    modalOverlayGroups.classList.add('active');
})

inviteUserBtn.forEach(i => i.addEventListener('click', function () {
    inviteUserModal.classList.add('active');
}))

addUserBtnModal.addEventListener('click', async function (e) {
    e.preventDefault()
    const isUser = document.querySelector('#invite-user-input').value;
try {
    const response = axios.post('/checkUser', {isUser: isuser})
} catch (error) {
    
}
})

async function checkUserExist (isUser) {

}

async function inviteUser (isUser) {
    
}