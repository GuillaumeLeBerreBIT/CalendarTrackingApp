# CalendarTracking — Claude Code Project Guide

## What This Project Is

A social calendar, group coordination, and local event discovery web app called **Eventli**. Users join groups (family, friends, team) to coordinate events and tasks on a shared calendar. They can browse a local event discovery feed (Ticketmaster live) to find things nearby, save events to their group calendar, and RSVP with people they know. Authentication is handled by Supabase Auth.

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
| Push        | Web Push API + VAPID (`web-push` package), service worker in `sw.ts`   |
| PWA         | `vite-plugin-pwa` with `injectManifest`, manifest at `public/manifest.webmanifest` |
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
                           also /api/push/vapid-public-key, /api/push/subscribe
  events.js              — /api/parseEvent and event CRUD, /api/renderEvents
  groups.js              — /api/groups and group management
  todo.js                — /api/todo and task/task-list management
  habits.js              — /api/habits CRUD + /api/habits/:id/log (XP, pact increment)
  timers.js              — /api/timers CRUD (Pomodoro/countdown timers)
  challenges.js          — /api/groups/:id/challenges (group shared goals)
  pacts.js               — /api/groups/:id/pacts (locked-event group bets)
  notifications.js       — /api/notifications, /api/notification-prefs
  discovery.js           — /api/discovery (Ticketmaster proxy with 10-min cache)
  saved.js               — /api/saved (bookmark discovery events)
  ical.js                — /api/calendar/token, /api/calendar/:token.ics, /api/calendar/import
  email.js               — daily digest emails via Resend
utils/
  utils.js               — authRequire middleware, validatePassword, createEventObj,
                           retrieveTodoLists, retrieveEvents, retrieveAllTasks
  notifications.js       — notifyUsers() helper (in-app + web push)
  scheduler.js           — node-cron jobs: digest 07:00, reminders every 5min,
                           countdown 08:00, pact resolution 00:05, habit reminder 20:00
  recurrence.js          — RRULE expansion for recurring events
  ical.js                — buildICS() RFC 5545 serialiser
tests/
  authRequire.test.js    — Auth middleware tests
```

### Frontend (`client/`)

```
client/
  index.html             — Vite entry (has data-theme="dark" on <html>)
  vite.config.ts         — Vite config: /api proxy to :3000, @ alias, VitePWA plugin
  public/
    manifest.webmanifest — PWA manifest (name, icons, display: standalone)
    icons/               — App icons (192px, 512px)
  src/
    index.css            — Eventli design system (CSS variables, dark/light tokens,
                           animations, nav-item classes, FullCalendar overrides)
    main.tsx             — React entry point
    sw.ts                — Service worker: Workbox precache, push event handler
    App.tsx              — BrowserRouter + route tree + subscribeToPush() on login
    api/
      client.ts          — axios instance (withCredentials, 401→/login interceptor)
    components/
      ui/
        Icon.tsx         — SVG <Icon> component with full IconPaths dict
        Avatar.tsx       — Avatar + AvatarStack (hue-based gradient avatars)
        Button.tsx       — Button + IconButton (primary/secondary/ghost/outline/soft/danger)
        Primitives.tsx   — Tag, Progress, Segmented, RsvpPill, Section, Empty
      AppShell.tsx       — Desktop sidebar + mobile bottom nav + PWAInstallBanner
      ProtectedRoute.tsx — Checks auth via fetchMe(), redirects to /login if needed
      EventModal.tsx     — Full event detail modal (RSVP, attendees, map preview)
      EventFormModal.tsx — Create/edit event form (NL parse, recurrence, reminders)
      CountdownPill.tsx  — Live countdown badge (Xd Yh)
      HabitHeatmap.tsx   — 16-week completion grid (flex cells, tap-to-log today)
      WeeklyArc.tsx      — SVG ring showing weekly target progress
      GroupChallengeCard.tsx — Group shared goal card with progress bar
      PactModal.tsx      — Create group pact form (reward event + target)
      PactCelebration.tsx — CSS confetti on pact success
      PWAInstallBanner.tsx — beforeinstallprompt banner (dismissed via localStorage)
    lib/
      design.ts          — Group color map, source badge metadata, design constants
      mockData.ts        — DiscoveryEvent type definition (data comes from real API)
      nlParser.ts        — Natural-language event parser ("Lunch Friday 1pm")
      countdown.ts       — Countdown utility helpers
      pushNotifications.ts — subscribeToPush() — VAPID key fetch + browser subscribe
    pages/
      DiscoveryPage.tsx  — Discovery feed (Ticketmaster live via /api/discovery)
      CalendarPage.tsx   — FullCalendar month/agenda, Monday start, group filter,
                           event color theming, mobile 2-row header, locked events
      GroupsPage.tsx     — Group cards grid + create group modal
      GroupDetailPage.tsx— Group detail: members, events, tasks, pacts, challenges
      TodoPage.tsx       — Task lists with progress bars and task management
      HabitsPage.tsx     — Personal habits: streak, heatmap, weekly arc (XP UI removed; backend still tracks)
      CountdownsPage.tsx — Milestone countdowns (trips, big events) — reached from Calendar header; /timers redirects here
      ProfilePage.tsx    — Profile, stats, notification prefs + push enable,
                           calendar sync (subscribe link + .ics import)
      NotificationsPage.tsx — In-app notification list (bell badge in AppShell)
      LoginPage.tsx      — Dark auth card
      RegisterPage.tsx   — Dark auth card
      PricingPage.tsx    — Free vs Plus tier comparison
    store/
      authStore.ts       — Zustand: user profile, fetchMe(), logout()
      habitStore.ts      — Habits with streaks, completionHistory, completion logging
      timerStore.ts      — Countdown state (exports useCountdownStore; interval timer removed)
      notificationStore.ts — AppNotification list, unread count, mark-read
      savedStore.ts      — Saved discovery events
    types/
      index.ts           — Shared TypeScript interfaces (Profile, Group, CalEvent,
                           Habit, Pact, GroupChallenge, AppNotification, etc.)
