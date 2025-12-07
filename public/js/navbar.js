const toggleButton = document.querySelector('#toggle-btn');
const sidebar = document.querySelector('#sidebar');

function toggleSidebar () {
    sidebar.classList.toggle('close');
    toggleButton.classList.toggle('rotate');

    Array.from(sidebar.getElementsByClassName('show')).forEach( ul => {
        ul.classList.remove('show');
        ul.previousElementSibling.classList.remove('rotate');
    }); //Open dropdowns in the form of an array
}

function toggleSubMenu (button) {
    button.nextElementSibling.classList.toggle('show');
    button.classList.toggle('rotate');

    if (sidebar.classList.contains('close')) {
        sidebar.classList.toggle('close');
        toggleButton.classList.toggle('rotate');
    }
}