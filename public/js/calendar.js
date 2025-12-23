async function showUpcomingEvents(events) {
  const now = new Date();

  let upcomingEvents = events.filter( e => new Date(e.start) > now)
  upcomingEvents = upcomingEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  upcomingEvents.slice(0,10).forEach(e => {

    const upcomingTaskTemp = document.querySelector('#template-upcoming');
    const upcomingClone = upcomingTaskTemp.content.cloneNode(true);

    upcomingClone.querySelector('#event-title').textContent = e.title;
    upcomingClone.querySelector('#event-description').textContent = e.extendedProps.description;
    upcomingClone.querySelector('#startDate').textContent = e.start;

    if (e.extendedProps.groupName) {
      upcomingClone.querySelector('#group-name').textContent = e.extendedProps.groupName;
    } else {
      upcomingClone.querySelector('#group-name').remove();
    }

    if (e.start != e.end) {
      upcomingClone.querySelector('#endDate').textContent = e.end;
    } else {
      upcomingClone.querySelector('#endDate').remove();
    }

    if (e.extendedProps.participants) {
      const eventParts = upcomingClone.querySelector('#event-participants')
      e.extendedProps.participants.forEach(p => {
        const divPart = document.createElement('div');
        divPart.classList.add('badge-secondary');
        divPart.textContent = p.username
        divPart.dataset.userId = p.userId;
        eventParts.appendChild(divPart);
      }) 
    }
    
    document.querySelector('div.upcoming-list.card-shape').appendChild(upcomingClone);
  })

}

