# CalendarTracking — Claude Code Project Guide

## What This Project Is

A social calendar and group coordination web app called **Eventli**. Users join groups (family, friends, team) to coordinate events and tasks on a shared calendar, propose tentative events and vote on availability (yes/maybe/no per date slot), and RSVP with people they know. Authentication is handled by Supabase Auth.

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
  lists.js               — /api/lists shopping lists (personal or per group) + items; /api/events/:id/wishlist (GET/POST, one per event)
                           and /api/lists/items/:id/claim (POST/DELETE; claims hidden from the wishlist owner);
                           RLS decides access, names via admin lookup
  routines.js            — GET /api/routines: own weekly-repeating events (personal or in a group) + next session + group label
                           (create/edit/stop reuse /parseEvent; a routine is just a recurring event;
                           a group routine sets groups_id only, so members see it but nobody is invited)
  challenges.js          — /api/groups/:id/challenges (group shared goals)
  pacts.js               — /api/groups/:id/pacts (locked-event group bets)
  notifications.js       — /api/notifications, /api/notification-prefs
  ical.js                — /api/calendar/token, /api/calendar/:token.ics, /api/calendar/import
  email.js               — daily digest emails via Resend
  google.js              — /api/calendar/google/* — Google Calendar connect, sync, webhook
utils/
  utils.js               — authRequire middleware, validatePassword, createEventObj,
                           retrieveTodoLists, retrieveEvents, retrieveAllTasks
  notifications.js       — notifyUsers() helper (in-app + web push)
  lists.js               — list validation helpers (cleanTitles(), cleanWishlistItems(), isHttpLink())
  scheduler.js           — node-cron jobs: digest 07:00, reminders every 5min,
                           countdown 08:00, pact resolution 00:05, habit reminder 20:00,
                           daily summary sweep every 15min
  dailySummary.js        — pure helpers for the daily "events today" push (time
                           normalisation, tz-aware local slot, summary text)
  dailySummarySweep.js   — runDailySummarySweep(): per-user tz-matched morning summary push
  recurrence.js          — RRULE expansion for recurring events
  routines.js            — nextOccurrence() / routineView() for the routines list
  ical.js                — buildICS() RFC 5545 serialiser
  icsImport.js           — icsEventToRow(): pure .ics VEVENT → events row mapping
  wallClock.js           — toWallClock(instant, tz) → naive date/time in a timezone
  google.js              — Google Calendar sync engine (tokens, push/pull, channels)
  reminderDedupe.js      — alreadySent() check on event_reminders_sent
  postgrestFilter.js     — sanitizeOrTerm() for values placed in .or() filters
  groupAccess.js         — isGroupMember(), canAccessEvent() explicit access checks
tests/                   — Vitest, one file per module (route tests use a local
                           Supabase stand-in, no network)
```

### Frontend (`client/`)

```
client/
  index.html             — Vite entry; loads public/theme-init.js (theme before first paint)
  vite.config.ts         — Vite config: /api proxy to :3000, @ alias, VitePWA plugin
  public/
    manifest.webmanifest — PWA manifest (name, icons, display: standalone)
    icons/               — App icons (192px, 512px)
  src/
    index.css            — Eventli design system (CSS variables, dark/light tokens,
                           animations, nav-item classes)
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
        Primitives.tsx   — Tag, Progress, Segmented (sm 28px / md 34px, `full`), Pill, RsvpPill, Section, Empty
        Controls.tsx     — Switch (44×26), Checkbox (square tasks / round shopping), InsetGroup + InsetRow,
                           fieldStyle / areaStyle / labelStyle, quickFieldWrap + quickFieldInput ("Add …, press Enter")
        Sheet.tsx        — Sheet (bottom sheet on phone, right inspector on desktop; `confirmLabel` gives the
                           board's "Cancel · Title · Add" header, `header` replaces it), Disclosure
                           (folded optional section), SheetDialog (Sheet + padded body for small forms)
      AppShell.tsx       — Desktop sidebar ("eventli" wordmark, nav, #sidebar-slot that pages portal into —
                           the calendar filter lives there) + phone bottom nav (no top bar) + PWAInstallBanner
      ProtectedRoute.tsx — Checks auth via fetchMe(), redirects to /login if needed
      EventModal.tsx     — Event view in a Sheet (board PhoneWishlist): "‹ Calendar" row, hero, meta rows,
                           avatars + Going/Maybe/No segmented, 8px bands before wishlist and comments
      EventFormModal.tsx — Create/edit event in a Sheet (board PhoneEvent): big title, Date/Time/All day/Calendar
                           rows; Invite (name pills + "Everyone" = social), Location & note, Wishlist,
                           Repeat & reminder folded in one group. Calendar "Just me" = personal event
      CountdownPill.tsx  — Live countdown badge (Xd Yh)
      HabitHeatmap.tsx   — 16-week completion grid (flex cells, tap-to-log today)
      WeeklyArc.tsx      — SVG ring showing weekly target progress
      GroupChallengeCard.tsx — Group shared goal card with progress bar
      PactModal.tsx      — Create group pact form (reward event + target)
      PactCelebration.tsx — CSS confetti on pact success
      PWAInstallBanner.tsx — beforeinstallprompt banner (dismissed via localStorage)
      MobileMonthGrid.tsx — Phone month grid (dot per covered day + day list, weekend shading)
      MonthGrid.tsx      — Desktop month grid (own; replaced FullCalendar): chips, +N more, weekends;
                           `compact` = phone "Titles" month layout (Dots/Titles switch, eventli.mobileMonthLayout)
      DayPanel.tsx       — Desktop right panel: selected day's events + calendar filter
      WeekStrip.tsx      — Phone Mon–Sun strip above the agenda
      OnboardingWizard.tsx — First-run wizard (hasCompletedOnboarding)
      CommentThread.tsx  — Self-contained event comment thread
      RoutineSheet.tsx   — Quick create/edit sheet for a routine ("Where": just me or a group, day chips, time, end preset)
      QuickAddInput.tsx  — One-line add box (Enter adds one, paste splits lines/commas); reused by shopping + wishlists
      ShoppingLists.tsx  — Shopping tab of TodoPage (?tab=shopping): lists, tap-to-strike, Done section
      WishlistSection.tsx — Event wishlist in EventModal: owner edits items; guests claim ("I'll get this"), owner never sees claim state
      RecurringScopePrompt.tsx — "This / following / all" prompt for recurring edits
    lib/
      design.ts          — Group color map, design constants
      lists.ts           — splitPasted() (paste → items), isSafeLink(), splitDone()
      allDayDates.ts     — addDaysStr + inclusive ↔ exclusive all-day end helpers
      monthGrid.ts       — buildMonthGrid(), weekKeys(), eventsOnDay(), isWeekendKey()
      theme.ts           — per-device theme preference (light/dark/system)
      calendarEvents.ts  — Calendar event normalisation,
                           day coverage, agenda bucketing, fetch window
      recurrence.ts      — RRULE ⇄ recurrence editor state
      routines.ts        — Routine draft → /parseEvent payload, end presets, next-weekday helpers
      nlParser.ts        — Natural-language event parser ("Lunch Friday 1pm")
      countdown.ts       — Countdown utility helpers
      pushNotifications.ts — subscribeToPush() — VAPID key fetch + browser subscribe
    pages/
      CalendarPage.tsx   — Own month grid + day panel (desktop), week strip + agenda (phone), group filter,
                           event color theming, mobile 2-row header, locked events
      GroupsPage.tsx     — Group cards grid + create group modal
      GroupDetailPage.tsx— Group detail: members, events, tasks, pacts, challenges
      TodoPage.tsx       — Task lists with progress bars and task management
      HabitsPage.tsx     — Personal habits: streak, heatmap, weekly arc (XP UI removed; backend still tracks)
      RoutinesPage.tsx   — Weekly routines (swim Mon/Tue…): list, quick-create sheet, stop/delete; reached from Calendar header
      CountdownsPage.tsx — Milestone countdowns (trips, big events) — reached from Calendar header; /timers redirects here
      ProfilePage.tsx    — Profile, stats, notification prefs + push enable,
                           calendar sync (subscribe link + .ics import)
      NotificationsPage.tsx — In-app notification list (bell badge in AppShell)
      LoginPage.tsx      — Dark auth card
      RegisterPage.tsx   — Dark auth card
      PublicEventPage.tsx — Public event page; guests vote on date slots
      JoinGroupPage.tsx  — Join a group from an invite token
      PrivacyPage.tsx    — Privacy policy (contact placeholders still to fill)
    store/
      authStore.ts       — Zustand: user profile, fetchMe(), logout()
      habitStore.ts      — Habits with streaks, completionHistory, completion logging
      timerStore.ts      — Countdown state (exports useCountdownStore; interval timer removed)
      notificationStore.ts — AppNotification list, unread count, mark-read
    types/
      index.ts           — Shared TypeScript interfaces (Profile, Group, CalEvent,
                           Habit, Pact, GroupChallenge, AppNotification, etc.)
```

---

## Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (login/register/logout) | ✅ Done | Supabase cookies |
| Calendar (month + agenda) | ✅ Done | Own month grid (FullCalendar removed 2026-11), Monday start, weekend shading; no drag-to-move |
| Events (CRUD, RSVP, recurring) | ✅ Done | NL parse, reminders, recurrence |
| Date availability voting | ✅ Done | Tentative events; multi-slot yes/maybe/no per date, overlap meter, creator confirms (upgraded 2026-06-15) |
| Groups + invites | ✅ Done | Role-based, invite tokens |
| Tasks / todo lists | ✅ Done | Per-group, progress bars |
| iCal sync | ✅ Done | Subscribe URL + .ics import in ProfilePage |
| Habits tracker | ✅ Done | Streaks, heatmap, weekly arc, progressive targets (XP UI removed 2026-06) |
| Countdowns | ✅ Done | Milestone countdowns; Pomodoro/interval timer removed 2026-06 |
| Group Pacts | ✅ Done | Locked events, completion target, confetti |
| Group Challenges | ✅ Done | Shared group goals with progress |
| Shopping lists + event wishlists | ✅ Done | Per group or personal; one wishlist per event (per series for recurring), claims hidden from the owner |
| Push notifications | ✅ Done | VAPID web push, prefs UI, bell badge |
| PWA install | ✅ Done | Manifest, service worker, install banner |
| Habit reminders (20:00 cron) | ✅ Done | Sends push for unlogged daily habits |

---

## Eventli Design System

The frontend uses a **custom CSS variable system** defined in `client/src/index.css`. **No shadcn/ui, no Tremor.** Look: **Compact Mono** (2026-11 revamp) — ink on white / light ink on near-black; colour only for groups (dots, 3px bars, checkboxes); one ink primary button per screen. Spec: `docs/superpowers/specs/2026-11-07-ui-revamp-design.md`; mockup board: https://claude.ai/artifact/A9RBbt9H4sEtPy473KvPZo

Theme is per device: `lib/theme.ts` (`eventli-theme` in localStorage: light | dark | system, default dark), applied before React mounts by `client/public/theme-init.js` (a file, not inline — the CSP blocks inline scripts). Profile page has the Appearance switch.

### Key design tokens (light / dark)

```css
--bg #ffffff / #0e0e11        --bg-deep (sidebar, side panel) #f6f6f7 / #121215
--surface #ffffff / #16161a   --surface-2 (hover) #f6f6f7 / #18181c
--fill / --surface-3 (inset groups, inputs, segmented track) #f4f4f6 / #1c1c21
--surface-hi (active nav) #ececef / #26262c   --seg-on (selected segment) #ffffff / #3a3a42
--border #ececef / #23232a    --border-2 #d9d9de / #34343c   --border-hi #b4b4bc / #55555e
--text-1 #111114 / #f2f2f5    --text-2 #55555f / #a9a9b4     --text-3 #6b6b75 / #8e8e99
--accent = ink (#111114 / #f2f2f5), --accent-text = inverse
--weekend #f1f1f3 / #18181d   --danger #b42318 / #f97066
```

**Weekends (Sat/Sun) always get `var(--weekend)` in every calendar view** (owner rule).

### Group color coding

Event colours come from the member's chosen group colour (`resolvedHex`, per membership,
`eventHex()` in CalendarPage). `--g-family/friends/work/climb/book` exist per theme for
places that use CSS variables; `--g-self` = `--text-1`.

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
- `<Section title="...">` — page section wrapper (small 13px heading above an inset group)
- `<Empty text="..." />` — empty state placeholder
- `<Sheet title onClose footer? actions?>` — every dialog/form; never hand-roll a fixed overlay
- `<SheetDialog title onClose>` — Sheet with a padded body (small create/edit forms)
- `<Disclosure label summary open onToggle>` — folded optional form section
- `<Switch>`, `<Checkbox shape="square|round">`, `<InsetGroup>` + `<InsetRow>` — settings-style rows
- `<Pill on dot icon>` — round outline chip (people to invite, list switcher, "I'll get this"); on = ink
- Text inputs use `fieldStyle` (44px, 10px radius; the ink focus ring comes from index.css). Borderless
  inputs inside a styled wrapper set `data-bare` so they don't get the ring
- Screens follow the mockup board one-to-one (calendar, tasks/shopping, new event, event view);
  pages without a mockup (groups, habits, profile) use the same rows: fill groups, 3px colour bars, dots
- Page titles use `className="page-title"` (22px phone / 19px desktop); labels are sentence case,
  never uppercase small caps; text on `var(--accent)` is always `var(--accent-text)`

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
| `event_date_options`   | `option_id`, `event_id`, `start_date`, `start_time`, `end_date`, `end_time`, `position`     |
| `event_date_votes`     | `vote_id`, `event_id`, `option_id`, `user_id`, `availability` (yes/maybe/no); unique `(event_id, option_id, user_id)` |
| `task_list`            | `task_list_id`, `groups_id`, `list_title`                                                    |
| `task`                 | `task_id`, `task_list_id`, `task_title`, `is_completed`                                      |
| `habits`               | `habit_id`, `user_id`, `title`, `emoji`, `color`, `frequency`, `xp_value`, `weekly_target`, `target_increment`, `habit_start_week` |
| `habit_completions`    | `habit_id`, `user_id`, `completed_date`                                                      |
| `pacts`                | `pact_id`, `groups_id`, `created_by`, `target_completions`, `completions_count`, `ends_at`, `reward_event_id`, `status` |
| `group_challenges`     | `challenge_id`, `groups_id`, `title`, `target_value`, `current_value`, `unit`, `ends_at`    |
| `notifications`        | `notification_id`, `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at`      |
| `push_subscriptions`   | `user_id`, `endpoint`, `p256dh`, `auth`                                                      |
| `event_reminders_sent` | `event_id`, `occurrence_date`, `reminder_type`, `fired_at`                                   |
| `lists`                | `list_id`, `kind` (shopping/wishlist), `title`, `created_by`, `groups_id` (shopping, null = personal), `event_id` (wishlist; one per event) |
| `list_items`           | `item_id`, `list_id`, `title`, `link`, `note`, `is_done`, `created_by`                      |
| `list_item_claims`     | `item_id` (pk — one claim per item), `claimed_by`, `created_at`                             |

Also present (not detailed here; `subscriptions` and `profiles.plan`/`always_free` are unused leftovers of the removed Free/Plus tier): `event_overrides`, `event_reactions`, `event_comments`, `group_invite_tokens`, `google_calendar_tokens`, `google_synced_calendars`, `google_event_links`, `subscriptions`, `xp_transactions`, `profiles_task`, `timers`.

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
npm run typecheck # Typecheck the client (tsc --noEmit)
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
EVENT_TZ=            (optional IANA zone event wall clocks are read in server-side; defaults to GOOGLE_DEFAULT_TZ, then Europe/Brussels)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
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
- **supabaseAdmin**: Required for cross-user operations (scheduler crons, pact resolution). The regular `req.supabase` client is scoped to the logged-in user via RLS.
- **Server-side Supabase clients must keep `persistSession: false, autoRefreshToken: false`** (see `db/supabase.js`). With defaults on, the shared client stores the last user's session and auto-rotates its refresh token in the background — invalidating the token in the browser's cookie and force-logging users out at JWT expiry (~1h). Never create a server client without these options.
- **All-day `end_date` is inclusive** (10 → 15 Oct covers both days). Only `utils/google.js` and `utils/ical.js` convert to exclusive ends; the whole client stays inclusive (exception: `DateSelection.endStr` handed to EventFormModal for all-day picks is exclusive, converted back by `fromCalendarAllDayEnd`).
- **Deleting a group goes through `delete_group()`** (`db/migrations/2026-10-15_delete_group_rpc.sql`), one transaction via `supabaseAdmin.rpc` after the route's admin check. Never delete group data piecemeal from a route: a mid-way failure leaves the group half-deleted. Test the SQL with `db/tests/run_delete_group_test.sh` (needs Docker).
- **Event times are naive wall clocks, read in `EVENT_TZ`** (`utils/wallClock.js`). Server code that needs a real instant (reminders, countdowns, cron times, "today") must use `wallClockToInstant()` / `todayIn()` — never `new Date(y, m, d, hh, mm)`, `getHours()` or `toISOString().slice(0,10)`, which read the host's zone (UTC in production) and made reminders fire ~2h late.
- **Supabase query builders have no `.catch()`**: they are lazy thenables. Always `const { error } = await …`; a bare `.catch()` throws a TypeError and never sends the query.
- **Date voting**: tentative events store candidate slots in `event_date_options`; members mark availability per slot in `event_date_votes` (one row per `(event_id, option_id, user_id)`, `availability` ∈ yes/maybe/no). `renderEvents` returns per-option `yesCount/maybeCount/noCount` + a `myVotes` map; the creator confirms a slot via `/confirmEventDate`. (Discovery/Ticketmaster removed 2026-06-15.)
- Event creation with gifts uses `create_event_with_wishlist` to save the event, invitations, date options and wishlist atomically; apply both 2026-11-04 migrations before deploying that UI. Wishlist claims live in `list_item_claims`, invisible to the list owner by RLS — never return claim data to the owner.
