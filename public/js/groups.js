const addUserBtn = document.querySelector('#addUserBtn');
const userToAdd = document.querySelector('#invite-user');
const selectedUsers = document.querySelector('#selectedUsers');
const closeBtnModal = document.querySelectorAll('#close-btn');
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

const inviteAcceptedBtn = document.querySelectorAll('#invite-accepted');
const inviteDeclinedBtn = document.querySelectorAll('#invite-declined');

closeBtnModal.forEach(c => c.addEventListener('click', function() {
    modalOverlayGroups.classList.remove('active');

    document.querySelector('#invite-user-input').value = '';
    const usersIsAdded = selectedUsers.getElementsByTagName('*') || [];
    [...usersIsAdded].forEach(n => {
        n.remove();        
    });
}))

closeBtnInvite.forEach(c => c.addEventListener('click', function() {
    inviteUserModal.classList.remove('active');
    // Clean users saved from searching
    document.querySelector('#invite-user-input').value = '';
    const usersIsAdded = selectedUsersModal.getElementsByTagName('*') || [];
    [...usersIsAdded].forEach(n => {
        n.remove();        
    });
}))

document.addEventListener('click', async (e) => {

    const acceptBtn = e.target.closest('.invite-accepted');
    const declineBtn = e.target.closest('.invite-declined');

    if (acceptBtn) {
        const groupId = acceptBtn.dataset.groupId;
        const card = acceptBtn.closest('.card-shape.group-card');
        acceptBtn.disabled = true;

        try {
            const accepted = await acceptGroup(groupId);
            
            if (accepted) {
                card.style.opacity = '0';
                card.style.transition = 'opacity 0.3s';
                setTimeout(() => card.remove(), 300);
            } else {
                showToast('Failed to accept invitation.', 'error');
                acceptBtn.disabled = false;
                acceptBtn.textContent = 'Accept';
            }
        } catch (error) {
            console.error('Error accepting invite:', error);
            showToast('Error accepting invitation.', 'error');
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'Accept';
        }
    }

    if (declineBtn) {
        const groupId = declineBtn.dataset.groupId;
        const card = declineBtn.closest('.card-shape.group-card');
        
        declineBtn.disabled = true;        
        try {
            const declined = await declineGroup(groupId);
            
            if (declined) {
                card.style.opacity = '0';
                card.style.transition = 'opacity 0.3s';
                setTimeout(() => card.remove(), 300);
            } else {
                showToast('Failed to decline invitation.', 'error');
                declineBtn.disabled = false;
                declineBtn.textContent = 'Decline';
            }
        } catch (error) {
            console.error('Error declining invite:', error);
            showToast('Error declining invitation.', 'error');
            declineBtn.disabled = false;
            declineBtn.textContent = 'Decline';
        }
    }
})

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
        document.querySelector('.invite-user-btn'));
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
            user_id: tag.dataset.userId,
            email: tag.dataset.userEmail
        }))

    payload.usersInvite = users2Invite.length > 0 ? users2Invite : {};

    try {
        const response = await axios.post('/createGroup', payload);

        if (!response.data.success) {
            showToast(`Could not create the group.`, 'error');
            return;
        }

        showToast('Group created!', 'success');
        appendGroupTemplate(response.data.newGroup, response.data?.newUsers || {});
        modalOverlayGroups.classList.remove('active');

    } catch (error) {
        console.error(`Internal server error, couldn't handle the request: ${error}`);
        showToast('Something went wrong creating the group.', 'error');
    }

    // Invite the user to the current group.
    // inviteUser();
})

