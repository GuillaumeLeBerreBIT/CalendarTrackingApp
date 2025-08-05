document.addEventListener("DOMContentLoaded", function () {

  let calendarEl = document.querySelector("#calendar");
  let calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek",
    },

    // Cick on calander field to add an event. 
    dateClick: function(info) {

      calendar.addEvent({
        start: info.dateStr,
        end: info.dateStr, // T12:30:00
        title: "Testing it"
      })
    },

    // Click on button to add an event onto the calander

    // Remove Event from the calander


  });

  calendar.render();
});
