# CalendarTracking — Claude Code Project Guide

## What This Project Is

A calendar and task-tracking web app. Users can create groups, invite members, add calendar events and to-do task lists, and track completion. Authentication is handled by Supabase Auth.

---

## Tech Stack

| Layer       | Technology                                  |
|-------------|---------------------------------------------|
| Runtime     | Node.js (ESM — `"type": "module"` in package.json) |
| Backend     | Express.js v5                               |
| Database    | Supabase (PostgreSQL via `@supabase/supabase-js`) |
| Auth        | Supabase Auth, session stored in HTTP-only cookies |
| Views       | EJS templating (`views/*.ejs`)              |
| Frontend    | Raw CSS + vanilla JS (`public/css/`, `public/js/`) |
| Testing     | Vitest (`npm test`)                         |

---

## Folder Structure

```
app.js                   — Express entry point, app config, top-level routes
db/
  supabase.js            — Supabase client singleton (import from here everywhere)
routes/
  auth.js                — /login, /register, /logout
  events.js              — /parseEvent and event CRUD
  groups.js              — /groups and group management
  todo.js                — /todo and task/task-list management
utils/
  utils.js               — authRequire middleware, validatePassword, createEventObj,
                           retrieveTodoLists, retrieveEvents, retrieveAllTasks
views/
  *.ejs                  — Full-page EJS templates
  partials/
    header.ejs           — <head> tag and meta
    navbar.ejs           — Top navigation bar
    footer.ejs           — Footer
public/
  css/
    styles.css           — Global base styles
    components.css       — Shared UI components
    utilities.css        — Utility classes
    navbar.css           — Navbar styles
    calendar.css         — Calendar page styles
    groups.css           — Groups page styles
    todo-styles.css      — Todo page styles
  js/
    calendar.js          — FullCalendar init + event logic
    groups.js            — Groups page client logic
    todo.js              — Todo page client logic
    navbar.js            — Navbar interactions
    pwa.js               — Service worker registration
tests/
  authRequire.test.js    — Auth middleware tests
.claude/
  agents/                — Custom sub-agents for this project
```

---

## Auth System — Read This First

Auth uses Supabase Auth with **four HTTP-only cookies**:

| Cookie        | Contents                   | Expiry   |
|---------------|----------------------------|----------|
| `authCookie`  | Supabase JWT access token  | 3 hours  |
| `refreshToken`| Supabase refresh token     | 7 days   |
| `userId`      | Supabase user UUID         | 7 days   |
| `expiresAt`   | Token expiry timestamp     | 3 hours  |

**`authRequire`** in `utils/utils.js` is the auth middleware. Apply it to any route that requires a logged-in user:

```js
import authRequire from '../utils/utils.js';
router.get('/protected', authRequire, async (req, res) => { ... });
```

After `authRequire`, the authenticated user is available as `req.user` (Supabase user object).  
The current user's UUID is also on `req.cookies.userId` — used for most DB queries.

The middleware automatically refreshes the session if the access token is expired but a valid refresh token exists. If both are missing/invalid, it redirects to `/login`.

---

## Database Patterns

Always import the Supabase client from `db/supabase.js`:

```js
import supabase from '../db/supabase.js';
```

### Standard query pattern
```js
const { data, error } = await supabase.from('table_name').select('*').eq('column', value);
if (error) return res.status(500).json({ success: false, error: error.message });
```

### Known tables

| Table             | Key columns                                                              |
|-------------------|--------------------------------------------------------------------------|
| `profiles`        | `user_id` (UUID), `username`, `email`                                    |
| `groups`          | `groups_id`, `groups_title`, `groups_description`, `tag_name`            |
| `profiles_groups` | `user_id`, `groups_id`, `role`, `invite_status`, `joined_at`             |
| `events`          | `event_id`, `event_title`, `event_description`, `all_day`, `start_date`, `end_date`, `start_time`, `end_time`, `groups_id` |
| `profiles_events` | `user_id`, `event_id`, `rsvp_status`                                     |
| `task_list`       | `task_list_id`, `groups_id`, `list_title`                                |
| `task`            | `task_id`, `task_list_id`, `task_title`, `is_completed`                  |

Joining example (profiles_groups is a junction table):
```js
supabase.from('groups')
  .select(`groups_id, tag_name, profiles_groups!inner(user_id)`)
  .eq('profiles_groups.user_id', req.cookies.userId)
```

---

## Route Conventions

- All route files use `express.Router()` and export `default router`
- Routes are registered in `app.js` under `/` — no prefix per router
- Protected routes use `authRequire` as the second argument before the handler
- API endpoints return `{ success: true/false, ... }` JSON
- Page routes call `res.render('view.ejs', { data, currentPage: 'pageName' })`
- `currentPage` is passed to the navbar partial to highlight the active link

---

## EJS / Frontend Conventions

- Every page includes `<%- include('partials/header') %>`, `<%- include('partials/navbar', { currentPage }) %>`, and `<%- include('partials/footer') %>`
- Client-side JS lives in `public/js/` and is included at the bottom of EJS files via `<script src="/js/filename.js">`
- CSS is included in `partials/header.ejs` — add new stylesheets there
- Data passed from the server to EJS is accessed directly as variables: `<%= variableName %>`

---

## Dev Commands

```bash
npm test          # Run Vitest tests (vitest run)
node app.js       # Start dev server on port 3000 (or $PORT)
```

Required `.env` variables:
```
SUPABASE_URL=
SUPABASE_KEY=
PORT=            (optional, defaults to 3000)
```

---

## Common Gotchas

- **ESM only**: Use `import`/`export`, never `require()`. The package is `"type": "module"`.
- **`__dirname` doesn't exist in ESM** — it's reconstructed in `app.js` via `fileURLToPath`:
  ```js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  ```
- **Route registration order matters**: Routers are mounted before `app.listen()` in `app.js`, but some routes (like `/calendar`) are defined directly on `app` after `listen()`. New routes should go in the appropriate router file in `routes/`.
- **`userId` cookie vs `req.user`**: Most DB queries use `req.cookies.userId` (a string UUID) directly. `req.user` is the full Supabase user object, only guaranteed present after `authRequire`.
- **Supabase time fields**: `start_time`/`end_time` come back as `HH:MM:SS` strings from Postgres — slice to `HH:MM` with `.slice(0, -3)` before sending to the client.