function appendGroupTemplate(group, users) {

    const groupWrapper = document.querySelector('#wrapper-cards');
    const templateGroup = document.querySelector('#template-new-group');
    const newGroupClone = templateGroup.content.cloneNode(true);

    newGroupClone.querySelector('#group-title').textContent = group[0].groups_title;
    newGroupClone.querySelector('#group-description').textContent = group[0].groups_description;
    newGroupClone.querySelector('#group-tag').textContent = group[0].tag_name;

    const inviteBtn = newGroupClone.querySelector('.invite-user-btn');
    inviteBtn.setAttribute('data-group-id', group[0].groups_id);
    inviteBtn.addEventListener('click', (e) => {
        inviteUserModal.classList.add('active')
    })

    newGroupClone.querySelector('#members-title').textContent = `Members (${users.length.toString()})`

    const membersWrapper = newGroupClone.querySelector('.group-members');
    users.forEach(u => {
        const templateUser = document.querySelector('#group-member-template');
        const cloneUser = templateUser.content.cloneNode(true);

        cloneUser.querySelector('#user-username').textContent = u.username;
        cloneUser.querySelector('#user-role').textContent = u.role;
        // cloneUser.querySelector('#user-status').textContent = u.invite_status;
        cloneUser.querySelector('#user-mail').textContent = u.email;

        membersWrapper.appendChild(cloneUser);
    })

    groupWrapper.insertBefore(newGroupClone, groupWrapper.firstChild);
}

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
                span.setAttribute('data-user-email', response.data.user.email)
                span.textContent = response.data.user.username;

                usersToInvite.appendChild(span);
                inputField.value = '';

            } else {
                showToast('User not found in the application.', 'error');
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
            showToast('User(s) invited to your group!', 'success');
            inviteUserModal.classList.remove('active');
        } else {
            showToast(response.data?.error || 'Could not invite users.', 'error');
        }
    } catch (error) {
        showToast('Something went wrong sending the invite.', 'error');
    }
}

async function acceptGroup(groupId) {

    try {

        const response = await axios.post('/acceptInviteGroup', {groupId: groupId});

        if (!response.data.success) {
            showToast("Wasn't able to accept the group invite.", 'error');
            return false;
        }

        showToast('Group invite accepted!', 'success');
        appendGroupTemplate(response.data.group, response.data.members);
        return true;

    } catch (error) {
        showToast('Could not complete the request to accept the invite.', 'error');
        return false;
    }

}

async function declineGroup(groupId) {

    try {
        const response = await axios.post('/declineInviteGroup', {groupId: groupId});

        if (!response.data.success) {
            showToast("Wasn't able to decline the invite.", 'error');
            return false;
        }
        showToast('Invite declined.', 'info');
        return true;

    } catch (error) {
        showToast('Could not complete the request to decline the invite.', 'error');
        return false;
    }
}

// --- Manage Members / Colour Panel ---

const manageModal = document.querySelector('#manage-modal');
const closeBtnManage = document.querySelector('#close-btn-manage');
const saveColorBtn = document.querySelector('#save-color-btn');
const saveSharedColorBtn = document.querySelector('#save-shared-color-btn');
const manageMembersList = document.querySelector('#manage-members-list');
const currentUserId = document.querySelector('meta[name="current-user-id"]')?.content;


let activeManageGroupId = null;

closeBtnManage.addEventListener('click', () => {
    manageModal.classList.remove('active');
    manageMembersList.innerHTML = '';
    activeManageGroupId = null;
});

document.addEventListener('click', async (e) => {
    const manageBtn = e.target.closest('.manage-group-btn');
    if (!manageBtn) return;

    activeManageGroupId = manageBtn.dataset.groupId;
    manageMembersList.innerHTML = '<p>Loading...</p>';
    manageModal.classList.add('active');

    try {
        const response = await axios.get(`/getGroupMembers/${activeManageGroupId}`);
        if (!response.data.success) {
            manageMembersList.innerHTML = '<p>Could not load members.</p>';
            return;
        }
        renderManageMembers(response.data.members, response.data.sharedColor || '#6B7280');
    } catch (err) {
        manageMembersList.innerHTML = '<p>Error loading members.</p>';
    }
});