```

---

## Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (login/register/logout) | ✅ Done | Supabase cookies |
| Calendar (month + agenda) | ✅ Done | FullCalendar, Monday start, mobile layout |
| Events (CRUD, RSVP, recurring) | ✅ Done | NL parse, reminders, recurrence |
| Groups + invites | ✅ Done | Role-based, invite tokens |
| Tasks / todo lists | ✅ Done | Per-group, progress bars |
| Discovery feed | ✅ Done | Ticketmaster live, filter chips, save-to-calendar |
| iCal sync | ✅ Done | Subscribe URL + .ics import in ProfilePage |
| Habits tracker | ✅ Done | Streaks, heatmap, weekly arc, progressive targets (XP UI removed 2026-06) |
| Countdowns | ✅ Done | Milestone countdowns; Pomodoro/interval timer removed 2026-06 |
| Group Pacts | ✅ Done | Locked events, completion target, confetti |
| Group Challenges | ✅ Done | Shared group goals with progress |
| Push notifications | ✅ Done | VAPID web push, prefs UI, bell badge |
| PWA install | ✅ Done | Manifest, service worker, install banner |
| Habit reminders (20:00 cron) | ✅ Done | Sends push for unlogged daily habits |
| Pricing page | ✅ Done | Free vs Plus tier |

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

All UI components live in `client/src/components/ui/`. Use these everywhere:

- `<Icon name="calendar" size={20} />` — SVG icon from IconPaths dict
- `<Avatar id="userId" size={32} />` — gradient avatar by user hue
- `<AvatarStack ids={[...]} size={26} max={4} />` — overlapping avatar row
- `<Button variant="primary|secondary|ghost|outline|soft|danger" size="sm|md|lg">`
- `<IconButton name="bell" size={40} badge />` — square icon button
- `<Tag tone="neutral|free|ghost">` — inline pill label
- `<Progress value={3} total={10} color="var(--g-work)" />` — thin progress bar
- `<Segmented options={[...]} value={v} onChange={fn} />` — toggle switcher
- `<RsvpPill status="going|maybe|no" />` — RSVP status chip
- `<Section title="...">` — page section wrapper
- `<Empty text="..." />` — empty state placeholder

---

## Auth System — Read This First

Auth uses Supabase Auth with **four HTTP-only cookies**:

| Cookie        | Contents                   | Expiry                          |
|---------------|----------------------------|---------------------------------|
| `authCookie`  | Supabase JWT access token  | JWT lifetime (`expires_in`, 1h default) |
| `refreshToken`| Supabase refresh token     | 30 days (= real session length) |
| `userId`      | Supabase user UUID         | 30 days                         |
| `expiresAt`   | Token expiry timestamp     | JWT lifetime                    |

All four are set via `setSessionCookies()` in `utils/utils.js` — use it anywhere a new session needs to be written; never hand-roll the cookie quartet.

**`authRequire`** in `utils/utils.js` is the auth middleware. Apply it to any route that requires a logged-in user:

```js
import authRequire from '../utils/utils.js';
router.get('/protected', authRequire, async (req, res) => { ... });
```

After `authRequire`, the authenticated user is available as `req.user` (Supabase user object).  
The current user's UUID is also on `req.cookies.userId` — used for most DB queries.

The middleware automatically refreshes the session if the access token is expired but a valid refresh token exists. If both are missing/invalid, returns `401 JSON` (the React client's axios interceptor handles redirect to `/login`).

Refreshes are **single-flight**: Supabase rotates refresh tokens on every exchange (single-use, ~10s reuse window), so concurrent requests carrying the same refresh token share one exchange via an in-flight map in `utils/utils.js`. Racing the same token independently gets the entire session revoked by Supabase's reuse detection.

---

## Database Patterns

Always import the Supabase client from `db/supabase.js`:

```js
import supabase from '../db/supabase.js';
```

For cross-user / trusted operations (schedulers, pact resolution), use `supabaseAdmin` which bypasses RLS:

```js
import supabase, { supabaseAdmin } from '../db/supabase.js';
```

### Standard query pattern
```js
const { data, error } = await supabase.from('table_name').select('*').eq('column', value);
if (error) return res.status(500).json({ success: false, error: error.message });
```

### Known tables

| Table                  | Key columns                                                                                  |
|------------------------|----------------------------------------------------------------------------------------------|
| `profiles`             | `user_id` (UUID), `username`, `email`, `city`, `total_xp`, `notification_prefs`, `searchable` |
| `groups`               | `groups_id`, `groups_title`, `groups_description`, `tag_name`                                |
| `profiles_groups`      | `user_id`, `groups_id`, `role`, `invite_status`, `joined_at`, `color`                        |
| `events`               | `event_id`, `event_title`, `start_date`, `end_date`, `start_time`, `end_time`, `groups_id`, `status`, `pact_id` |
| `profiles_events`      | `user_id`, `event_id`, `rsvp_status`                                                         |
| `task_list`            | `task_list_id`, `groups_id`, `list_title`                                                    |
| `task`                 | `task_id`, `task_list_id`, `task_title`, `is_completed`                                      |
| `habits`               | `habit_id`, `user_id`, `title`, `emoji`, `color`, `frequency`, `xp_value`, `weekly_target`, `target_increment`, `habit_start_week` |
| `habit_completions`    | `habit_id`, `user_id`, `completed_date`                                                      |
| `pacts`                | `pact_id`, `groups_id`, `created_by`, `target_completions`, `completions_count`, `ends_at`, `reward_event_id`, `status` |
| `group_challenges`     | `challenge_id`, `groups_id`, `title`, `target_value`, `current_value`, `unit`, `ends_at`    |
| `notifications`        | `notification_id`, `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at`      |
| `push_subscriptions`   | `user_id`, `endpoint`, `p256dh`, `auth`                                                      |
| `event_reminders_sent` | `event_id`, `occurrence_date`, `reminder_type`, `fired_at`                                   |

---

## Route Conventions

- All route files use `express.Router()` and export `default router`
- All routes mounted under `/api` in `app.js`
- Protected routes use `authRequire` as the second argument before the handler
- All endpoints return `{ success: true/false, ... }` JSON — no `res.render()`
- In production, Express serves `client/dist` as static files with `*` catch-all → `index.html`

---

## Push Notifications

Backend VAPID keys in `.env`:
```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

