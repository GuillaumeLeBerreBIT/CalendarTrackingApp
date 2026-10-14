# Eventli full audit — 2026-10-13

Read-only audit of the working tree at `2e12eff` plus the uncommitted all-day fix.
No source file was changed. The only file written in the repository is this report.

## 1. Executive summary

The audit ran the test suite, typecheck and production build, reproduced date, recurrence and
scheduler logic against the installed libraries, exercised the real `.ics` import handler
in-process against a local stand-in for Supabase, and drove the calendar in Chrome at 1440×900
and 390×844 with a fully mocked `/api`. Three things could not be done: there is no `.env` or
any Supabase credential on this machine, so the backend was never started, the live database
was never queried, and RLS policies, indexes, constraints and row counts are all undetermined.
The `.ics` import is broken on HEAD: the handler returns 500 after inserting one event with no
participant row. The uncommitted all-day fix is correct on desktop FullCalendar (render, drag,
resize, drag-select across a month boundary, a year boundary and a leap day all save the right
span) but it introduces a new bug: editing an all-day event from the agenda or the compact
mobile grid stores the end one day later on every save. Event reminders are deduplicated with
a query that either suppresses the reminder or re-sends it every five minutes, depending on how
many countdown rows exist. `/api/checkUser` builds a PostgREST filter from raw input; the
injection is reproduced at request level, its data exposure depends on RLS that could not be
read. Every authorization finding that depends on RLS is labelled UNVERIFIED and should be
re-checked once database access is available.

Counts: **Critical 0, High 7, Medium 12, Low 14.**

## 2. Top 10 findings

| # | ID | Severity | Finding | Status |
|---|----|----------|---------|--------|
| 1 | H1 | High | `.ics` import returns 500 after the first event and leaves an orphan row | CONFIRMED |
| 2 | H2 | High | Pending diff: editing an all-day event from agenda / compact mobile grid adds a day per save | CONFIRMED |
| 3 | H4 | High | `/api/checkUser` filter injection: read oracle on `profiles` columns | PLAUSIBLE |
| 4 | H3 | High | Event reminder is either never sent or re-sent every 5 minutes | CONFIRMED (query level) |
| 5 | H5 | High | "This and following" on an all-day recurring event keeps the chosen occurrence | CONFIRMED |
| 6 | H7 | High | Timed `.ics` imports are stored at UTC time, not wall-clock time | CONFIRMED |
| 7 | H6 | High | All-day `.ics` imports land a day early on servers east of UTC | CONFIRMED |
| 8 | M1 | Medium | Rows already stored with an exclusive end will render a day long once the diff ships | PLAUSIBLE, scope not determined |
| 9 | M4 | Medium | Multi-day events show only on their first day in the compact grid and agenda | CONFIRMED |
| 10 | M5 | Medium | A failed event load shows an empty calendar with no error | CONFIRMED |

## 3. Findings by area

### 3.1 Security

### [HIGH] H4 — `/api/checkUser` interpolates raw input into a PostgREST `or()` filter
- Area: Security / input validation
- Location: routes/groups.js:136
- What happens: `req.body.isUser` is placed unescaped into the filter string. A comma or
  parenthesis adds extra conditions on any `profiles` column. The response (`match: true/false`,
  plus the matched user) then acts as a yes/no oracle on columns the endpoint never selects,
  including `ical_token`, the bearer credential for the public calendar feed. The sibling
  `/users/search` strips `,()%*` (groups.js:201); this handler does not.
- Reproduction: build the handler's query with the installed client against a local server.
  Input `nomatch,and(username.eq.alice,ical_token.like.3f*)`.
  Expected: one literal username/email comparison.
  Actual request: `or=(username.ilike.nomatch,and(username.eq.alice,ical_token.like.3f*),email.ilike.nomatch,and(username.eq.alice,ical_token.like.3f*))`.
- Evidence: the request line above, captured from the script run (section 5, V9). `ROADMAP.md:124-127`
  states the `profiles` SELECT policy exposes rows to any authenticated user.
- Status: PLAUSIBLE. The injection into the request is reproduced. Whether the extra columns are
  readable depends on the live RLS policy and column grants, which were not readable.
- Suggested fix: apply the same sanitisation as `/users/search`, or replace `or()` with two
  parameterised `.ilike()` queries.

### [MEDIUM] M7 — Guest vote tokens are sent to every group member
- Area: Security / tentative voting
- Location: routes/events.js:770 (exposure), routes/events.js:1071-1091 (use)
- What happens: `renderEvents` returns `userId: guest:${v.guest_token}` for guest votes. The
  public vote endpoint accepts `guestToken` as the only proof of identity for changing or
  clearing that guest's votes, so any member who can see the event can alter a guest's answers.
- Reproduction: not run (needs the backend). Read the `votes[].userId` of a guest in a
  `/api/renderEvents` response, then POST `/api/e/<publicToken>/vote` with that `guestToken`.
- Evidence: `userId: v.user_id || \`guest:${v.guest_token}\``; `publicToken` is in the same
  payload (events.js:802).
- Status: PLAUSIBLE (code read only).
- Suggested fix: send a hash or a per-response index instead of the token.

