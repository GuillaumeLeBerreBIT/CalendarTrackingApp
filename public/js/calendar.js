document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const form = document.querySelector("form");

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

  // So when submitting the form I do not receive the data direclty in neat form, so trigger the formData event
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    console.log(formData);

    let title = formData.get('title');
    let startDate  = formData.get('startDate');
    let endDate = formData.get('endDate');

    //Send data to the backend
    axios.post('http://localhost:3000/addEvent', {
      title: title,
      startDate: startDate,
      endDate: endDate
    })

    // Then add event to calender without reloading page

  });

  // After formData event triggered can change the form data itself. 
  form.addEventListener("formdata", (e) => {

    const formData = e.formData;

    for (let [key, val] of formData.entries()) {
      console.log(key, val);
    }
  });
});
