# CalendarTrackingApp

A collaborative calendar and task management web application built with Node.js, Express, and Supabase. Track events, manage group schedules, and organize tasks — all in one place.

**Live Demo:** [https://calendartrackingapp.onrender.com/login](https://calendartrackingapp.onrender.com/login)

---

## Features

### Calendar
- Interactive calendar with day, week, month, and list views powered by [FullCalendar](https://fullcalendar.io/)
- Create, update, and delete events (all-day or timed)
- Multi-day event support
- Upcoming events sidebar
- Tag-based event grouping

### Groups
- Create collaborative groups with titles, descriptions, and tags
- Invite users by username or email
- Accept or decline group invitations
- View member roles (admin / member)
- Group statistics (event count, task count, creation date)

### Tasks
- Create task lists within groups
- Add tasks with title, description, priority, and due date
- Mark tasks as complete / incomplete
- Track progress with completed vs. total task counts
- Filter, search, and sort tasks

### Authentication
- Email and password registration with strong password validation
- JWT-based sessions stored in HTTP-only cookies
- Automatic token refresh (3-hour access token, 7-day refresh token)
- Secure logout

### Progressive Web App (PWA)
- Installable on desktop and mobile
- Offline support via service worker caching
- App manifest with icons (48px – 512px)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js 5 |
| Templating | EJS |
| Database & Auth | Supabase (PostgreSQL) |
| Calendar UI | FullCalendar 6 |
| Password Hashing | bcrypt |
| Date Utilities | date-fns |
| Hosting | Render |

---

## Project Structure

```
CalendarTrackingApp/
├── app.js                  # Main Express server & all routes
├── utils/
│   └── utils.js            # Shared utility functions
├── views/
│   ├── calendar.ejs        # Calendar page
│   ├── groups.ejs          # Groups management page
│   ├── todo.ejs            # Task list page
│   ├── login.ejs           # Login page
│   ├── register.ejs        # Registration page
│   ├── offline.ejs         # Offline fallback page
│   └── partials/
│       ├── header.ejs      # HTML head & meta
│       ├── navbar.ejs      # Navigation bar
│       └── footer.ejs      # Footer
└── public/
    ├── js/                 # Client-side JavaScript
    ├── css/                # Stylesheets
    ├── icons/              # PWA icons
    ├── static/
    │   └── sw.js           # Service worker
    └── manifest.json       # PWA manifest
```

---

## Database Schema

| Table | Description |
|---|---|
| `profiles` | User accounts and display info |
| `groups` | Collaborative groups |
| `profiles_groups` | User–group relationships (role, invite status) |
| `events` | Calendar events |
| `profiles_events` | User–event relationships (RSVP status) |
| `task_list` | Task lists scoped to groups |
| `task` | Individual tasks |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project with the schema above configured

### Installation

```bash
git clone https://github.com/your-username/CalendarTrackingApp.git
cd CalendarTrackingApp
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
SUPABASE_KEY=your_supabase_service_role_key
```

### Run Locally

```bash
node app.js
```

The server starts on [http://localhost:3000](http://localhost:3000) by default (or `PORT` if set).

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/login` | Authenticate user |
| POST | `/register` | Register new user |
| GET/POST | `/logout` | Clear session cookies |
| POST | `/parseEvent` | Create event |
| PUT | `/parseEvent/:eventId` | Update event |
| DELETE | `/parseEvent/:eventId` | Delete event |
| GET | `/renderEvents` | Fetch user's events |
| POST | `/createGroup` | Create a group |
| POST | `/InviteUsers` | Invite user to group |
| POST | `/acceptInviteGroup` | Accept group invitation |
| POST | `/declineInviteGroup` | Decline group invitation |
| POST | `/checkUser` | Search user by username or email |
| GET | `/retrieveUsersSelectedGroup` | Get members of a group |
| POST | `/createTaskList` | Create a task list |
| POST | `/createTask` | Create a task |
| PATCH | `/updateTask` | Toggle task completion |

---

## License

This project is for personal and educational use.
