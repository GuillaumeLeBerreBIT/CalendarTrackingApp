# CalendarTracking — Claude Code Project Guide

## What This Project Is

A social calendar, group coordination, and local event discovery web app called **Eventli**. Users join groups (family, friends, team) to coordinate events and tasks on a shared calendar. They can also browse a local event discovery feed (Ticketmaster, Eventbrite, Meetup) to find things nearby, save events to their group calendar, and RSVP with people they know. Authentication is handled by Supabase Auth.

---

## Tech Stack

| Layer       | Technology                                                              |
|-------------|-------------------------------------------------------------------------|
| Runtime     | Node.js (ESM — `"type": "module"` in package.json)                     |
| Backend     | Express.js v5 — pure JSON API, all routes under `/api`                 |
| Database    | Supabase (PostgreSQL via `@supabase/supabase-js`)                      |
| Auth        | Supabase Auth, session stored in HTTP-only cookies                     |
| Frontend    | React 19 + Vite 8 (in `client/`)                                       |
| Styling     | Tailwind CSS v4 + Eventli custom design system (CSS variables)         |
| State       | Zustand (`client/src/store/`)                                          |
| Icons       | Custom SVG `<Icon>` component — no external icon library               |
| Testing     | Vitest (`npm test`)                                                     |

---

## Folder Structure

### Backend (root)

```
app.js                   — Express entry point, API config, static React serving
db/
  supabase.js            — Supabase client singleton (import from here everywhere)
routes/
  auth.js                — /api/login, /api/register, /api/logout, /api/profile
  events.js              — /api/parseEvent and event CRUD, /api/renderEvents
  groups.js              — /api/groups and group management
  todo.js                — /api/todo and task/task-list management
utils/
  utils.js               — authRequire middleware, validatePassword, createEventObj,
                           retrieveTodoLists, retrieveEvents, retrieveAllTasks
tests/
  authRequire.test.js    — Auth middleware tests
```

### Frontend (`client/`)

```
client/
  index.html             — Vite entry (has data-theme="dark" on <html>)
  vite.config.ts         — Vite config with /api proxy to :3000 and @ alias
  src/
    index.css            — Eventli design system (CSS variables, dark/light tokens,
                           animations, nav-item classes)
    main.tsx             — React entry point
    App.tsx              — BrowserRouter + route tree
    api/
      client.ts          — axios instance (withCredentials, 401→/login interceptor)
    components/
      ui/
        Icon.tsx         — SVG <Icon> component with full IconPaths dict
        Avatar.tsx       — Avatar + AvatarStack (hue-based gradient avatars)
        Button.tsx       — Button + IconButton (primary/secondary/ghost/outline/soft/danger)
        Primitives.tsx   — Tag, Progress, Segmented, RsvpPill
      AppShell.tsx       — Desktop sidebar + mobile bottom nav layout
      ProtectedRoute.tsx — Checks auth via fetchMe(), redirects to /login if needed
      EventModal.tsx     — Full event detail modal (RSVP, attendees, map preview)
    lib/
      design.ts          — Group color map, source badge metadata, design constants
      mockData.ts        — Discovery mock events (Brussels-based; Phase 6 replaces
                           with real Ticketmaster/Eventbrite/Meetup API calls)
    pages/
      DiscoveryPage.tsx  — Discovery feed (featured card, filter chips, event cards)
      CalendarPage.tsx   — FullCalendar month/agenda + group filter panel
      GroupsPage.tsx     — Group cards grid + create group modal
      GroupDetailPage.tsx— Group detail (cover, members, events, tasks, activity)
      TodoPage.tsx       — Task lists with progress bars and task management
      ProfilePage.tsx    — User profile, stats grid, settings list
      LoginPage.tsx      — Dark auth card
      RegisterPage.tsx   — Dark auth card
      PricingPage.tsx    — Free vs Plus tier comparison
    store/
      authStore.ts       — Zustand: user profile, fetchMe(), logout()
    types/
      index.ts           — Shared TypeScript interfaces (Profile, Group, CalEvent, etc.)
```

---

## Eventli Design System

