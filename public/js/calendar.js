document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const form = document.querySelector("form");

  let calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    customButtons: {
      addEventBtn: {
        text: 'Add Event',
        click: function(){
          modalOverlayForm.style.setProperty("display", "flex");
        }
      },
      todayBtn: {
        text:'Today',
        click: function(){
          alert('Go to today.');
        }
      }
    },
    headerToolbar: {
      left: "prev title next",
      right: "today addEventBtn dayGridDay,timeGridWeek,dayGridMonth,multiMonthYear",
      
    },
    multiMonthMaxColumns: 1,

    // Cick on calander field to add an event.
    dateClick: function (info) {
      modalOverlayForm.style.setProperty("display", "flex");
    },

    // Click on button to add an event onto the calander

    // Remove Event from the calander
  });

  calendar.render();

  closeBtn.addEventListener("click", () => {
    modalOverlayForm.style.setProperty("display", "none");
  });

  // So when submitting the form I do not receive the data direclty in neat form, so trigger the formData event
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    const data = {};
    for (let [key, val] of formData.entries()) {
      data[key] = val;
    }

    let title = formData.get("title");

    //Send data to the backend
    let response = await axios.post("/addEvent", data);

    console.log(response.data);
    // Handle response to add event to the calendar
    if (response.data.succes) {
      let event = response.data.data[0];
      calendar.addEvent({
        // start: response.data['title'],
        // end: info.dateStr, // T12:30:00
        title: event['title'],
        start: event['startDate'],
        end: event['endDate'],
        allDay: true,
      });

      modalOverlayForm.style.setProperty('display', 'none');
    } else {
      modalOverlayForm.style.setProperty('display', 'none');

      alert('Something went wrong, could not be able to create an event ...');
    }
  });
});
