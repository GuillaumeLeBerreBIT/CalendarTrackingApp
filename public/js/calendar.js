document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const form = document.querySelector("#form-calendar");
  const checkWholeDay = document.querySelector('.all-day');

  let calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    customButtons: {
      addEventBtn: {
        text: "+ Add Event",
        click: function () {
          modalOverlayForm.style.setProperty("display", "flex");
        },
      },
      todayBtn: {
        text: "Today",
        click: function () {
          alert("Go to today.");
        },
      },
    },
    headerToolbar: {
      left: "prev title next",
      right: "today listWeek,timeGridWeek,dayGridMonth addEventBtn",
      },
    buttonText: {
      today: "Today",
      month: "Month",
      week: "Week",
      day: "Day",
      list: "List",
    },
    multiMonthMaxColumns: 1,
    contentHeight: "auto",
    nowIndicator: true,

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
    createEvent();

  });

  async function createEvent() {
    
    const formData = new FormData(form);

    const data = {};
    for (let [key, val] of formData.entries()) {
      data[key] = val;
    }

    let response = await axios.post("/addEvent", data);

    // Handle response to add event to the calendar
    if (response.data.succes) {
      calendar.addEvent({
        // start: response.data['title'],
        // end: info.dateStr, // T12:30:00
        title: response.data.data[0]["title"],
        start: response.data.data[0]["description"],
        start: response.data.data[0]["startDate"],
        end: response.data.data[0]["endDate"],
        allDay: true,
      });

      modalOverlayForm.style.setProperty("display", "none");
    } else {
      modalOverlayForm.style.setProperty("display", "none");
      alert("Something went wrong, could not be able to create an event ...");
    }
  }

  checkWholeDay.addEventListener('change', function () {  
    const timeFields = document.querySelectorAll('input[type=time]');
    timeFields.forEach(t => {
      t.style.display = this.checked ? 'none' : 'block'
    })

  })
});
