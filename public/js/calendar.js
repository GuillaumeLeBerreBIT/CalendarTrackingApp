document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const form = document.querySelector("#calendarForm");

  let calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek",
    },

    // Cick on calander field to add an event.
    dateClick: function (info) {
      modalOverlayForm.style.setProperty("display", "flex");

      calendar.addEvent({
        start: info.dateStr,
        end: info.dateStr, // T12:30:00
        title: "Testing it"
      });
    },

    // Click on button to add an event onto the calander

    // Remove Event from the calander
  });

  calendar.render();

  closeBtn.addEventListener("click", () => {
    modalOverlayForm.style.setProperty("display", "none");
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    console.log(event);

  })
});
