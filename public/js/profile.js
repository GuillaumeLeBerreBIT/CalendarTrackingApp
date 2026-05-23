document.addEventListener('DOMContentLoaded', function () {
  const displayUsername = document.getElementById('display-username');
  const editUsernameBtn = document.getElementById('edit-username-btn');
  const editUsernameRow = document.getElementById('edit-username-row');
  const newUsernameInput = document.getElementById('new-username-input');
  const saveUsernameBtn = document.getElementById('save-username-btn');
  const cancelUsernameBtn = document.getElementById('cancel-username-btn');
  const digestToggle = document.getElementById('digest-toggle');

  // --- Username editing ---

  editUsernameBtn.addEventListener('click', () => {
    editUsernameRow.style.display = 'flex';
    newUsernameInput.focus();
  });

  cancelUsernameBtn.addEventListener('click', () => {
    editUsernameRow.style.display = 'none';
    newUsernameInput.value = displayUsername.textContent;
  });

  saveUsernameBtn.addEventListener('click', async () => {
    const newUsername = newUsernameInput.value.trim();
    if (!newUsername || newUsername === displayUsername.textContent) {
      editUsernameRow.style.display = 'none';
      return;
    }

    saveUsernameBtn.disabled = true;
    saveUsernameBtn.textContent = 'Saving...';

    try {
      const response = await axios.patch('/profile/username', { username: newUsername });
      if (response.data.success) {
        displayUsername.textContent = newUsername;
        editUsernameRow.style.display = 'none';
        showToast('Username updated!', 'success');
      } else {
        showToast(response.data.error || 'Could not update username.', 'error');
      }
    } catch (err) {
      showToast('Error updating username.', 'error');
    } finally {
      saveUsernameBtn.disabled = false;
      saveUsernameBtn.textContent = 'Save';
    }
  });

  // --- Email digest toggle ---

  digestToggle.addEventListener('change', async function () {
    const enabled = this.checked;
    try {
      const response = await axios.post('/email-preferences', { emailDigestEnabled: enabled });
      if (response.data.success) {
        showToast(enabled ? 'Daily digest enabled.' : 'Daily digest disabled.', 'success');
      } else {
        showToast(response.data.error || 'Could not update preference.', 'error');
        this.checked = !enabled; // revert
      }
    } catch (err) {
      showToast('Error updating email preference.', 'error');
      this.checked = !enabled; // revert
    }
  });
});