function renderManageMembers(members, sharedColor) {
    manageMembersList.innerHTML = '';

    members.forEach(member => {
        const row = document.createElement('div');
        row.classList.add('manage-member-row');

        const info = document.createElement('div');
        info.classList.add('manage-member-info');

        const swatch = document.createElement('span');
        swatch.classList.add('color-swatch');
        swatch.style.backgroundColor = member.color || '#3D82F6';

        const name = document.createElement('span');
        name.textContent = `${member.username} (${member.role})`;

        info.appendChild(swatch);
        info.appendChild(name);
        row.appendChild(info);

        if (member.user_id === currentUserId) {
            const picker = document.createElement('input');
            picker.type = 'color';
            picker.value = member.color || '#3D82F6';
            picker.id = 'my-color-picker';
            picker.addEventListener('input', () => {
                swatch.style.backgroundColor = picker.value;
            });
            row.appendChild(picker);
        }

        manageMembersList.appendChild(row);
    });

    // "All" row — shared color used when multiple people share an event
    const allRow = document.createElement('div');
    allRow.classList.add('manage-member-row');

    const allInfo = document.createElement('div');
    allInfo.classList.add('manage-member-info');

    const allSwatch = document.createElement('span');
    allSwatch.classList.add('color-swatch');
    allSwatch.id = 'shared-color-swatch';
    allSwatch.style.backgroundColor = sharedColor;

    const allLabel = document.createElement('span');
    allLabel.textContent = 'All (shared)';

    allInfo.appendChild(allSwatch);
    allInfo.appendChild(allLabel);
    allRow.appendChild(allInfo);

    const sharedPicker = document.createElement('input');
    sharedPicker.type = 'color';
    sharedPicker.value = sharedColor;
    sharedPicker.id = 'shared-color-picker';
    sharedPicker.addEventListener('input', () => {
        allSwatch.style.backgroundColor = sharedPicker.value;
    });
    allRow.appendChild(sharedPicker);

    manageMembersList.appendChild(allRow);
}

saveColorBtn.addEventListener('click', async () => {
    const picker = document.querySelector('#my-color-picker');
    if (!picker || !activeManageGroupId) return;

    saveColorBtn.disabled = true;
    saveColorBtn.textContent = 'Saving...';

    try {
        const response = await axios.post('/setMemberColor', {
            groupsId: activeManageGroupId,
            color: picker.value
        });

        if (response.data.success) {
            showToast('Your colour saved!', 'success');
            saveColorBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveColorBtn.textContent = 'Save My Colour';
                saveColorBtn.disabled = false;
            }, 1500);
        } else {
            showToast('Could not save colour.', 'error');
            saveColorBtn.disabled = false;
            saveColorBtn.textContent = 'Save My Colour';
        }
    } catch (err) {
        showToast('Error saving colour.', 'error');
        saveColorBtn.disabled = false;
        saveColorBtn.textContent = 'Save My Colour';
    }
});

saveSharedColorBtn.addEventListener('click', async () => {
    const picker = document.querySelector('#shared-color-picker');
    if (!picker || !activeManageGroupId) return;

    saveSharedColorBtn.disabled = true;
    saveSharedColorBtn.textContent = 'Saving...';

    try {
        const response = await axios.post('/setGroupSharedColor', {
            groupsId: activeManageGroupId,
            sharedColor: picker.value
        });

        if (response.data.success) {
            showToast('Shared colour saved!', 'success');
            saveSharedColorBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveSharedColorBtn.textContent = 'Save Shared Colour';
                saveSharedColorBtn.disabled = false;
            }, 1500);
        } else {
            showToast('Could not save shared colour.', 'error');
            saveSharedColorBtn.disabled = false;
            saveSharedColorBtn.textContent = 'Save Shared Colour';
        }
    } catch (err) {
        showToast('Error saving shared colour.', 'error');
        saveSharedColorBtn.disabled = false;
        saveSharedColorBtn.textContent = 'Save Shared Colour';
    }
});