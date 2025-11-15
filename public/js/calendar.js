document.addEventListener("DOMContentLoaded", async function () {
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const closeBtnEvent = document.querySelector("#close-btn-event");
  const form = document.querySelector("#form-calendar");
  const checkWholeDay = document.querySelector('.all-day');

  const modalOverlayEvent = document.querySelector('#modal-overlay-event')

  let calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    firstDay: 1,
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
      right: "today timeGridWeek,dayGridMonth addEventBtn", /*listWeek*/ 
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
    eventOrderStrict: true,
    displayEventTime: true,
    displayEventEnd: true,
    eventTimeFormat: {
      hour: 'numeric',
      minute: '2-digit',
      meridiem: false,
      hour12: false,
    },
    multiMonthMaxColumns: 1,
    contentHeight: "auto",
    nowIndicator: true,
    events: await loadInEvents(), // Its async need to make sure use async as well
    
    // Cick on calander field to add an event.
    dateClick: function (info) {
      //Need to prefill form with current dates
      modalOverlayForm.style.setProperty("display", "flex");
    },
    eventClick: function (info) {
      updateShowModalEvent(info.event);
      document.querySelector('#modal-overlay-event').style.display = 'flex';
    }
    // Remove Event from the calander
  });

  calendar.render();

  document.querySelectorAll('a.fc-event.fc-event-today').forEach(e => {
    e.style.backgroundColor = '#4A9D5F';
    e.style.color = 'white';
  })

  closeBtn.addEventListener("click", () => {
    modalOverlayForm.style.setProperty("display", "none");
  });

  closeBtnEvent.addEventListener('click', () => {
    document.querySelector('#modal-overlay-event').style.setProperty('display', 'none')
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

    if (!data.hasOwnProperty('allDay') || (!data['startTime'] && !data['endTime'])) {
      data['allDay'] = false
    }

    let response = await axios.post("/addEvent", data);

    // Handle response to add event to the calendar
    if (response.data.success) {
      calendar.addEvent({
        id: response.data.eventData[0]["event_id"],
        title: response.data.eventData[0]["event_title"],
        start: `${response.data.eventData[0]["start_date"]}`,
        end: `${response.data.eventData[0]["end_date"]}`,
        startTime: response.data.eventData[0]["start_time"],
        endTime: response.data.eventData[0]["end_time"],
        allDay: response.data.eventData[0]["all_day"],
        description: response.data.eventData[0]["description"]
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
      t.style.display = this.checked ? 'none' : 'block' /*Show time when clicked else only show date*/
    })

  })

  async function loadInEvents () {

      try {
        const response = await axios.get('/renderEvents');

      if (!response.data.success) {
        console.log('Start filtering data.')
      } else {
        return response.data.events
      }} catch (error) {
        console.log(error);
      }
  }

  function updateShowModalEvent (event) {
    let startDate, startTime, endDate, endTime
    const modalOverlayEvent = document.querySelector('#modal-overlay-event');
    
    modalOverlayEvent.querySelector('#event-title').textContent = event.title;
    modalOverlayEvent.querySelector('#event-description').textContent = event?.extendedProps.description || 'No description given.';
  
    if (event.start) {
      startDate = event.start.toLocaleDateString('nl-BE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
      });

      startTime = event.start.toLocaleTimeString('nl-BE')
    }
    
    if (event.end) {
      endDate = event.end.toLocaleDateString('nl-BE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
      });
      endTime = event.end.toLocaleTimeString('nl-BE')
    }
    modalOverlayEvent.querySelector('#event-start-date').textContent = `${startDate} - ${startTime}`;
    modalOverlayEvent.querySelector('#event-end-date').textContent = `${endDate} - ${endTime}`;
  }
});