### [MEDIUM] M8 — Many handlers rely on RLS alone for group authorization
- Area: Security / authorization
- Location: routes/events.js:866-889 (`PATCH /rsvp/:eventId` inserts a participant row for any
  event id), :1427/:1464/:1516 (reactions, comments), :832 (`/retrieveUsersSelectedGroup`),
  :56 and :312 (`groups_id` taken from the body on create/update); routes/groups.js:500
  (`/getGroupMembers/:groupId`, returns emails); routes/todo.js:124, :154, :371;
  routes/habits.js:367-378 (no ownership check on `habitId`).
- What happens: these handlers use the user-scoped client and contain no membership or ownership
  check in code. They are safe only if the corresponding RLS policy enforces it. Event ids are
  sequential integers, so ids are guessable.
- Reproduction: not possible without the database.
- Evidence: e.g. rsvp inserts `{ event_id: eventId, user_id: req.cookies.userId, rsvp_status }`
  with no prior check. `ROADMAP.md:124-127` records that `profiles_events` and `profiles_groups`
  SELECT policies are `USING (true)` / `auth.uid() IS NOT NULL`.
- Status: UNVERIFIED. Not confirmed as exploitable; not ruled out.
- Suggested fix: add a shared `requireGroupMember` check in code so correctness does not depend
  on policies that are not in the repository. Then verify each policy.

### [LOW] L8 — `.ics` upload has no type check and no event cap
- Area: Security / input validation
- Location: routes/ical.js:10, :160-245
- What happens: multer limits size to 5 MB but there is no `fileFilter`. Each VEVENT costs up to
  three sequential queries with no upper bound on the number of events.
