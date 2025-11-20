const selectedUsers = document.querySelector('#selectedUsers');
const selectedUsersModal = document.querySelector('#selectedUsersModal');
const addUserBtn = document.querySelector('#addUserBtn');

const addUserBtnModal = document.querySelector('#addUserBtnModal');

const userToAdd = document.querySelector('#invite-user');
const closeBtnModal = document.querySelectorAll('#close-btn');

const inviteUserInput = document.querySelector('#invite-user-input');
const closeBtnInvite = document.querySelectorAll('#close-btn-invite');
const inviteUserBtn = document.querySelectorAll('#invite-user-btn');
const inviteUserModal = document.querySelector('#invite-user-modal');

const modalOverlayGroups = document.querySelector('#modal-overlay-groups');
const createGroupBtn = document.querySelector('#create-group-btn');

const formInviteUsers = document.querySelector('#form-modal-invite');
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

closeBtnInvite.forEach(c => c.addEventListener('click', function() {
    modalOverlayGroups.classList.remove('active');
    inviteUserModal.classList.remove('active');
    // Clean users saved from searching
    document.querySelector('#invite-user-input').value = '';
    const usersIsAdded = selectedUsersModal.getElementsByTagName('*') || [];
    [...usersIsAdded].forEach(n => {
        n.remove();        
    });
}))

createGroupBtn.addEventListener('click', function () {
    modalOverlayGroups.classList.add('active');
})

inviteUserBtn.forEach(i => i.addEventListener('click', function () {
    inviteUserModal.classList.add('active');
}))

inviteUserInput.addEventListener('keydown', async function (e) {
    if (e.key === "Enter") {
        e.preventDefault(); // Only use it after finding correct Key else cant type
        checkUserExist();
    }
})

addUserBtnModal.addEventListener('click', async function (e) {
    e.preventDefault();
    checkUserExist();
})

//Catch event form submit
formInviteUsers.addEventListener('submit', async function (e) {
    e.preventDefault();

    const groupId = document.querySelector('#invite-user-btn').dataset.groupId;
    document.querySelector('#invite-user-input').value = '';
    const usersIsAdded = selectedUsersModal.getElementsByTagName('*') || [];
    const userList = [...usersIsAdded].map(n => {
        
        return {username: n.textContent, user_id: n.dataset.userId}
    });
    try {
        const response = await axios.post('/inviteUsers', {userList: userList, groupId: groupId });

        if (response.data.success) {
            alert('User(s) have been invited to your Group');
        } else {
            alert(response.data?.error);
        }
    } catch (error) {
        alert(`Internal server error could not handle request: ${e}`);
    }
})

async function checkUserExist () {
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
                span.setAttribute('data-user-id', response.data.user.user_id)
                span.textContent = response.data.user.username;

                selectedUsersModal.appendChild(span);
                document.querySelector('#invite-user-input').value = '';
                
            } else {
                alert('User does not exist in the application.')
            }
        }
    } catch (e) {
        console.log(e);
    }
}

async function inviteUser (isUser) {
    
}