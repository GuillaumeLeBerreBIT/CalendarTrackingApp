const addUserBtn = document.querySelector('#addUserBtn');
const userToAdd = document.querySelector('#invite-user');
const selectedUsers = document.querySelector('#selectedUsers');
const closeBtnModal = document.querySelectorAll('.close-btn');
// Showing the Modal to create a group
const modalOverlayGroups = document.querySelector('#modal-overlay-groups');
const createGroupBtn = document.querySelector('#create-group-btn');
const formModalGroup = document.querySelector('#form-modal-groups');

const addUserBtnModal = document.querySelector('#addUserBtnModal');
const inviteUserInput = document.querySelector('#invite-user-input');
const selectedUsersModal = document.querySelector('#selectedUsersModal');
const closeBtnInvite = document.querySelectorAll('#close-btn-invite');
// Handling showing Invite modal
const inviteUserBtn = document.querySelectorAll('.invite-user-btn');
const inviteUserModal = document.querySelector('#invite-user-modal');
//Handling form data
const formInviteUsers = document.querySelector('#form-modal-invite');
const sendInviteUsers = document.querySelector('#sendInviteUsers');

// addUserBtn.addEventListener('click', function (e) {
//     e.preventDefault();

//     const userText = userToAdd.value;
//     const newDiv = document.createElement('div');

//     newDiv.innerText = userText;
//     newDiv.classList.add("badge-secondary");

//     selectedUsers.appendChild(newDiv);

//     userToAdd.value = '';

// });

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

inviteUserBtn.forEach(i => {i.addEventListener('click', function () {
    inviteUserModal.classList.add('active');
});})

inviteUserInput.addEventListener('keydown', async function (e) {
    if (e.key === "Enter") {
        e.preventDefault(); // Only use it after finding correct Key else cant type
        checkUserExist(document.querySelector('#invite-user-input'),
        document.querySelector('#selectedUsersModal'));
    }
})

addUserBtnModal.addEventListener('click', async function (e) {
    e.preventDefault();
    checkUserExist(document.querySelector('#invite-user-input'),
        document.querySelector('#selectedUsersModal'));
})

userToAdd.addEventListener('keydown', async function (e) {
    if (e.key === "Enter") {
        e.preventDefault(); // Only use it after finding correct Key else cant type
        checkUserExist(document.querySelector('#invite-user'),
        document.querySelector('#selectedUsers'));
    }
})

addUserBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    checkUserExist(document.querySelector('#invite-user'),
        document.querySelector('#selectedUsers'));
})

//Catch event form submit
formInviteUsers.addEventListener('submit', async function (e) {
    e.preventDefault();
    inviteUser(document.querySelector('#invite-user-input'),
        document.querySelector('#selectedUsersModal'),
        document.querySelector('#invite-user-btn'));
})

formModalGroup.addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = new FormData(formModalGroup);

    payload = {}
    for (let [key, val] of form.entries()) {
        payload[key] = val;
    }

    const allUserTags = selectedUsers.getElementsByTagName('*') || [];
    let users2Invite = [...allUserTags].map(tag => (
        {
            username: tag.textContent,
            user_id: tag.dataset.userId
        }))

    if (users2Invite.length > 0) payload.usersInvite = users2Invite;

    try {
        const response = await axios.post('/createGroup', payload);

        if (!response.success) {
            alert(`Could not create the group: ${response.error}`)
            return
        } 


    } catch (error) {
        console.log(`Internal server error, couldn't handle the request: ${error}`)
    }

    // Invite the user to the current group.
    // inviteUser();
})

async function checkUserExist (inputField, usersToInvite) {
    const isUser = inputField.value;
    const usersIsAdded = usersToInvite.getElementsByTagName('*') || [];

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

                usersToInvite.appendChild(span);
                inputField.value = '';
                
            } else {
                alert('User does not exist in the application.')
            }
        }
    } catch (e) {
        console.log(e);
    }
}

async function inviteUser (inputField, usersToInvite, groupInvUserBtn) {
    const groupId = groupInvUserBtn.dataset.groupId;
    inputField.value = '';
    const usersIsAdded = usersToInvite.getElementsByTagName('*') || [];
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
}