document.addEventListener("DOMContentLoaded", async function () {
  let isUpdate = false; let eventId;
  const calendarEl = document.querySelector("#calendar");
  const modalOverlayForm = document.querySelector("#modal-overlay");
  const closeBtn = document.querySelector("#close-btn");
  const closeBtnEvent = document.querySelector("#close-btn-event");
  const form = document.querySelector("#form-calendar");
  const checkWholeDay = document.querySelector(".all-day");
  const selectedTagName = document.querySelector('#tagNames');

  const modalOverlayEvent = document.querySelector("#modal-overlay-event");

  const loadedEvents = await loadInEvents();
  showUpcomingEvents(loadedEvents)

  let currentEvent = null
  modalOverlayEvent.addEventListener('click', (e) => {

    if (e.target.closest('#edit-event')) {
      if (currentEvent) {
        updateEventForm(currentEvent);
      }
    }

    if (e.target.closest('#delete-event')) {
      if (currentEvent) {
        deleteEvent(currentEvent)
      }
    }
  })

  let calendar = new FullCalendar.Calendar(calendarEl, {
    pre: 'chevron-left',
    next: 'chevron-right',
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
      right: "today timeGridWeek,dayGridMonth addEventBtn" /*listWeek*/,
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
      hour: "numeric",
      minute: "2-digit",
      meridiem: false,
      hour12: false,
    },
    multiMonthMaxColumns: 1,
    contentHeight: "auto",
    nowIndicator: true,
    events: loadedEvents,

    // Cick on calander field to add an event.
    dateClick: function (info) {

      resetForm();
      form.setAttribute('formaction', '/createEvent');
      const updateBtn = modalOverlayForm.querySelector('button[type=submit]');
      updateBtn.textContent = 'Add Event'
      modalOverlayForm.querySelector('h3').textContent = 'Add Event'

      //Need to prefill form with current dates
      modalOverlayForm.style.setProperty("display", "flex");
      modalOverlayForm.querySelector('#startDate').value = info.dateStr;
      modalOverlayForm.querySelector('#endDate').value = info.dateStr;
    },
    eventClick: function (info) {
      updateShowModalEvent(info.event); // Later need to reclose it
      currentEvent = info.event;
      document.querySelector("#modal-overlay-event").style.display = "flex";
    },
    eventMouseEnter: function (info) {
      console.log(info);
      const options = {
        day: "numeric",
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
      const div = document.createElement('div');
      div.className = 'event-tooltip';
      div.innerHTML = 
      `
      <strong>${info.event.title}</strong><br>
      ${info.event.start.toLocaleString('nl-BE', options).replace(',', ' -')}<br>
      ${info.event.end ? info.event.end.toLocaleString('nl-BE', options).replace(',', ' -') : ''}
      ${info.event.description ? '<br>' + info.event.description : ''}
      `;

      document.body.appendChild(div);

      const rect = info.el.getBoundingClientRect()
      div.style.top = (rect.top - div.offsetHeight - 5) + 'px';
      div.style.left = rect.left + 'px';
      
      info.el.tooltip = div;
      
    },

    eventMouseLeave: function (info) {
      if (info.el.tooltip) {
        info.el.tooltip.remove();
        info.el.tooltip = null;
      }
    }
    // Remove Event from the calander
  });

  calendar.render();

  document.querySelectorAll("a.fc-event").forEach((e) => {
    e.style.backgroundColor = "#4A9D5F";
    e.style.color = "white";
  });

  closeBtn.addEventListener("click", () => {
    modalOverlayForm.style.setProperty("display", "none");
  });

  closeBtnEvent.addEventListener("click", () => {
    document
      .querySelector("#modal-overlay-event")
      .style.setProperty("display", "none");
  });

  // So when submitting the form I do not receive the data direclty in neat form, so trigger the formData event
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    parseEvent();
  });

  checkWholeDay.addEventListener("change", function () {
    const timeFields = document.querySelectorAll("input[type=time]");
    timeFields.forEach((t) => {
      t.style.display = this.checked
        ? "none"
        : "block"; /*Show time when clicked else only show date*/
    });
  });

  selectedTagName.addEventListener('change', async function (event) {
    const selectedGroupId = event.target.value

    const selectedText = event.target.options[event.target.selectedIndex].text;
    const selectedGroupIdOption = event.target.options[event.target.selectedIndex].dataset.groupId;


    if (selectedGroupId || selectedGroupIdOption) {
      try {
        const response = await axios.get('/retrieveUsersSelectedGroup', {params: {groupId: selectedGroupId || selectedGroupIdOption}});

        if (response.data.success) {
          updateUsersShownForm(response.data.selectUser);
        }

      } catch (error) {
        console.log('Internal problems trying to retrieve all users from the group.')
      }
    }
  });

  async function parseEvent() {
    const formData = new FormData(form);

    const data = {};
    for (let [key, val] of formData.entries()) {
      data[key] = val;
    }

    if (!data.hasOwnProperty("allDay") || (!data["startTime"] && !data["endTime"])) {
      data["allDay"] = false;
    }

    data.participants = retrieveAllSelectedUsers();

    if (isUpdate) {
      // Need to peorform an update here 
      let response = await axios.put(`/parseEvent/${eventId}`, data);
      if (response.data.success) {
        const outdatedEvent = calendar.getEventById(eventId)
        const newEvent = response.data.eventData[0]

        if (outdatedEvent) {
          outdatedEvent.setProp('title', newEvent['event_title'])
          outdatedEvent.setStart(newEvent['start_date'])
          outdatedEvent.setEnd(newEvent['end_date'])
          outdatedEvent.setAllDay(newEvent['all_day'])
          outdatedEvent.setExtendedProp('description', newEvent["event_description"]);
          outdatedEvent.setExtendedProp('participants', response.data.participants || []);
          outdatedEvent.setExtendedProp('groupsId', newEvent["groups_id"]);
        }
      }

      modalOverlayForm.style.setProperty('display', 'none');

    } else {

      let response = await axios.post("/parseEvent", data);

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
          backgroundColor: '#4a9d5f',
          borderColor: '#4a9d5f',
          textColor: 'white',
          extendedProps: {
            participants: response.data.participants || [],
            description: response.data.eventData[0]["event_description"],
            groupsId: response.data.eventData[0].groups_id
          }
        });

        modalOverlayForm.style.setProperty("display", "none");
      } else {
        modalOverlayForm.style.setProperty("display", "none");
        alert("Something went wrong, could not be able to create an event ...");
      }
    }

    resetForm();
  }

  async function loadInEvents() {
    try {
      const response = await axios.get("/renderEvents");

      if (!response.data.success) {
        console.log("Start filtering data.");
      } else {
        return response.data.events || [];
      }
    } catch (error) {
      console.log(error);
    }
  }

  function updateShowModalEvent(event) {
    let startDate, startTime, endDate, endTime;
    const modalOverlayEvent = document.querySelector("#modal-overlay-event");

    modalOverlayEvent.querySelector("#event-start-date").textContent = "";
    modalOverlayEvent.querySelector("#event-end-date").textContent = "";
    modalOverlayEvent.querySelector("#event-title").textContent = event.title;
    if (event.extendedProps.groupName){
      modalOverlayEvent.querySelector("#group-tag-name").textContent = event.extendedProps.groupName;
      modalOverlayEvent.querySelector("#group-tag-name").classList.add('badge-secondary');
    }
    modalOverlayEvent.querySelector("#event-description").textContent =
      event?.extendedProps.description || "No description given.";

    if (event.end) {
      endDate = event.end.toLocaleDateString("nl-BE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      endTime = event.end.toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      modalOverlayEvent.querySelector("#event-end-date").textContent = endTime
        ? `${endTime} - ${endDate}`
        : `${endDate}`;
      document.querySelector('#event-end-wrapper').style.display = 'flex';
    } else {
      document.querySelector('#event-end-wrapper').style.display = 'none';
    }

    if (event.start) {
      startDate = event.start.toLocaleDateString("nl-BE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      startTime = event.start.toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      //Use endTime to see wether there was a ending timestamp filled in
      modalOverlayEvent.querySelector("#event-start-date").textContent = endTime
        ? `${startTime} - ${startDate}`
        : `${startDate}`;
    }
    
    modalOverlayEvent.querySelector('#event-participants').innerHTML = '';
    try {
      event.extendedProps.participants.forEach(p => {
        const partiDiv = document.createElement('div');
        partiDiv.className = 'badge-secondary';
        partiDiv.textContent = p.username;
        partiDiv.dataset.userId = p.userId;
        
        modalOverlayEvent.querySelector("#event-participants").appendChild(partiDiv);
      });
      
    } catch (e) {
      modalOverlayEvent.querySelector("#event-participants").textContent = 'No participants'
    }
  }

  function updateUsersShownForm (selectedUsers) {

    const containerUsers = document.querySelector('#participants-container');
    const selectUsersWrapper = document.querySelector('#select-users-wrapper');

    containerUsers.innerHTML = '';

    if (selectedUsers.length === 0) {
      containerUsers.innerHTML = '<span>No users available</span>';
      return;
    }

    selectUsersWrapper.classList.remove('set-display-none');

    selectedUsers.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-pill';
      div.dataset.userId = u.userId
      div.textContent = u.username

      div.addEventListener('click', (e) => {
        div.classList.toggle('selected');
      })

      containerUsers.appendChild(div);
    })
  }

  function retrieveAllSelectedUsers () {
    const participantsContainer = document.querySelector('#participants-container');
    const userPills = participantsContainer.querySelectorAll('.user-pill.selected');

    if (userPills.length === 0) {
      return [];
    };

    let usersInvited = [];
    [...userPills].forEach(p => {

      usersInvited.push({
        username: p.textContent,
        userId: p.dataset.userId
      });
    });

    return usersInvited;
  };

  async function updateEventForm (event, startDate, endDate) {
    isUpdate = true;
    eventId = event.id

    modalOverlayEvent.style.setProperty('display', 'none');
    modalOverlayForm.style.setProperty("display", "flex");

    modalOverlayForm.querySelector('#calendar-title').value = event.title;
    modalOverlayForm.querySelector('#calendar-description').value = event?.extendedProps.description;
    modalOverlayForm.querySelector('#startDate').value = event.startStr;
    modalOverlayForm.querySelector('#endDate').value = event.endStr ? event.endStr : event.startStr;

    if (event.allDay) {
      modalOverlayForm.querySelector('#allDay').checked = true;
      modalOverlayForm.querySelector('#endTime').style.display = 'none'
      modalOverlayForm.querySelector('#startTime').style.display = 'none'

    }

    // Need to select the corect group
    const selectGroup = modalOverlayForm.querySelector('select#tagNames');

    if (selectGroup && event.extendedProps?.groupsId) {

      const currentIndex = Array.from(selectGroup.options).findIndex(option => parseInt(option.value) === event?.extendedProps?.groupsId)
      
      if (currentIndex !== -1) {
        selectGroup.selectedIndex = currentIndex

        selectGroup.dispatchEvent(new Event('change')) // To trigger an already existing event. More research on it.
      
        await new Promise(resolve => setTimeout(resolve, 300))

        if (event?.extendedProps?.participants) {
          selectParticipants(event.extendedProps.participants)

        }
      }
    }
    //Need to make sure the form will be sent to be updated. 
    form.setAttribute('formaction', '/updateEvent');
    const updateBtn = modalOverlayForm.querySelector('button[type=submit]');
    updateBtn.textContent = 'Update Event'
    modalOverlayForm.querySelector('h3').textContent = 'Update Event'

  }

  async function deleteEvent(event) {
    eventId = event.id
    try {
      const response = await axios.delete(`/parseEvent/${eventId}`);

      if (response.status === 204 || response.data?.success) {
            const matchEvent = calendar.getEventById(eventId);
            
            if (matchEvent) {
                matchEvent.remove();
                
                modalOverlayEvent.style.display = 'none';
                
                alert('Event deleted successfully!');
            } else {
                console.warn('Event not found in calendar');
            }
        } else {
            alert('Failed to delete event from server');
        }
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Unable to delete the event. Please try again.');
    }
  }

  function selectParticipants(participants) {
    
    const participantsId = participants.map( p => p.userId);

    document.querySelectorAll('#participants-container .user-pill').forEach( pill => {

      if (participantsId.includes(pill.dataset.userId)) pill.classList.add('selected');
    })
  }

  function resetForm() {
    isUpdate = false;
    eventId = null;
    form.reset();
  }

});