`utils/notifications.js` exports `notifyUsers(client, userIds, type, payload)` — writes to `notifications` table and fires web-push to `push_subscriptions`. Respects per-user `notification_prefs` from `profiles`.

Frontend: `client/src/lib/pushNotifications.ts` exports `subscribeToPush()` — called automatically in `App.tsx` on login (idempotent).

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
SUPABASE_ANON_KEY=   (publishable key, sb_publishable_… — request-scoped clients)
SUPABASE_SECRET_KEY= (secret key, sb_secret_… — supabaseAdmin only; legacy var name SUPABASE_KEY still works as fallback)
PORT=                (optional, defaults to 3000)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
TICKET_MASTER_KEY=
RESEND_API_KEY=
```

---

## Common Gotchas

- **ESM only (backend)**: Use `import`/`export`, never `require()`. The package is `"type": "module"`.
- **`__dirname` doesn't exist in ESM** — it's reconstructed in `app.js` via `fileURLToPath`.
- **`userId` cookie vs `req.user`**: Most DB queries use `req.cookies.userId` (a string UUID) directly. `req.user` is the full Supabase user object, only guaranteed present after `authRequire`.
- **Supabase time fields**: `start_time`/`end_time` come back as `HH:MM:SS` strings from Postgres — slice to `HH:MM` with `.slice(0, -3)` before sending to the client.
- **CSS variables not Tailwind utilities**: For anything touching the design system (colors, surfaces, radii, shadows), use CSS variables (`var(--accent)`, `var(--surface-2)`, etc.) in inline styles or CSS. Tailwind is used for layout only.
- **Icon component**: Never use lucide-react — use `<Icon name="..." />` from `@/components/ui/Icon`.
- **FullCalendar event colors**: Use `--fc-event-bg-color` and `--fc-event-border-color` CSS custom properties set in `eventDidMount` via `setProperty`. The global override in `index.css` reads these — never use `!important` background on `.fc-daygrid-event`.
- **supabaseAdmin**: Required for cross-user operations (scheduler crons, pact resolution). The regular `req.supabase` client is scoped to the logged-in user via RLS.
- **Server-side Supabase clients must keep `persistSession: false, autoRefreshToken: false`** (see `db/supabase.js`). With defaults on, the shared client stores the last user's session and auto-rotates its refresh token in the background — invalidating the token in the browser's cookie and force-logging users out at JWT expiry (~1h). Never create a server client without these options.
- **Discovery**: `DiscoveryPage` calls the real Ticketmaster API via `/api/discovery`. `lib/mockData.ts` only provides the `DiscoveryEvent` type definition now.
