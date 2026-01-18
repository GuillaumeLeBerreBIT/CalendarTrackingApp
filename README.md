# 📅 Calendar Tracking Application

A modern, collaborative web application for managing calendars, tasks, events, and team coordination. Built with Node.js, Express, and Supabase for seamless real-time collaboration.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-Private-red.svg)
![Hosted](https://calendartrackingapp.onrender.com/login)

## ✨ Features

### 🔐 Authentication & Security
- Secure user authentication with Supabase Auth
- Automatic session management with token refresh
- HTTP-only cookies for enhanced security
- Password strength validation

### 👥 Group Collaboration
- Create and manage collaborative groups
- Invite members via email or username
- Role-based access control (admin/member)
- Accept or decline group invitations
- Real-time group statistics

### 📆 Event Management
- Interactive calendar with FullCalendar
- Create timed or all-day events
- Add participants and track RSVP status
- Event categorization by group tags
- Edit and delete events
- Visual participant indicators

### ✅ Task Management
- Create todo lists within groups
- Add tasks with priorities and due dates
- Mark tasks as complete
- Visual progress tracking with progress bars
- Filter tasks by completion status
- Search tasks in real-time

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Backend** | Node.js, Express.js |
| **Frontend** | EJS Templates, Vanilla JavaScript |
| **Styling** | Custom CSS (Component-based) |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth |
| **Calendar UI** | FullCalendar.js |
| **Security** | bcrypt, HTTP-only cookies |
| **Date Handling** | date-fns |
| **HTTP Client** | Axios |

## 📁 Project Structure

```
CalendarTracking/
├── app.js                      
├── package.json               
├── .env                        
│
├── public/                     
│   ├── css/                   
│   │   ├── calendar.css        
│   │   ├── components.css      
│   │   ├── groups.css        
│   │   ├── navbar.css          
│   │   ├── styles.css          
│   │   ├── todo-styles.css     
│   │   └── utilities.css       
│   │
│   ├── js/                     
│   │   ├── calendar.js         
│   │   ├── groups.js           
│   │   ├── navbar.js           
│   │   ├── todo.js             
│   │   └── pwa.js              
│   │
│   ├── icons/                  
│   ├── manifest.json           
│   └── service-worker.js       
│
├── views/                      
│   ├── calendar.ejs            
│   ├── dashboard.ejs           
│   ├── groups.ejs              
│   ├── index.ejs               
│   ├── login.ejs               
│   ├── register.ejs            
│   ├── timers.ejs              
│   ├── todo.ejs                
│   │
│   └── partials/               
│       ├── header.ejs         
│       ├── navbar.ejs          
│       └── footer.ejs          
│
└── utils/                     
    └── utils.js                
```

### Getting Started

1. **Register an Account**
   - Navigate to `/register`
   - Provide email, username, and password
   - Password must meet security requirements

2. **Login**
   - Go to `/login`
   - Enter your credentials
   - Session persists with automatic token refresh

### Managing Groups

```
Groups → Create Group → Add Title, Description, Tag → Invite Members
```

- Click "Create Group" button
- Fill in group details
- Add a tag for easy identification
- Invite members by email or username
- Accept pending invitations from Groups page

### Creating Events

```
Calendar → Click Date → Fill Event Form → Select Group → Add Participants
```

- Click any date on the calendar
- Add event title and description
- Set date/time or mark as all-day
- Assign to a group (optional)
- Select participants from group members
- Click "Add Event"

### Managing Tasks

```
Todo → Create List → Add Tasks → Mark Complete → Track Progress
```

- Create a new todo list
- Link it to a group via tag
- Add individual tasks with priorities
- Check off completed tasks
- Monitor progress with visual indicators

### Event Visibility

- Filter events by group using tag buttons
- Click a tag to show/hide that group's events
- Click an event to view full details
- Edit or delete events from the detail modal

## 🔌 API Reference

### Authentication Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/login` | Display login page | ❌ |
| `POST` | `/login` | Process login credentials | ❌ |
| `GET` | `/register` | Display registration page | ❌ |
| `POST` | `/register` | Create new user account | ❌ |
| `GET` | `/logout` | Logout and clear session | ✅ |
| `POST` | `/logout` | Logout (alternative method) | ✅ |

### Page Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/` | Home/dashboard page | ✅ |
| `GET` | `/calendar` | Calendar view | ✅ |
| `GET` | `/todo` | Todo lists | ✅ |
| `GET` | `/groups` | Groups management | ✅ |

### Group Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/createGroup` | Create a new group |
| `POST` | `/inviteUsers` | Invite users to a group |
| `POST` | `/acceptInviteGroup` | Accept group invitation |
| `POST` | `/declineInviteGroup` | Decline group invitation |
| `POST` | `/checkUser` | Verify user exists |
| `GET` | `/retrieveUsersSelectedGroup` | Get group members list |

### Event Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/parseEvent` | Create new event |
| `PUT` | `/parseEvent/:eventId` | Update existing event |
| `DELETE` | `/parseEvent/:eventId` | Delete event |
| `GET` | `/renderEvents` | Fetch user's events |

### Task Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/createTaskList` | Create new todo list |
| `POST` | `/createTask` | Add task to list |
| `PATCH` | `/updateTask` | Update task status |

## 🗄️ Database Schema

### Core Tables

```sql
profiles (user_id, username, email, bio, avatar_url, created_at)
  ↓
profiles_groups (user_id, groups_id, role, invite_status, joined_at)
  ↓
groups (groups_id, groups_title, groups_description, tag_name, created_at)
  ↓
┌─────────────┴──────────────┐
│                            │
task_list                  events
  ↓                          ↓
task                    profiles_events
```

## 🔒 Security & Authentication

### Session Management

1. **Registration/Login**
   - User credentials verified via Supabase Auth
   - JWT tokens generated

2. **Token Storage**
   ```javascript
   authCookie (access_token)  // Expires: 1 hour
   refreshToken               // Expires: 7 days
   userId                     // Expires: 1 hour
   expiresAt                  // Token expiry timestamp
   ```

3. **Middleware Protection**
   - All protected routes use `authRequire` middleware
   - Automatic token validation
   - Silent token refresh when expired

4. **Cookie Configuration**
   ```javascript
   {
     httpOnly: true,        // Prevents XSS attacks
     secure: true,          // HTTPS only (production)
     sameSite: 'lax',      // CSRF protection
     maxAge: 3600000       // 1 hour
   }
   ```

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## 🎨 Key Features Implementation

### Progress Tracking

Progress bars dynamically calculate completion:

```javascript
const completedTasks = tasks.filter(t => t.is_completed).length;
const totalTasks = tasks.length;
const progressWidth = (completedTasks / totalTasks) * 100;
```

### Event Filtering

Filter events by group tags:
- Click tag to toggle visibility
- Events from deactivated groups are hidden
- Visual indicator shows active/inactive state

### Search Functionality

Real-time task search:
```javascript
searchInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  tasks.forEach(task => {
    task.style.display = task.title.toLowerCase().includes(searchTerm) 
      ? 'flex' 
      : 'none';
  });
});
```

### Automatic Session Refresh

```javascript
if (tokenExpired) {
  const newSession = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  });
  updateCookies(newSession.access_token);
}
```

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Write clean, documented code
   - Follow existing code style
   - Add tests if applicable
4. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
5. **Push to your branch**
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request**
   - Describe your changes
   - Reference any related issues
   - Wait for review

## 📝 License

This project is private and not licensed for public use. All rights reserved.

For licensing inquiries, please contact the project maintainer.

## 📧 Support & Contact

- **Issues**: Open an issue on GitHub
- **Questions**: Contact the project maintainer
- **Documentation**: See `/docs` folder (if available)

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) - Backend infrastructure
- [FullCalendar](https://fullcalendar.io) - Calendar component
- [date-fns](https://date-fns.org) - Date utilities
- Community contributors and testers

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Maintained By**: Project Team

Made with ❤️ and ☕