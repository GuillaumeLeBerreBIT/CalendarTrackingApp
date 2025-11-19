const selectedUsers = document.querySelector('#selectedUsers');
const selectedUsersModal = document.querySelector('#selectedUsersModal');
const addUserBtn = document.querySelector('#addUserBtn');
const addUserBtnModal = document.querySelector('#addUserBtnModal');
const userToAdd = document.querySelector('#invite-user');
const closeBtnModal = document.querySelectorAll('#close-btn');
const inviteUserBtn = document.querySelectorAll('#invite-user-btn')
const inviteUserModal = document.querySelector('#invite-user-modal')

const modalOverlayGroups = document.querySelector('#modal-overlay-groups');
const createGroupBtn = document.querySelector('#create-group-btn');

const sendInviteUsers = document.querySelector('#sendInviteUsers');

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
    const usersIsAdded = selectedUsersModal.getElementsByTagName('*') || [];

    if (usersIsAdded.length > 0) {
        const usersList = [...usersIsAdded].map(u => u.textContent.toLowerCase())
        // userList.forEach(u => {return u.textContent.toLowerCase()});
        if (usersList.includes(isUser.toLowerCase())) return true;
    }

    try {
        const response = await axios.post('/checkUser', {isUser: isUser})

        if (response.data.success) {
            if (response.data.match) {

                const span = document.createElement('span');
                span.classList.add('badge-secondary');
                span.textContent = response.data.user;

                selectedUsersModal.appendChild(span);
                document.querySelector('#invite-user-input').value = '';
                
            } else {
                alert('User does not exist in the application.')
            }
        }
    } catch (e) {
        console.log(e);
    }
})

async function checkUserExist (isUser) {

}

async function inviteUser (isUser) {
    
}