The frontend uses a **custom CSS variable system** defined in `client/src/index.css`. **No shadcn/ui.** Dark mode is the default (`data-theme="dark"` on `<html>`).

### Key design tokens

```css
/* Accent — deep violet/indigo */
--accent:        hsl(252 88% 66%)
--accent-hover:  hsl(252 88% 72%)
--accent-soft:   hsl(252 88% 66% / 0.14)
--accent-glow:   hsl(252 88% 66% / 0.40)

/* Dark surfaces */
--bg:          #0b0b12
--surface:     #14141f
--surface-2:   #1b1b29
--surface-3:   #232334
--surface-hi:  #2a2a3d

/* Text */
--text-1:  #f3f3f8   /* primary */
--text-2:  #a9a9be   /* secondary */
--text-3:  #6f6f87   /* muted */

/* Border */
--border:    hsl(250 18% 100% / 0.08)
--border-2:  hsl(250 18% 100% / 0.13)
```

### Group color coding

```ts
// lib/design.ts
export const GROUP_COLORS = {
  family:  '#f59e0b',
  friends: '#ec4899',
  work:    '#22d3aa',
  climb:   '#38bdf8',
  book:    '#c084fc',
  self:    'var(--accent)',  // discovery saves
}
```

### Component primitives

All UI components live in `client/src/components/ui/`. Use these everywhere — don't reach for Tailwind one-offs when a primitive covers it:

- `<Icon name="calendar" size={20} />` — SVG icon from IconPaths dict
- `<Avatar id="userId" size={32} />` — gradient avatar by user hue
- `<AvatarStack ids={[...]} size={26} max={4} />` — overlapping avatar row
- `<Button variant="primary|secondary|ghost|outline|soft|danger" size="sm|md|lg">` 
- `<IconButton name="bell" size={40} badge />` — square icon button
- `<Tag tone="neutral|free|ghost">` — inline pill label
- `<Progress value={3} total={10} color="var(--g-work)" />` — thin progress bar
- `<Segmented options={[...]} value={v} onChange={fn} />` — toggle switcher
- `<RsvpPill status="going|maybe|no" />` — RSVP status chip

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

The middleware automatically refreshes the session if the access token is expired but a valid refresh token exists. If both are missing/invalid, returns `401 JSON` (the React client's axios interceptor handles redirect to `/login`).

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

---

## Route Conventions

- All route files use `express.Router()` and export `default router`
- All routes mounted under `/api` in `app.js`
- Protected routes use `authRequire` as the second argument before the handler
- All endpoints return `{ success: true/false, ... }` JSON — no `res.render()`
- In production, Express serves `client/dist` as static files with `*` catch-all → `index.html`

---

## Dev Commands

```bash
# Backend
npm test          # Run Vitest tests
node app.js       # Start Express API on port 3000

# Frontend (separate terminal)
cd client
npm run dev       # Vite dev server on :5173, proxies /api → :3000
npm run build     # Production build → client/dist (served by Express)
```

Required `.env` variables:
```
SUPABASE_URL=
SUPABASE_KEY=
PORT=            (optional, defaults to 3000)
```

---

## Common Gotchas

- **ESM only (backend)**: Use `import`/`export`, never `require()`. The package is `"type": "module"`.
- **`__dirname` doesn't exist in ESM** — it's reconstructed in `app.js` via `fileURLToPath`.
- **`userId` cookie vs `req.user`**: Most DB queries use `req.cookies.userId` (a string UUID) directly. `req.user` is the full Supabase user object, only guaranteed present after `authRequire`.
- **Supabase time fields**: `start_time`/`end_time` come back as `HH:MM:SS` strings from Postgres — slice to `HH:MM` with `.slice(0, -3)` before sending to the client.
- **CSS variables not Tailwind utilities**: For anything touching the design system (colors, surfaces, radii, shadows), use CSS variables (`var(--accent)`, `var(--surface-2)`, etc.) in inline styles or CSS. Tailwind is used for layout only.
- **Icon component**: Never use lucide-react — use `<Icon name="..." />` from `@/components/ui/Icon`.
- **Discovery data**: `DiscoveryPage` uses `lib/mockData.ts` until Phase 6 wires up real APIs. The mock data shape must match what the real API will return.
