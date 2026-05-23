function convertDateObject(date) {
  const dateObj = new Date(date);

  const time = dateObj.toLocaleString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  const day  = dateObj.toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `${time} ${day}`;
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
  const navbarToggle = document.querySelector('button#toggle-btn');
  const calendarGroupTags = document.querySelectorAll('div.calendar-group-tag');

  const modalOverlayEvent = document.querySelector("#modal-overlay-event");

  const loadedEvents = await loadInEvents();

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
          calendar.today();
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
    editable: true,
    events: loadedEvents,

    // Drag to reschedule
    eventDrop: async function (info) {
      const event = info.event;
      const payload = buildDatePayload(event);
      try {
        const response = await axios.patch(`/parseEvent/${event.id}`, payload);
        if (!response.data.success) {
          showToast('Could not save the new date. Reverting.', 'error');
          info.revert();
        } else {
          showToast('Event rescheduled.', 'success');
        }
      } catch (err) {
        showToast('Error saving rescheduled event.', 'error');
        info.revert();
      }
    },

    // Resize event end time
    eventResize: async function (info) {
      const event = info.event;
      const payload = buildDatePayload(event);
      try {
        const response = await axios.patch(`/parseEvent/${event.id}`, payload);
        if (!response.data.success) {
          showToast('Could not save the new end time. Reverting.', 'error');
          info.revert();
        } else {
          showToast('Event end time updated.', 'success');
        }
      } catch (err) {
        showToast('Error saving resized event.', 'error');
        info.revert();
      }
    },

    // Click on calendar field to add an event.
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
    },
    eventDisplay: 'block',
    eventDidMount: function (info) {
      const color = info.event.backgroundColor;
      if (!color) return;

      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      info.el.style.setProperty('background-color', `rgba(${r}, ${g}, ${b}, 0.12)`, 'important');
      info.el.style.setProperty('border-left-color', color, 'important');

      const darkColor = `rgb(${Math.round(r * 0.3)}, ${Math.round(g * 0.3)}, ${Math.round(b * 0.3)})`;
      const mainEl = info.el.querySelector('.fc-event-main');
      if (mainEl) mainEl.style.setProperty('color', darkColor, 'important');
    },
    eventContent: function (info) {
      let content;

      content = `<div class="fc-event-title">${info.event.title}</div>`

      if (info.event.extendedProps?.participants.length > 0) {

        const initials = info.event.extendedProps.participants.slice(0,3).map(p => 
          `<div class="event-initial">${p.username.charAt(0).toUpperCase()}</div>`
        ).join('')

        let remaining = info.event.extendedProps?.participants.length > 3
        ?`<div class="event-initial-more">+${info.event.extendedProps?.participants.length - 3}</div>`
        :''

        content = `<div class="fc-event-initials">${initials}${remaining}</div>` + content

      }

      if (info?.timeText) {
        content = `<div class="fc-event-time">${info.timeText}</div>` + content;
      }

      return {html: `<div class="fc-event-main-frame">${content}</div>`}
    }
  });

  calendar.render();

  closeBtn.addEventListener("click", () => {
    modalOverlayForm.style.setProperty("display", "none");
  });

  closeBtnEvent.addEventListener("click", () => {
    document
      .querySelector("#modal-overlay-event")
      .style.setProperty("display", "none");
  });

  navbarToggle.addEventListener('click', (e) => {
    setTimeout(() => {
      calendar.updateSize();
    }, 280)
  });

  // So when submitting the form I do not receive the data directly in neat form, so trigger the formData event
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type=submit]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
    try {
      await parseEvent();
    } catch (err) {
      console.error('Event save failed:', err);
      showToast('Something went wrong saving the event. Please try again.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    }
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

    if (!data.hasOwnProperty("allDay")) {
      data["allDay"] = false;
    }

    data.participants = retrieveAllSelectedUsers();

    if (isUpdate) {
      let response = await axios.put(`/parseEvent/${eventId}`, data);
      if (!response.data.success) {
        showToast(`Could not update event: ${response.data.error || 'Unknown error'}`, 'error');
        modalOverlayForm.style.setProperty('display', 'none');
        return;
      }

      const outdatedEvent = calendar.getEventById(eventId);
      const newEvent = response.data.eventData[0];

      if (outdatedEvent && newEvent) {
        const allDay = newEvent['all_day'];
        const startTime = newEvent['start_time'] ? newEvent['start_time'].substring(0, 5) : null;
        const endTime = newEvent['end_time'] ? newEvent['end_time'].substring(0, 5) : null;

        let newStart, newEnd;
        if (allDay || !startTime) {
          newStart = newEvent['start_date'];
          newEnd = newEvent['end_date'];
        } else if (!endTime) {
          newStart = `${newEvent['start_date']}T${startTime}`;
          newEnd = null;
        } else {
          newStart = `${newEvent['start_date']}T${startTime}`;
          newEnd = `${newEvent['end_date']}T${endTime}`;
        }

        outdatedEvent.setProp('title', newEvent['event_title']);
        outdatedEvent.setAllDay(allDay);
        outdatedEvent.setStart(newStart);
        outdatedEvent.setEnd(newEnd);
        outdatedEvent.setExtendedProp('description', newEvent['event_description']);
        outdatedEvent.setExtendedProp('participants', response.data.participants || []);
        outdatedEvent.setExtendedProp('groupsId', newEvent['groups_id']);
      }

      showToast('Event updated!', 'success');
      modalOverlayForm.style.setProperty('display', 'none');

    } else {

      let response = await axios.post("/parseEvent", data);

      // Handle response to add event to the calendar
      if (response.data.success) {
        const ev = response.data.eventData[0];
        const allDay = ev["all_day"];
        const rawStart = ev["start_time"];
        const rawEnd   = ev["end_time"];

        let evStart, evEnd;
        if (allDay || !rawStart) {
          evStart = ev["start_date"];
          evEnd   = ev["end_date"];
        } else if (!rawEnd) {
          evStart = `${ev["start_date"]}T${rawStart}`;
          evEnd   = null;
        } else {
          evStart = `${ev["start_date"]}T${rawStart}`;
          evEnd   = `${ev["end_date"]}T${rawEnd}`;
        }

        calendar.addEvent({
          id:    ev["event_id"],
          title: ev["event_title"],
          start: evStart,
          end:   evEnd,
          allDay: allDay,
          backgroundColor: (response.data.participants || []).length > 1 ? '#6B7280' : '#3D82F6',
          borderColor:     (response.data.participants || []).length > 1 ? '#6B7280' : '#3D82F6',
          textColor: 'white',
          extendedProps: {
            participants: response.data.participants || [],
            description:  ev["event_description"],
            groupsId:     ev.groups_id
          }
        });

        showToast('Event created!', 'success');
        modalOverlayForm.style.setProperty("display", "none");
      } else {
        modalOverlayForm.style.setProperty("display", "none");
        showToast('Something went wrong — could not create the event.', 'error');
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
    const leftBorder = modalOverlayEvent.querySelector('.left-border');
    if (leftBorder) leftBorder.style.borderLeftColor = event.backgroundColor || '';
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
      modalOverlayEvent.querySelector("#event-start-date").textContent = !event.allDay
        ? `${startTime} - ${startDate}`
        : startDate;
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

  async function updateEventForm (event) {
    isUpdate = true;
    eventId = event.id;

    modalOverlayEvent.style.setProperty('display', 'none');
    modalOverlayForm.style.setProperty("display", "flex");

    modalOverlayForm.querySelector('#calendar-title').value = event.title;
    modalOverlayForm.querySelector('#calendar-description').value = event?.extendedProps.description || '';

    // startStr can be "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS+TZ" — take date part only
    modalOverlayForm.querySelector('#startDate').value = event.startStr.substring(0, 10);
    modalOverlayForm.querySelector('#endDate').value = event.endStr
      ? event.endStr.substring(0, 10)
      : event.startStr.substring(0, 10);

    const startTimeInput = modalOverlayForm.querySelector('#startTime');
    const endTimeInput = modalOverlayForm.querySelector('#endTime');

    if (event.allDay) {
      modalOverlayForm.querySelector('#allDay').checked = true;
      startTimeInput.style.display = 'none';
      endTimeInput.style.display = 'none';
    } else {
      modalOverlayForm.querySelector('#allDay').checked = false;
      startTimeInput.style.display = 'block';
      endTimeInput.style.display = 'block';
      if (event.start) {
        const h = String(event.start.getHours()).padStart(2, '0');
        const m = String(event.start.getMinutes()).padStart(2, '0');
        startTimeInput.value = `${h}:${m}`;
      }
      if (event.end) {
        const h = String(event.end.getHours()).padStart(2, '0');
        const m = String(event.end.getMinutes()).padStart(2, '0');
        endTimeInput.value = `${h}:${m}`;
      } else {
        endTimeInput.value = '';
      }
    }

    const selectGroup = modalOverlayForm.querySelector('select#tagNames');
    if (selectGroup && event.extendedProps?.groupsId) {
      const currentIndex = Array.from(selectGroup.options).findIndex(
        option => parseInt(option.value) === event?.extendedProps?.groupsId
      );
      if (currentIndex !== -1) {
        selectGroup.selectedIndex = currentIndex;
        selectGroup.dispatchEvent(new Event('change'));
        await new Promise(resolve => setTimeout(resolve, 300));
        if (event?.extendedProps?.participants) {
          selectParticipants(event.extendedProps.participants);
        }
      }
    }

    form.setAttribute('formaction', '/updateEvent');
    const updateBtn = modalOverlayForm.querySelector('button[type=submit]');
    updateBtn.textContent = 'Update Event';
    modalOverlayForm.querySelector('h3').textContent = 'Update Event';
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
                showToast('Event deleted.', 'success');
            } else {
                console.warn('Event not found in calendar');
            }
        } else {
            showToast('Failed to delete event from server.', 'error');
        }
    } catch (error) {
      console.error('Error deleting event:', error);
      showToast('Unable to delete the event. Please try again.', 'error');
    }
  }

  function selectParticipants(participants) {
    
    const participantsId = participants.map( p => p.userId);

    document.querySelectorAll('#participants-container .user-pill').forEach( pill => {

      if (participantsId.includes(pill.dataset.userId)) pill.classList.add('selected');
    })
  }

  calendarGroupTags.forEach(t => {

    t.addEventListener('click', (event) => {

      t.classList.toggle('deactive');

      const displayUsed = t.classList.contains('deactive') ? 'none' : 'block'

      const allEvents = calendar.getEvents();
      updateCalendarVisibilityEvents(allEvents, event?.currentTarget.dataset.groupId, displayUsed);

    })
  })

  function updateCalendarVisibilityEvents(allEvents, groupId, displayUsed) {
    
    allEvents.forEach(e => {
      const eventGroupId = e.extendedProps?.groupsId ? e.extendedProps.groupsId : null

      if (eventGroupId == groupId) {
        e.setProp('display', displayUsed);
      }
    })
    
  }

  function resetForm() {
    isUpdate = false;
    eventId = null;
    form.reset();
    // Restore time inputs (may have been hidden when editing an all-day event)
    document.querySelectorAll("input[type=time]").forEach(t => t.style.display = 'block');
    document.querySelector('#select-users-wrapper').classList.add('set-display-none');
    document.querySelector('#participants-container').innerHTML = '';
    document.querySelector('#tagNames').selectedIndex = 0;
  }

  /**
   * Build the date/time payload expected by PATCH /parseEvent/:id
   * from a FullCalendar event object.
   */
  function buildDatePayload(event) {
    const pad = (n) => String(n).padStart(2, '0');

    function toDateStr(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    function toTimeStr(d) {
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const allDay = event.allDay;
    const start = event.start;
    const end = event.end;

    return {
      allDay,
      startDate: toDateStr(start),
      endDate: end ? toDateStr(end) : toDateStr(start),
      startTime: allDay ? null : toTimeStr(start),
      endTime: (!allDay && end) ? toTimeStr(end) : null,
    };
  }

});