- Reproduction: not run.
- Evidence: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })`.
- Status: PLAUSIBLE.
- Suggested fix: cap events per import and batch the inserts.

### [LOW] L9 — Raw database error messages are returned to clients
- Area: Security / information leakage
- Location: about 119 sites, e.g. routes/events.js (36), routes/groups.js (39); routes/groups.js:179
- What happens: `error.message` from Supabase is passed straight into the JSON response.
- Reproduction: not run.
- Evidence: `grep -c "error: .*\.message" routes/*.js` (section 5, V12).
- Status: CONFIRMED (pattern present); impact not assessed.
- Suggested fix: log the detail server-side and return a generic message.

### [LOW] L12 — Share and feed tokens cannot be revoked, only replaced
- Area: Security / tokens
- Location: routes/ical.js:121-126; routes/events.js:802
- What happens: the iCal token is a `crypto.randomUUID()` (unguessable), stored in plain text.
  It can be rotated by POSTing again but there is no endpoint to disable the feed. The event
  `public_token` is sent to every viewer and has no rotation at all.
- Reproduction: not applicable.
- Evidence: the only writer of `ical_token` is the POST handler; no writer of `public_token`
  exists in the repository.
- Status: CONFIRMED (code read).
- Suggested fix: add a DELETE for the calendar token and a regenerate action for event links.

Checked and found in order: both server clients and the per-request client set
`persistSession: false, autoRefreshToken: false` (db/supabase.js:9-13). Session cookies are
`httpOnly`, `sameSite: 'lax'`, `secure` in production (utils/utils.js:113-114). `authRequire`
rebinds `req.cookies.userId` to the verified user (utils/utils.js:19, :39, :58, :67). No handler
reads a user id from body, query or params. Login and register have a 20-per-15-minutes limiter
(routes/auth.js:16); all `/api` has 300 per 15 minutes (app.js:99-106). Stripe webhooks verify
the signature (routes/billing.js:113). Google OAuth verifies `state` (routes/google.js:51, :82).
Pacts and challenges check membership and scope mutations by `groups_id`. No
`dangerouslySetInnerHTML` in `client/src`.

### 3.2 Calendar correctness

### [HIGH] H1 — `.ics` import returns 500 after the first event
- Area: Calendar correctness / iCal import
- Location: routes/ical.js:239-242
- What happens: `.catch(() => {})` is chained onto a Supabase query builder, which has `then`
  but no `catch`. The call throws after the event insert has succeeded. The request fails, the
  participant row is never sent, and no further events are imported. A retry skips the first
  event by UID and repeats the failure on the next one.
- Reproduction: POST a 3-event `.ics` to the real router mounted in-process, with Supabase
  replaced by a local HTTP stand-in.
  Expected: `200 {"success":true,"imported":3,"skipped":0}`, 3 event inserts, 3 participant inserts.
  Actual: `500`, `TypeError: req.supabase.from(...).insert(...).catch is not a function`,
  1 event insert, 0 participant inserts.
- Evidence: script output (section 5, V13). Present on HEAD since `b441e9e` (2026-06-10).
- Status: CONFIRMED (reproduced through the route handler).
- Suggested fix: `const { error } = await ...insert(...)` and ignore the error explicitly.

### [HIGH] H2 — Pending diff: agenda and compact mobile grid edits add a day per save
- Area: Calendar correctness / uncommitted change
- Location: client/src/pages/CalendarPage.tsx:694-696, :1104, :1166, :624-628;
  client/src/components/EventFormModal.tsx:79-80
- What happens: the diff converts inclusive ends to FullCalendar's exclusive form inside
  `filteredEvents`. That array also feeds `MobileMonthGrid` and `AgendaList`, whose click handler
  stores the converted object as the selected event. The edit form then treats that exclusive end
  as inclusive. Desktop FullCalendar clicks are unaffected because they look the event up in the
  unconverted `events`.
- Reproduction: stored single-day all-day event, 13 Oct → 13 Oct. Open it from the agenda (or
  the compact mobile grid) and press Edit.
  Expected form: 2026-10-13 .. 2026-10-13. Actual: 2026-10-13 .. 2026-10-14.
  Pressing Save without changing anything sends `PUT /parseEvent` with `endDate: "2026-10-14"`.
  A 30 Oct → 2 Nov event prefilled as ending 3 Nov.
- Evidence: scenario results D8a, D9, M-compact-b, M-compact-c (section 5, V14). Baseline
  comparison (V16): on HEAD the same two flows show 13..13. Screenshots
  `05-desktop-agenda-edit-form.png`, `11-mobile-compact-edit-form.png`.
- Status: CONFIRMED (reproduced in a browser, with a HEAD baseline).
- Suggested fix: keep one inclusive `events` array for all app components and apply
  `toCalendarAllDayEnd` only on the array passed to `<FullCalendar events=…>`.

### [HIGH] H5 — "This and following" keeps the selected occurrence for all-day series
- Area: Calendar correctness / recurrence
- Location: utils/recurrence.js:98-105 (`capRuleUntil`); callers routes/events.js:220, :462
- What happens: the cap is `UNTIL=<date>T000000Z`. RRULE `UNTIL` is inclusive, and an all-day
  occurrence (or a timed one at 00:00) starts exactly at that instant, so it survives. Deleting
  "this and following" leaves the chosen day; editing duplicates it, because the new series
  starts on the same day.
- Reproduction: weekly series from 2027-03-01, cap at 2027-03-15.
  Expected remaining: 03-01, 03-08. Actual for all-day: 03-01, 03-08, **03-15**.
  Timed at 09:00 gives the expected result; timed at 00:00 also keeps 03-15.
- Evidence: script output (section 5, V7).
- Status: CONFIRMED (reproduced with the real module).
- Suggested fix: cap at the end of the previous day (`UNTIL=<date − 1>T235959Z`).

### [HIGH] H6 — All-day `.ics` imports land a day early on servers east of UTC
- Area: Calendar correctness / iCal import
- Location: routes/ical.js:177-180
- What happens: node-ical builds `VALUE=DATE` values at local midnight; `toISOString()` converts
  to UTC, which is the previous day for any positive UTC offset. The pending end-date fix is
  built on these shifted strings and does not address it.
- Reproduction: `DTSTART;VALUE=DATE:20270310`. Expected `start_date=2027-03-10`.
  Actual: UTC 03-10; America/Los_Angeles 03-10; Europe/Brussels **03-09**; Pacific/Auckland **03-09**.
- Evidence: script output (section 5, V5), node-ical 0.26.1.
- Status: CONFIRMED. Production impact depends on the host timezone, which was not checked.
  Currently masked by H1.
- Suggested fix: format all-day dates from local getters, matching how the parser built them.

### [HIGH] H7 — Timed `.ics` imports are stored at UTC time
- Area: Calendar correctness / iCal import
- Location: routes/ical.js:182-187
- What happens: `start_time`/`end_time` are naive wall-clock columns, but the import writes
  `getUTCHours()`. Zoned events are stored at the wrong hour and can move to another date.
  Floating times additionally depend on the server timezone.
- Reproduction: `DTSTART;TZID=Europe/Brussels:20270310T140000` → stored `13:00` (expected 14:00)
  under every server TZ tested. `DTSTART;TZID=America/New_York:20270310T220000` → stored
  `2027-03-11 03:00`. Floating 14:00 → 14:00 on UTC, 13:00 Brussels, 22:00 Los Angeles.
- Evidence: script output (section 5, V5). Google import uses `toWallClock(date, tz)`
  (utils/google.js:481-486) and does not share the problem by code reading.
- Status: CONFIRMED. Currently masked by H1.
- Suggested fix: convert the instant with `toWallClock` in the user's timezone.

### [MEDIUM] M1 — Rows stored with an exclusive end will render a day long after the diff
- Area: Calendar correctness / data
- Location: client/src/pages/CalendarPage.tsx:641-644, :659-662 (removed lines of the diff);
  routes/ical.js:190 on HEAD
- What happens: on HEAD, drag, resize and drag-select of all-day events, and `.ics` import, wrote
  FullCalendar's or RFC 5545's exclusive end. HEAD displayed those rows correctly by accident
  and displayed form-created rows one day short. The diff makes the convention inclusive
  everywhere, so the old exclusive rows gain a day. There is no migration.
- Reproduction: HEAD baseline renders a stored 20 → 22 Oct event on 20 and 21 only; the working
  tree renders 20, 21, 22 (V16). The removed diff line is
  `endDate: event.endStr ? event.endStr.split('T')[0] : ...`.
- Evidence: V16 output; `git diff`.
- Status: PLAUSIBLE. The number of affected rows is NOT DETERMINED (no database access). Rows
  from `.ics` import are probably few, since H1 stops each import after one event. Rows cannot be
  told apart from genuine multi-day events by the data alone.
- Suggested fix: before shipping the diff, list all-day rows with `end_date > start_date` and
  decide per source; queries are in section 4.

### [MEDIUM] M2 — Splitting a `COUNT` series lengthens it
- Area: Calendar correctness / recurrence
- Location: routes/events.js:244
- What happens: the new master of a "this and following" edit carries the original rule,
  including `COUNT`, restarting the count. It also ignores any change the user made to the rule
  or to the start date (`start_date: occurrenceDate`, :236).
- Reproduction: `FREQ=WEEKLY;COUNT=4` from 2027-03-01, split at 03-15.
  Expected 4 occurrences in total. Actual 6 (03-01, 03-08 + 03-15, 03-22, 03-29, 04-05).
- Evidence: script output (section 5, V7).
- Status: CONFIRMED (function level; the endpoint was not called).
- Suggested fix: subtract the occurrences already consumed, or convert `COUNT` to `UNTIL`.

### [MEDIUM] M3 — Recurring events disappear outside a −60 / +365 day window
- Area: Calendar correctness / recurrence
- Location: routes/events.js:620-621
- What happens: recurring masters are expanded only between 60 days ago and 365 days ahead,
  regardless of the month being viewed. Non-recurring events have no window at all, so the two
  kinds behave differently when navigating.
- Reproduction: weekly series since 2025-01-06 expanded with the handler's window on 2026-10-13.
  First occurrence returned 2026-08-17, last 2027-10-11.
- Evidence: script output (section 5, V7).
- Status: CONFIRMED (function level). Not checked in the browser.
- Suggested fix: pass the visible range from the client and expand for that range.

### [MEDIUM] M4 — Multi-day events appear only on their first day outside FullCalendar
- Area: Calendar correctness / UI
- Location: client/src/components/MobileMonthGrid.tsx:117-125; client/src/pages/CalendarPage.tsx:117-128
- What happens: both views index events by start date only. A 13 → 16 Oct event is absent on
  14, 15 and 16 in the compact grid, and the agenda lists it once. The agenda also drops a
  multi-day event that started before today and is still running (`day < todayKey`).
- Reproduction: compact grid at 390×844, event 13 → 16 Oct, select 15 Oct.
  Expected: event listed. Actual: not listed (M-compact-a). Agenda lists a 4-day event once (D8).
- Evidence: section 5, V14; screenshot `09-mobile-compact-day15.png`.
- Status: CONFIRMED.
- Suggested fix: index each event under every day of its span.

### [MEDIUM] M9 — Personal-events query filters the embed, not the events
- Area: Calendar correctness / data access
- Location: routes/events.js:570-581, :525-530
- What happens: `profiles_events(...)` is embedded without `!inner`, so
  `.eq('profiles_events.user_id', …)` trims the embedded rows but not the parent events. The
  handler therefore returns every `groups_id IS NULL` event that RLS lets the user read, and each
  one's participant list contains at most the viewer. The iCal feed uses `!inner` for the same
  query (routes/ical.js:67). Separately, the group list has no `invite_status` filter, so groups
  with a pending invite contribute events.
- Reproduction: not possible without the database.
- Evidence: the two queries, quoted in the handler.
- Status: PLAUSIBLE. The visible effect depends on the `events` SELECT policy.
- Suggested fix: use `profiles_events!inner(...)` and fetch co-participants in a second embed.

### [MEDIUM] M10 — Recurring `.ics` events are imported as a single occurrence
- Area: Calendar correctness / iCal import
- Location: routes/ical.js:216-229
- What happens: the insert payload has no `recurrence_rule`, although the parser exposes the rule.
- Reproduction: VEVENT with `RRULE:FREQ=WEEKLY;COUNT=5` parses with `hasRRULE=true`; the payload
  omits it.
- Evidence: script output (section 5, V5) and the quoted insert.
- Status: PLAUSIBLE.
- Suggested fix: store `event.rrule.toString()` without the `RRULE:` prefix.

### [MEDIUM] M12 — Quick-add dates resolve a day early just after midnight
- Area: Calendar correctness / natural-language parser
- Location: client/src/lib/nlParser.ts:14-16
- What happens: `toYMD` uses `toISOString()` on dates built with local setters. East of UTC,
  between midnight and the UTC offset, "tomorrow" or a weekday resolves to the day before.
- Reproduction: Europe/Brussels, local time 2026-10-14 00:30, "tomorrow".
  Expected 2026-10-15. Actual 2026-10-14.
- Evidence: script output (section 5, V17). `CalendarPage.tsx:109` has a comment warning
  against this exact pattern.
- Status: CONFIRMED (pattern replayed; the parser itself was not driven in a browser).
- Suggested fix: reuse `localDateKey` from CalendarPage.

### [LOW] L3 — Drag-select opens the form with "All day" unchecked
- Area: Calendar correctness / uncommitted change
- Location: client/src/components/EventFormModal.tsx:76
- What happens: `allDay` is `false` for every create, although the diff now reads
  `selectInfo.allDay` to compute the end date. The time inputs are shown for a day-range
  selection. Saving without a time still produces an all-day event, because the server treats a
  missing start time as all-day.
- Reproduction: drag-select 20 → 22 Oct. Expected All day checked. Actual unchecked (D5).
- Evidence: section 5, V14; screenshot `02-desktop-drag-select-form.png`.
- Status: CONFIRMED. Same behaviour on HEAD.
- Suggested fix: initialise `allDay` from `selectInfo.allDay`.

Pending diff, parts that hold up: `allDayDates.ts` round-trips correctly (11 tests pass);
desktop render, drag, resize and drag-select save the expected spans across 30 Oct → 2 Nov,
30 Dec → 2 Jan and 28 Feb → 1 Mar 2028 (16 scenario checks pass); the `rawEndDateStr > startDateStr`
guard in routes/ical.js:193-195 handles a missing or equal DTEND; exporting `addDaysStr` from
utils/recurrence.js changes no behaviour.

### 3.3 Other correctness

### [HIGH] H3 — Event reminders are suppressed or repeated by the dedupe check
- Area: Notifications / scheduler
- Location: utils/scheduler.js:83-89 (read), :103-107 (write), :182-185 (countdown write)
- What happens: the reminder sweep checks `event_reminders_sent` by `event_id` and
  `occurrence_date` only, with `.maybeSingle()`. Countdown rows (`countdown_7d`, `countdown_1d`)
  share the same key apart from `reminder_type`. With one countdown row the event's own reminder
  is treated as sent and never fires. With two or more rows `.maybeSingle()` returns an error and
  null data, so the reminder fires on every 5-minute sweep inside the reminder window; its own
  row does not stop it. An event created more than a week ahead with a 60-minute reminder would
  be announced about 12 times.
- Reproduction: run the handler's exact query against a local server returning N rows.
  0 rows → fires. 1 row → **skips**. 2 rows → `PGRST116`, data null → **fires**.
  3 rows → `PGRST116` → **fires again**.
- Evidence: script output (section 5, V9). Query sent:
  `event_reminders_sent?select=event_id&event_id=eq.7&occurrence_date=eq.2027-03-10`.
- Status: CONFIRMED at query level. The full cron was not run (no database).
- Suggested fix: add `.eq('reminder_type', 'reminder')` to the read, as the countdown sweep does.

### [MEDIUM] M6 — Dead push subscriptions are never removed
- Area: Notifications
- Location: utils/notifications.js:100
- What happens: same `.catch` on a builder as H1. The builder is lazy, so the DELETE is never
  sent; the TypeError is absorbed by `Promise.allSettled`. Expired subscriptions are retried on
  every notification.
- Reproduction: run the same expression against a local server. DELETE requests received: 0.
  Control without `.catch`, awaited: 1.
- Evidence: script output (section 5, V13).
- Status: CONFIRMED.
- Suggested fix: `await` the delete and check `{ error }`.

### [MEDIUM] M11 — Pact, challenge and XP counters can lose increments
- Area: Pacts / habits
- Location: routes/habits.js:438-447, :350-355, :396-421; routes/pacts.js:18-31; utils/scheduler.js:265-271
- What happens: counters are read, incremented in JavaScript and written back. Two members
  logging at the same time write the same value. Pact resolution (00:05 cron, the
  `GET …/pacts/active` handler and habit-log success) updates status without a
  `status = 'active'` condition, so they can overwrite each other. The cron itself is
  idempotent on re-run because it selects only active pacts.
- Reproduction: not run (needs the database).
- Evidence: `const newCount = pact.completions_count + 1; … update({ completions_count: newCount })`.
- Status: PLAUSIBLE.
- Suggested fix: increment in SQL and make status updates conditional on the current status.

Checked and not found faulty: the refresh single-flight map (utils/utils.js:78-109) shares one
exchange per refresh token and keeps the result for 30 s, matching CLAUDE.md. The `loadSeq`
guard (CalendarPage.tsx:522-577) discards stale responses and clears the spinner only for the
latest call. Vote endpoints validate availability against a whitelist and upsert on
`(event_id, option_id, user_id)`; confirm is creator-only (events.js:1354). None of these was
exercised under real concurrency.

### 3.4 Data and schema

No finding in this area is verified against the database. From code and the two tracked
migrations only:

- RLS: `group_invite_tokens`, `notifications`, `event_reminders_sent`, `profiles_task` have
  policies in `db/migrations/`. The other 23 tables the code references have no definition on
  disk. `ROADMAP.md:124-127` records broad read policies on `profiles`, `profiles_events`,
  `profiles_groups`, `event_overrides` as open.
- Unique keys inferred from `onConflict` targets: `event_date_votes(event_id, option_id, user_id)`
  (events.js:1199) and `(event_id, option_id, guest_token)` (:1091);
  `event_reminders_sent(event_id, occurrence_date, reminder_type)` (scheduler.js:106);
  `profiles_events(user_id, event_id)`; `event_overrides(event_id, occurrence_date)`.
  `habit_completions` uses select-then-insert (habits.js:273-289), so no key is implied.
- CHECK, NOT NULL, foreign keys, indexes, row counts: NOT DETERMINED.
- Query counts (code read): `GET /renderEvents` issues 5 to 11 queries regardless of event
  count, so it is not N+1, but both event queries are `select *` with no date bound.
  `GET /groups` is 4 + up to 3 per group (groups.js:56-71). `GET /todo` is 2 + 1 per task list
  (todo.js:57-62). `GET /habits` is 1 + 1 per habit (habits.js:111-118). The reminder sweep
  loads every event with a reminder, with no date bound, every 5 minutes (scheduler.js:36-38).

### 3.5 UI

### [MEDIUM] M5 — A failed event load shows an empty calendar
- Area: UI / error state
- Location: client/src/pages/CalendarPage.tsx:568
- What happens: the catch is empty. A 500 or a network failure on `/renderEvents` renders the
  normal grid with no events and no message, indistinguishable from an empty calendar.
- Reproduction: mock `/api/renderEvents` to return 500, then to abort. Expected an error or
  retry prompt. Actual: empty October grid, no state text, at both widths.
- Evidence: scenarios S-error-500 and S-network-fail (V14); screenshots
  `12-state-error-500-desktop.png`, `12-state-network-fail-mobile.png`.
- Status: CONFIRMED.
- Suggested fix: keep an `error` state and render a retry row.

Also observed: loading shows "Loading events…" on mobile; no horizontal overflow at 390 px in
either mobile layout; the empty state renders the grid cleanly. Not checked: group filter with
real groups, locked and tentative event styling, recurring instances in the UI, light theme.

### 3.6 Code quality

### [LOW] L1 — `tests/authRequire.test.js` is stale (the 6 failures)
- Area: Tests
- Location: tests/authRequire.test.js:7-15, :39-45
- What happens: see section 4. The middleware is not at fault.
- Status: CONFIRMED.
- Suggested fix: add `status`/`json` to the mock `res`, export `createUserClient` from the mock,
  and assert 401 JSON instead of a redirect.

### [LOW] L2 — Tests and migrations are git-ignored
- Area: Repository
- Location: .gitignore:8-9
- What happens: `tests/*` hides `allDayDates.test.js` and `dailySummary.test.js`, so the test
  for the pending fix cannot be committed with it. `db/migrations/*` hides new migrations; the
  schema is not reproducible from the repository.
- Evidence: `git check-ignore -v tests/allDayDates.test.js` → `.gitignore:9:tests/*`.
- Status: CONFIRMED.
- Suggested fix: remove both lines and commit the files.

### [LOW] L4 — Seven files over 1,000 lines; duplicated logic
- Area: Maintainability
- Location: GroupDetailPage.tsx 2,156; routes/events.js 1,650; ProfilePage.tsx 1,398;
  CalendarPage.tsx 1,267; routes/groups.js 1,110; EventFormModal.tsx 1,097
- What happens: `GroupDetailPage` is one component with 63 `useState`; `GET /renderEvents` is a
  310-line handler. Duplicates: four add-days helpers (utils/recurrence.js:9, utils/google.js:195,
  utils/ical.js:32, client/src/lib/allDayDates.ts:9); identical PATCH bodies in
  `handleEventDrop` and `handleEventResize` (CalendarPage.tsx:637-671); `verifyMembership`
  copied in pacts.js:7 and challenges.js:7; four identical `Modal` components.
- Status: line counts CONFIRMED; the rest is from the code-quality sub-agent, spot-checked.
- Suggested fix: see section 6 for the calendar; elsewhere extract per-feature components.

### [LOW] L5 — Errors are swallowed by default
- Area: Maintainability
- Location: 69 empty or comment-only catches (sub-agent count), e.g. CalendarPage.tsx:568,
  EventModal.tsx:153 (a failed RSVP looks successful), GroupDetailPage.tsx (20)
- Status: PLAUSIBLE (count not re-derived by me; M5 and M6 are confirmed instances).
- Suggested fix: surface mutation failures to the user.

### [LOW] L6 — Dead legacy frontend and unused dependencies
- Area: Maintainability
- Location: `views/`, `public/` (49 tracked files); root package.json
- What happens: the EJS app is still tracked although app.js serves only `client/dist`.
- Evidence: `git ls-files views public | wc -l` → 49. Unused-dependency list is from the
  sub-agent and was not rechecked.
- Status: CONFIRMED for the file count.
- Suggested fix: delete after confirming nothing deploys from them.

### [LOW] L7 — CLAUDE.md is out of date
- Area: Documentation
- What happens: it omits routes/google.js, routes/billing.js, utils/google.js, utils/tier.js,
  eleven tables, three scheduler jobs and several components; says `mockData.ts` is used by
  EventModal (it is used by Avatar.tsx:1, :23); and its documented typecheck command does not
  work from the root (L10).
- Status: CONFIRMED for the items listed.
- Suggested fix: regenerate the file and table lists.

### [LOW] L10 — The documented typecheck command runs the wrong package
- Area: Tooling
- Location: audit brief / developer workflow
- What happens: `npx tsc --noEmit -p client/tsconfig.app.json` from the root downloads and runs
  npm's unrelated `tsc` placeholder, because TypeScript is installed only under `client/`.
- Evidence: output "This is not the tsc command you are looking for", exit 1 (V3).
- Status: CONFIRMED.
- Suggested fix: run it from `client/`, or add a root script.

### [LOW] L11 — `CalEvent` does not match the API
- Area: Types
- Location: client/src/types/index.ts:80-116 vs routes/events.js:783-823
- What happens: `id` is typed string but is a number for normal events; `allDay` is declared
  but never sent; several fields are `null` where the type says `undefined`. The missing
  `allDay` is why the diff infers it from the shape of `start` in two places.
- Status: PLAUSIBLE (sub-agent finding; the `allDay` point is confirmed by the diff).
- Suggested fix: return `allDay` from `renderEvents` and normalise once on load.

### [LOW] L13 — Placeholders on the public privacy page; mock data in `Avatar`
- Area: Maintainability
- Location: client/src/pages/PrivacyPage.tsx:6, :8; client/src/components/ui/Avatar.tsx:1, :23
- What happens: the controller name is `'[Your full name], [City], Belgium'` with a TODO.
  `Avatar` reads `MOCK_MEMBERS[id]` for every avatar.
- Status: CONFIRMED.
- Suggested fix: fill in the page; drop the mock lookup.

### [LOW] L14 — `!important` override contradicts the documented FullCalendar rule
- Area: Conventions
- Location: client/src/pages/CalendarPage.tsx:792-798
- What happens: `.fc-event-tentative { background: transparent !important; … }` is injected
  inline and overrides the `--fc-event-bg-color` mechanism CLAUDE.md prescribes.
- Status: CONFIRMED (code read); the visual effect was not checked.
- Suggested fix: move to `index.css` and use the custom properties.

## 4. Status of the known open issues

| Issue | Status | Evidence |
|---|---|---|
| 6 failing tests in `tests/authRequire.test.js` | CONFIRMED, root cause found | The test is stale. Its mock `res` has `cookie`, `clearCookie`, `redirect` only and asserts `redirect('/login')`; the middleware returns `res.status(401).json(...)` (utils/utils.js:10, :27, :47) → `TypeError: res.status is not a function` in 5 tests. The `vi.mock` factory returns only `default`, while utils/utils.js:1 imports `createUserClient` → 1 test fails with `No "createUserClient" export is defined on the mock`. Test last changed 2026-03-19 (`4037720`); the middleware moved to JSON 401 on 2026-06-03 (`f74ef73`). |
| Existing ICS all-day rows stored one day too long | NOT DETERMINED | No database access. Two facts change the expected scope: H1 means each import attempt since 2026-06-10 stored at most one event, and M1 means drag, resize and drag-select on HEAD wrote exclusive ends too, so the affected set is wider than ICS. |
| Timezone bug from `toISOString()` in routes/ical.js | CONFIRMED | H6: dates shift one day earlier under Europe/Brussels and Pacific/Auckland; unaffected under UTC and America/Los_Angeles. Timed events have a related bug (H7). |
| Google import/export end-date consistency | RULED OUT (code read) | Export adds a day (utils/google.js:215), import subtracts one (:476), both through the same UTC `addDays` (:195-199). Not exercised against Google. One asymmetry: the import has no `end < start` clamp, unlike the ICS path. |

Queries to scope the stored-data issue once access exists (SELECT only; `.ics` rows are
`external_uid IS NOT NULL AND external_source IS NULL`, inferred from code):

```sql
select coalesce(external_source,'(native or ics)') src,
       count(*) filter (where end_date > start_date) end_gt_start,
       count(*) filter (where end_date = start_date) end_eq_start,
       count(*) filter (where end_date < start_date or end_date is null) odd
from events where start_time is null group by 1;

select count(*) from events e
where e.external_uid is not null and e.external_source is null
  and not exists (select 1 from profiles_events pe where pe.event_id = e.event_id);  -- H1 orphans
```

## 5. Verification log

| # | Command | Result |
|---|---|---|
| V1 | `git status --short`, `git diff` | 4 modified files + untracked `client/src/lib/allDayDates.ts`. Unchanged at the end, plus `docs/`. |
| V2 | `npm test` (root) | **FAILED.** 1 file failed, 2 passed; 6 tests failed, 26 passed (32). All failures in tests/authRequire.test.js. |
| V3 | `npx tsc --noEmit -p client/tsconfig.app.json` (root, as in the brief) | **Did not run the compiler.** Exit 1, npm's placeholder `tsc` package. |
| V4 | `cd client && npx --no-install tsc --noEmit -p tsconfig.app.json` | Exit 0, no output. |
| V5 | Inline node: ICS import date logic under TZ=UTC, Europe/Brussels, America/Los_Angeles, Pacific/Auckland | Ran. Output quoted in H6, H7, M10. |
| V6 | Inline node: `.catch` on a Supabase builder | `TypeError b.catch is not a function` (supabase-js 2.56.0, postgrest-js 1.21.3). |
| V7 | Inline node: `capRuleUntil` / `expandRecurringEvent` from utils/recurrence.js | Ran. Output quoted in H5, M2, M3. |
| V8 | `ls -a` for env files; dotenv check of 4 Supabase variable names | No `.env`; all unset. |
| V9 | Inline node: reminder dedupe query and `checkUser` filter against a local HTTP server | Ran. Output quoted in H3, H4. |
| V10 | `npm install playwright-core` in the session scratch directory | Installed 1.64.0 (outside the repo). |
| V11 | Vite dev server for `client/` on 127.0.0.1:5174 (5173 was held by another project) | Started; stopped at the end. `node app.js` was **not** started (no credentials). |
| V12 | grep sweeps: routes without `authRequire`, limiters, `supabaseAdmin` counts, user-id sources | Ran. Results in 3.1. |
| V13 | `verify-import.mjs`: real `routes/ical.js` mounted in-process, Supabase replaced by a local stand-in, 3-event upload; plus the notifications.js:100 pattern | Import: HTTP 500, 1 event insert, 0 participant inserts. Cleanup: 0 DELETE requests, control 1. |
| V14 | `scenarios.mjs`: Chrome via Playwright, mocked `/api`, 1440×900 and 390×844 | 16 pass, 7 fail: D5, D8a, D8b, D9, M-compact-a, M-compact-b, M-compact-c. D8b is a harness miss (the Save click sent no PUT); the same check passed its capture on mobile (M-compact-c). |
| V15 | `cd client && npm run build` | Exit 0. Warning: a chunk over 500 kB. |
| V16 | `baseline.mjs` against HEAD client (`git archive HEAD client` into scratch, port 5175) and working tree | HEAD: render 20,21; agenda edit 13..13; mobile edit 13..13. Working tree: render 20,21,22; agenda edit 13..14; mobile edit 13..14. Drag PATCH identical. |
| V17 | Inline node: local-date `toISOString()` under TZ=Europe/Brussels | "tomorrow" at 00:30 → 2026-10-14, expected 2026-10-15. |

Verify-this verdicts for the top-10 claims that rested on one run or on reading:
- H2 "the +1 day in agenda/compact edit is introduced by the diff": **VERIFIED** (V16, same script, same data, baseline 13..13, treatment 13..14).
- H1 "the import rejects after the first inserted event": **VERIFIED** (V13).
- M6 "the push-subscription DELETE is never sent": **VERIFIED** (V13, with control).

Screenshots are in the session scratch directory, not in the repository (the brief allows only
this file to be written): `/private/tmp/claude-502/-Users-guillaumeleberre-Develop-GuillaumesLab-WebDevelopment-CalendarTrackingApp/8ee535ec-7058-4256-99db-c4f3772c503e/scratchpad/shots/`.
That directory is temporary. The harness scripts are next to it in `harness/`.

Sub-agents and skills: Explore (system map), supabase-db (blocked on credentials, code analysis
only), thermo-nuclear-code-quality-review, code-review at high (no `--fix`), control-ui,
codebase-design, verify-this. The security-review skill's identification agent stopped on an API
error after returning one finding (H4); the rest of 3.1 is my own reading. diagnosing-bugs was
not invoked; reproductions were done directly.

## 6. Calendar architecture verdict

**Targeted refactor. A rewrite is not supported by the evidence.**

- FullCalendar touches about 190 of CalendarPage's 1,267 lines (62 lines reference a
  FullCalendar identifier). The remaining ~1,075 lines are app logic that a rewrite would have
  to reproduce.
- The blast radius is small. `CalendarPage` is mounted by 2 routes. `EventModal` has 1 call
  site, `EventFormModal` 4 (CalendarPage ×2, GroupDetailPage, TodoPage), `MobileMonthGrid` 1,
  `allDayDates` 5 calls in 2 files.
- A second adapter already exists at the month-view seam: `MobileMonthGrid` renders the same
  events without FullCalendar. Two adapters make the seam real, and H2 is what happens when the
  seam's interface is not stated: one adapter's convention (exclusive end) was applied to data
  shared with the other.
- Pure modules already sit behind small interfaces and are testable as they are:
  `allDayDates.ts`, `lib/recurrence.ts`, `nlParser.ts`, `utils/recurrence.js`, `utils/ical.js`.
- Every calendar defect found in this audit is local: one `map` in the wrong place (H2), one
  constant (H5), one missing filter (H3), one misuse of a client method (H1), two date
  formatters (H6, H7). None is caused by the choice of library or by the overall structure.

The module to deepen is the event read model. Today its interface leaks: callers must know that
`end` is inclusive for all-day events, that `allDay` is absent, and that `id` may be a number.
Three steps give it a small interface with locality for the date convention:

1. Normalise once in `loadEvents` (string id, boolean `allDay`, inclusive end) and keep that as
   the only event array in state. About 10 lines; fixes H2 and L11.
2. Wrap FullCalendar in one module whose interface speaks the app's convention
   (`events`, `onCreate(range)`, `onOpen(id)`, `onMove(id, range)`), holding the
   inclusive/exclusive conversion and the duplicated drop/resize body. About 200 lines move.
3. Type `EventFormModal`'s `selectInfo` as `{ startDate, endDate, allDay }` instead of
   FullCalendar's `DateSelectArg`, removing the two `as never` casts (CalendarPage.tsx:772-773).

The server contract is the one place where the library is baked in: `renderEvents` returns
FullCalendar's event shape. That is a reason to add `allDay` to the response, not to rewrite.

## 7. What was not checked and why

- **The live database: nothing.** No `.env`, no Supabase URL or keys, no CLI, no connection
  string on this machine. Not determined: RLS enabled or not per table, policy definitions, the
  anonymous-read probe, indexes, CHECK / NOT NULL / foreign keys, row counts, and the count of
  all-day rows stored with an exclusive end.
- **The running backend.** `node app.js` cannot boot without credentials. No endpoint was called
  over HTTP except `POST /calendar/import`, and that one against a stand-in.
- **Browser flows against real data.** The browser run used a mocked `/api`. Not checked: group
  filter with real groups, locked and tentative events, recurring instances and the scope
  prompt, RSVP, voting UI, timed-event drag in a time grid, touch gestures, light theme.
- **Every finding marked UNVERIFIED or PLAUSIBLE in 3.1** needs the RLS policies to settle.
- **Security depth.** The dedicated security agent failed. Not reviewed in depth: routes/auth.js
  (registration, profile update, account deletion, GDPR export), routes/billing.js beyond the
  signature check, routes/google.js and utils/google.js beyond end-date mapping and `state`,
  routes/email.js HTML escaping, the service worker.
- **Concurrency.** The refresh single-flight, the `loadSeq` guard and the counter races were
  read, not exercised.
- **Schedulers.** No cron was run. Daily summary versus reminder overlap was not analysed beyond
  H3. Crons have no `timezone` option; the effect was not measured.
- **Sub-agent claims not rechecked by me** are labelled as such: the unused-dependency list, the
  count of 69 silent catches, and most of L11.
