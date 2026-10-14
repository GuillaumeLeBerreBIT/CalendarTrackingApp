# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed finding from the 2026-10-13 audit, and close the audit's gaps (database, security depth, real-data UI) before touching anything that depends on them.

**Architecture:** Each fix moves the broken logic into a small pure module with a test (`utils/icsImport.js`, `utils/reminderDedupe.js`, `utils/groupAccess.js`, `client/src/lib/calendarEvents.ts`), then makes the route or component call it. The calendar keeps ONE event array in the app's convention (all-day `end` is INCLUSIVE); the conversion to FullCalendar's exclusive end happens only on the array handed to `<FullCalendar>`.

**Tech Stack:** Node ESM + Express 5, Supabase JS 2.56, node-ical 0.26, rrule; React 19 + Vite 8 + FullCalendar; Vitest 4 (root, `npm test`).

**Spec:** `docs/audits/2026-10-13-full-audit.md`. Finding IDs (H1, M4, L2 …) refer to that report.

## Global Constraints

- ESM only on the backend: `import`/`export`, never `require()`.
- Import Supabase clients from `db/supabase.js` only; never create a server client without `persistSession: false, autoRefreshToken: false`.
- Every JSON endpoint returns `{ success: true|false, ... }`.
- Write session cookies only through `setSessionCookies()`.
- Frontend colours, surfaces and radii use CSS variables (`var(--surface-2)` etc.); Tailwind for layout only; icons via `<Icon>`.
- Stored all-day `end_date` is INCLUSIVE (10 → 15 Oct means both days). Convert only at the FullCalendar, Google and iCalendar edges.
- Root tests: `npm test`. Client typecheck: `cd client && npx --no-install tsc --noEmit -p tsconfig.app.json` (do NOT run `npx tsc` from the root: it runs an unrelated npm package). Client build: `cd client && npm run build`.
- Do not apply migrations or run writing SQL against production without the owner's explicit go-ahead for that specific statement.

## Review Focus

1. An all-day event ending on 31 Dec or 29 Feb, opened from the agenda or compact grid and saved unchanged: must keep its end. Test in Task 7 (`eventDays`, round trip).
2. "This and following" on the FIRST occurrence of an all-day series: the old master must keep no occurrences, the new one all of them. Test in Task 5.
3. An `.ics` VEVENT with `VALUE=DATE` and no `DTEND`, or `DTEND` equal to `DTSTART`: a one-day event, never an end before the start. Test in Task 2.
4. A user with no stored timezone importing zoned events: falls back to UTC instead of failing. Test in Task 2.
5. The reminder dedupe query itself erroring: the sweep must skip that occurrence (no notification), not re-send. Test in Task 4.

## Release ordering (read before shipping)

The uncommitted all-day diff (already in the working tree) changes how stored all-day ends are read. Rows written by HEAD's drag/resize/drag-select and `.ics` import hold an EXCLUSIVE end and will render one day too long once Task 7 ships. **Task 7 must not be deployed before Task 14 (data decision) is done.** Tasks 1–6 and 8–11 can ship independently.

## Decisions needed from the owner

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | How to treat existing all-day rows with an exclusive end (Task 14) | Shift `.ics`-imported rows by −1 day; leave other rows alone and accept a small number of one-day-long events, because HEAD's drag-written rows cannot be told apart from correct form-written ones. |
| D2 | Un-ignore `db/migrations/` (Task 1) | Yes: the schema is otherwise not reproducible from the repo. |
| D3 | Real name/city/mailbox for the privacy page (Task 17) | Required for a public legal page; only you can supply them. |

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `utils/wallClock.js` | Create | `toWallClock(instant, tz)` moved out of `utils/google.js` so import code can share it |
| `utils/icsImport.js` | Create | Pure VEVENT → `events` row mapping (dates, times, rrule) |
| `utils/reminderDedupe.js` | Create | `alreadySent()` check for `event_reminders_sent` |
| `utils/postgrestFilter.js` | Create | `sanitizeOrTerm()` for values placed in `.or()` strings |
| `utils/groupAccess.js` | Create | `isGroupMember()`, `canAccessEvent()` |
| `client/src/lib/calendarEvents.ts` | Create | Event normalisation, FullCalendar conversion, day coverage, agenda bucketing, fetch window |
| `routes/ical.js` | Modify | Import handler uses `icsEventToRow`; no builder `.catch` |
| `utils/google.js` | Modify | Import `toWallClock` from `utils/wallClock.js` |
| `utils/notifications.js` | Modify | Await the dead-subscription delete |
| `utils/scheduler.js` | Modify | Use `alreadySent`; conditional pact status update |
| `utils/recurrence.js` | Modify | Fix `capRuleUntil`; add `followingRule`, `expansionWindow` |
| `routes/events.js` | Modify | Split uses `followingRule`; window from query; guest-id hashing; access guards |
| `routes/groups.js`, `routes/todo.js`, `routes/pacts.js` | Modify | Sanitised `.or()`, access guards, conditional status update |
| `client/src/pages/CalendarPage.tsx` | Modify | One inclusive array in state; FullCalendar-only conversion; error state; month-scoped fetch |
| `client/src/components/MobileMonthGrid.tsx` | Modify | Index events under every covered day |
| `client/src/components/EventFormModal.tsx` | Modify | All-day default for multi-day selections |
| `client/src/lib/nlParser.ts` | Modify | Local-date formatting |
| `tests/*.test.js` | Create/Modify | One test file per new module; fix the stale auth test |
| `.gitignore`, `package.json` | Modify | Track tests and migrations; `typecheck` script |

---

## Phase 0 — Close the audit gaps (no code changes)

### Task 0: Database inventory, security pass, real-data UI pass

These produce evidence, not code. Tasks 14–16 are blocked until 0.1 is done.

**Files:**
- Create: `docs/audits/2026-10-14-db-inventory.md`
- Create: `docs/audits/2026-10-14-security-followup.md`

- [ ] **Step 0.1: Get read-only database access.** In the Supabase dashboard → SQL editor (or `psql` with the project's connection string), run each query below and paste the results into `docs/audits/2026-10-14-db-inventory.md`. All are SELECT-only.

```sql
-- RLS on/off per table
select c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- Every policy
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- Column-level grants on profiles (does `authenticated` see ical_token?)
select grantee, column_name, privilege_type from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') order by 1,2;

-- Indexes
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1,2;

-- Constraints (unique, check, FK with ON DELETE)
select conrelid::regclass as table, conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint where connamespace = 'public'::regnamespace order by 1,2;

-- Column types needed by Task 16
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'pacts' order by ordinal_position;

-- Row counts
select relname, n_live_tup from pg_stat_user_tables order by 1;
```

- [ ] **Step 0.2: Scope the stored-data issue (feeds Task 14).**

```sql
-- All-day rows by source and shape
select case when external_source = 'google' then 'google'
            when external_uid is not null then 'ics'
            else 'native' end as src,
       count(*) filter (where end_date > start_date)  as end_gt_start,
       count(*) filter (where end_date = start_date)  as end_eq_start,
       count(*) filter (where end_date < start_date or end_date is null) as odd
from events where start_time is null group by 1;

-- Orphans left by the broken import (H1)
select count(*) from events e
where e.external_uid is not null and e.external_source is null
  and not exists (select 1 from profiles_events pe where pe.event_id = e.event_id);
```

- [ ] **Step 0.3: Answer the RLS questions behind M8/M9/H4** in the inventory file, one line each, from the Step 0.1 output:
  - Can an `authenticated` user SELECT another user's `profiles.ical_token`? (H4 severity: if yes, H4 is Critical.)
  - Does the `events` SELECT policy let a user read personal events (`groups_id is null`) they are not a participant of? (M9)
  - Does `profiles_events` INSERT allow a user to add themselves to any event? (M8, `/rsvp`)
  - Do `task_list` / `task` INSERT policies require group membership? (M8)
  - Do `event_comments` / `event_reactions` SELECT/INSERT policies require access to the event? (M8)

- [ ] **Step 0.4: Security follow-up pass.** Read in full and record findings in `docs/audits/2026-10-14-security-followup.md`, using the audit's finding format: `routes/auth.js` (register, profile update, account delete, GDPR export), `routes/billing.js`, `routes/google.js` + `utils/google.js` (token encryption, webhook channel token check), `routes/email.js` (HTML escaping of user-supplied titles), `client/src/sw.ts`, and `routes/habits.js` log/unlog (is `habit.user_id` checked against the caller?). Any new High finding becomes a new task appended to Phase 2.

- [ ] **Step 0.5: Real-data UI pass on a staging project or a test account.** With `node app.js` + `cd client && npm run dev`, check and screenshot: group filter toggling, a tentative event's voting UI, a locked (pact) event, a recurring series with the "this / following / all" prompt, RSVP from the event modal. Record anything broken in the security follow-up file under a "UI" heading.

- [ ] **Step 0.6: Commit the evidence.**

```bash
git switch -c fix/audit-remediation
git add docs/audits/2026-10-14-db-inventory.md docs/audits/2026-10-14-security-followup.md docs/audits/2026-10-13-full-audit.md docs/superpowers/plans/2026-10-14-audit-remediation.md
git commit -m "docs: audit report, remediation plan, db inventory"
```

---

## Phase 1 — Make the test suite trustworthy

### Task 1: Track tests, fix the stale auth test, add a typecheck script (L1, L2, L10)

**Files:**
- Modify: `.gitignore:8-9`
- Modify: `tests/authRequire.test.js`
- Modify: `package.json` (scripts)

**Interfaces:** Produces: `npm run typecheck`.

- [ ] **Step 1: Confirm the baseline failure.**

Run: `npm test`
Expected: `6 failed | 26 passed (32)`, all in `tests/authRequire.test.js`.

- [ ] **Step 2: Un-ignore tests (and migrations if D2 = yes).** Delete these two lines from `.gitignore`:

```
db/migrations/*
tests/*
```

- [ ] **Step 3: Fix the mock module.** In `tests/authRequire.test.js`, replace the `vi.mock` factory:

```js
vi.mock("../db/supabase.js", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      refreshSession: vi.fn(),
    },
  };
  return {
    default: mockSupabase,
    // authRequire attaches a per-request client; tests only need a marker object.
    createUserClient: vi.fn(() => ({ __userClient: true })),
  };
});
```

- [ ] **Step 4: Fix the fake response.** Replace `makeRes()`:

```js
/** Builds a minimal fake `res` object with vi.fn() spies. status() and json() chain like Express. */
function makeRes() {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}
```

- [ ] **Step 5: Update the assertions.** The middleware answers unauthenticated requests with `401 { success: false, error: 'Unauthorized' }` (utils/utils.js:10, :27, :47), not a redirect. In the file:
  - replace every `expect(res.redirect).toHaveBeenCalledWith("/login");` with
    ```js
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
    ```
  - replace every `expect(res.redirect).not.toHaveBeenCalled();` with `expect(res.status).not.toHaveBeenCalled();`
  - in test titles, replace `redirects to /login` with `responds 401`.

- [ ] **Step 6: Run.**

Run: `npm test`
Expected: `32 passed`. If a success-path test still fails, read its assertion: it may count `res.cookie` calls; `setSessionCookies` sets exactly 4.

- [ ] **Step 7: Add the typecheck script.** In root `package.json` `"scripts"`:

```json
"typecheck": "cd client && npx --no-install tsc --noEmit -p tsconfig.app.json"
```

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 8: Commit.**

```bash
git add .gitignore package.json tests/authRequire.test.js tests/allDayDates.test.js tests/dailySummary.test.js
git commit -m "test: track tests dir, fix stale authRequire test, add typecheck script"
```

---

## Phase 2 — Fix confirmed bugs

### Task 2: Rewrite the `.ics` import mapping (H1, H6, H7, M10, L8)

**Files:**
- Create: `utils/wallClock.js`
- Create: `utils/icsImport.js`
- Modify: `utils/google.js` (remove local `toWallClock`, import it)
- Modify: `routes/ical.js:134-248` (import handler)
- Test: `tests/icsImport.test.js`, `tests/icsImportRoute.test.js`

**Interfaces:**
- Produces: `toWallClock(instant: Date, tz: string) → { date: 'YYYY-MM-DD', time: 'HH:MM:SS' }` (utils/wallClock.js)
- Produces: `icsEventToRow(vevent, userTz) → { all_day, start_date, end_date, start_time, end_time, recurrence_rule } | null`; `rruleFromIcs(vevent) → string | null`; `MAX_IMPORT_EVENTS = 500` (utils/icsImport.js)

- [ ] **Step 1: Write the failing mapping tests.** Create `tests/icsImport.test.js`:

```js
import { describe, it, expect } from "vitest";
import ical from "node-ical";
import { icsEventToRow, rruleFromIcs } from "../utils/icsImport.js";

const vevent = (...props) =>
  Object.values(
    ical.parseICS(["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:x", "SUMMARY:t", ...props, "END:VEVENT", "END:VCALENDAR"].join("\r\n"))
  ).find((e) => e.type === "VEVENT");

describe("all-day events (DTEND is exclusive, stored end is inclusive)", () => {
  it("single day", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270311"), "UTC"))
      .toMatchObject({ all_day: true, start_date: "2027-03-10", end_date: "2027-03-10", start_time: null, end_time: null });
  });
  it("three days", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270313"), "UTC"))
      .toMatchObject({ start_date: "2027-03-10", end_date: "2027-03-12" });
  });
  it("across a year boundary", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20271231", "DTEND;VALUE=DATE:20280102"), "UTC"))
      .toMatchObject({ start_date: "2027-12-31", end_date: "2028-01-01" });
  });
  it("no DTEND means one day", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20280229"), "UTC"))
      .toMatchObject({ start_date: "2028-02-29", end_date: "2028-02-29" });
  });
  it("DTEND equal to DTSTART never yields an end before the start", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310", "DTEND;VALUE=DATE:20270310"), "UTC"))
      .toMatchObject({ start_date: "2027-03-10", end_date: "2027-03-10" });
  });
});

describe("timed events are stored as wall-clock time in the user's timezone", () => {
  const brussels = ["DTSTART;TZID=Europe/Brussels:20270310T140000", "DTEND;TZID=Europe/Brussels:20270310T150000"];
  it("zoned event, user in the same zone", () => {
    expect(icsEventToRow(vevent(...brussels), "Europe/Brussels"))
      .toMatchObject({ all_day: false, start_date: "2027-03-10", start_time: "14:00", end_time: "15:00" });
  });
  it("zoned event, user in New York (EST on 2027-03-10)", () => {
    expect(icsEventToRow(vevent(...brussels), "America/New_York"))
      .toMatchObject({ start_date: "2027-03-10", start_time: "08:00", end_time: "09:00" });
  });
  it("UTC event shown in Brussels", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000Z", "DTEND:20270310T150000Z"), "Europe/Brussels"))
      .toMatchObject({ start_time: "15:00", end_time: "16:00" });
  });
  it("user without a stored timezone falls back to UTC", () => {
    expect(icsEventToRow(vevent(...brussels), "UTC")).toMatchObject({ start_time: "13:00" });
  });
  it("floating time keeps its written clock time whatever the server TZ", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000", "DTEND:20270310T150000"), "America/New_York"))
      .toMatchObject({ start_date: "2027-03-10", start_time: "14:00", end_time: "15:00" });
  });
  it("no DTEND leaves end_time null", () => {
    expect(icsEventToRow(vevent("DTSTART:20270310T140000Z"), "UTC"))
      .toMatchObject({ start_time: "14:00", end_date: "2027-03-10", end_time: null });
  });
});

describe("recurrence and rejects", () => {
  it("keeps the RRULE without its prefix", () => {
    const e = vevent("DTSTART;VALUE=DATE:20270310", "RRULE:FREQ=WEEKLY;COUNT=5");
    expect(rruleFromIcs(e)).toBe("FREQ=WEEKLY;COUNT=5");
    expect(icsEventToRow(e, "UTC").recurrence_rule).toBe("FREQ=WEEKLY;COUNT=5");
  });
  it("non-recurring event has a null rule", () => {
    expect(icsEventToRow(vevent("DTSTART;VALUE=DATE:20270310"), "UTC").recurrence_rule).toBeNull();
  });
  it("missing SUMMARY is rejected", () => {
    const e = vevent("DTSTART;VALUE=DATE:20270310");
    delete e.summary;
    expect(icsEventToRow(e, "UTC")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail.**

Run: `npx vitest run tests/icsImport.test.js`
Expected: FAIL, `Failed to load url ../utils/icsImport.js`.

- [ ] **Step 3: Move `toWallClock` to its own module.** Create `utils/wallClock.js`:

```js
// Convert an absolute instant to the wall-clock date/time seen in an IANA timezone.
export function toWallClock(instant, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour; // some ICU builds emit "24"
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}:${p.second}` };
}
```

In `utils/google.js`, delete the local `function toWallClock(instant, tz) { … }` block (11 lines) and add to the imports at the top:

```js
import { toWallClock } from "./wallClock.js";
```

- [ ] **Step 4: Write the mapping module.** Create `utils/icsImport.js`:

```js
// Pure mapping from a node-ical VEVENT to an `events` row.
//
// node-ical builds VALUE=DATE values and floating times (no TZID, no Z) at
// SERVER-LOCAL time; zoned and UTC times are real instants and carry `.tz`.
// So: local getters recover what the file said for the first kind, and the
// user's timezone gives the wall clock for the second.
import { addDaysStr } from "./recurrence.js";
import { toWallClock } from "./wallClock.js";

export const MAX_IMPORT_EVENTS = 500;

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function wallClock(d, userTz) {
  if (!d.tz) return { date: localDate(d), time: localTime(d) };
  const w = toWallClock(d, userTz);
  return { date: w.date, time: w.time.slice(0, 5) };
}

const asDate = (v) => (v instanceof Date ? v : new Date(v));

export function rruleFromIcs(vevent) {
  if (!vevent.rrule) return null;
  const line = String(vevent.rrule.toString()).split("\n").find((l) => l.startsWith("RRULE:"));
  return line ? line.slice("RRULE:".length) : null;
}

export function icsEventToRow(vevent, userTz) {
  if (!vevent?.summary || !vevent.start) return null;
  const start = asDate(vevent.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = vevent.end ? asDate(vevent.end) : null;
  const recurrence_rule = rruleFromIcs(vevent);

  if (vevent.datetype === "date") {
    const startDate = localDate(start);
    const rawEnd = end ? localDate(end) : startDate; // RFC 5545: exclusive
    return {
      all_day: true,
      start_date: startDate,
      end_date: rawEnd > startDate ? addDaysStr(rawEnd, -1) : startDate,
      start_time: null,
      end_time: null,
      recurrence_rule,
    };
  }

  const s = wallClock(start, userTz);
  const e = end ? wallClock(end, userTz) : null;
  return {
    all_day: false,
    start_date: s.date,
    end_date: e ? e.date : s.date,
    start_time: s.time,
    end_time: e ? e.time : null,
    recurrence_rule,
  };
}
```

- [ ] **Step 5: Run the mapping tests in four server timezones.**

Run: `for tz in UTC Europe/Brussels America/Los_Angeles Pacific/Auckland; do TZ=$tz npx vitest run tests/icsImport.test.js || echo "FAILED under $tz"; done`
Expected: all pass under every TZ, no `FAILED under` line.

- [ ] **Step 6: Write the failing route test.** Create `tests/icsImportRoute.test.js`. It mounts the real router and replaces Supabase with a local HTTP stand-in (no network, no real database):

```js
import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

const log = [];
let fake, server, base;

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//EN",
  "BEGIN:VEVENT", "UID:v1", "SUMMARY:One", "DTSTART;VALUE=DATE:20991010", "DTEND;VALUE=DATE:20991011", "END:VEVENT",
  "BEGIN:VEVENT", "UID:v2", "SUMMARY:Two", "DTSTART;VALUE=DATE:20991012", "DTEND;VALUE=DATE:20991013", "END:VEVENT",
  "BEGIN:VEVENT", "UID:v3", "SUMMARY:Three", "DTSTART;TZID=Europe/Brussels:20991014T140000", "DTEND;TZID=Europe/Brussels:20991014T150000", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.split("?")[0];
      log.push({ line: `${req.method} ${path}`, body });
      res.setHeader("content-type", "application/json");
      const one = String(req.headers.accept || "").includes("vnd.pgrst.object");
      if (path === "/auth/v1/user") return res.end(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", aud: "authenticated" }));
      if (req.method === "GET" && path === "/rest/v1/profiles") {
        const row = { notification_prefs: { timezone: "Europe/Brussels" } };
        return res.end(JSON.stringify(one ? row : [row]));
      }
      if (req.method === "POST" && path === "/rest/v1/events") {
        res.statusCode = 201;
        const row = { event_id: log.filter((l) => l.line === "POST /rest/v1/events").length };
        return res.end(JSON.stringify(one ? row : [row]));
      }
      if (req.method === "POST") { res.statusCode = 201; return res.end("[]"); }
      res.end("[]");
    });
  }).listen(0, "127.0.0.1");
  await new Promise((r) => fake.on("listening", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const icalRouter = (await import("../routes/ical.js")).default;
  const app = express();
  app.use(cookieParser());
  app.use("/api", icalRouter);
  app.use((err, req, res, next) => res.status(500).json({ success: false, error: err.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

it("imports every event, adds the importer as participant, and stores wall-clock times", async () => {
  const fd = new FormData();
  fd.append("ics", new Blob([ICS], { type: "text/calendar" }), "t.ics");
  const r = await fetch(`${base}/api/calendar/import`, {
    method: "POST",
    body: fd,
    headers: { cookie: "authCookie=t; refreshToken=r; expiresAt=9999999999" },
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ success: true, imported: 3, skipped: 0 });

  const inserts = log.filter((l) => l.line === "POST /rest/v1/events").map((l) => JSON.parse(l.body));
  expect(inserts).toHaveLength(3);
  expect(inserts[0]).toMatchObject({ start_date: "2099-10-10", end_date: "2099-10-10", all_day: true });
  expect(inserts[2]).toMatchObject({ start_date: "2099-10-14", start_time: "14:00", end_time: "15:00", all_day: false });
  expect(log.filter((l) => l.line === "POST /rest/v1/profiles_events")).toHaveLength(3);
});
```

Run: `npx vitest run tests/icsImportRoute.test.js`
Expected: FAIL, status `500` (the `.catch is not a function` TypeError).

- [ ] **Step 7: Rewrite the import handler.** In `routes/ical.js`, add to the imports (and remove the now-unused `import { addDaysStr } from "../utils/recurrence.js";`):

```js
import { icsEventToRow, MAX_IMPORT_EVENTS } from "../utils/icsImport.js";
import { toWallClock } from "../utils/wallClock.js";
import { isValidTimeZone } from "../utils/dailySummary.js";
```

Replace the whole `router.post("/calendar/import", …)` handler (from its doc comment's closing `*/` line to the `});` before `export default router;`) with:

```js
router.post("/calendar/import", authRequire, upload.single("ics"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const userId = req.cookies.userId;

  // Times are stored as naive wall-clock values, so convert into the user's zone.
  const { data: profile } = await req.supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("user_id", userId)
    .single();
  const storedTz = profile?.notification_prefs?.timezone;
  const userTz = isValidTimeZone(storedTz) ? storedTz : "UTC";
  const todayStr = toWallClock(new Date(), userTz).date;

  let parsed;
  try {
    parsed = ical.parseICS(req.file.buffer.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, error: "Could not parse ICS file." });
  }

  const vevents = Object.values(parsed).filter((e) => e.type === "VEVENT");
  if (vevents.length > MAX_IMPORT_EVENTS) {
    return res.status(400).json({ success: false, error: `Files with more than ${MAX_IMPORT_EVENTS} events are not supported.` });
  }

  let imported = 0;
  let skipped = 0;

  for (const vevent of vevents) {
    const row = icsEventToRow(vevent, userTz);
    // Skip unreadable events and one-off events that are already over.
    if (!row || (!row.recurrence_rule && row.end_date < todayStr)) {
      skipped++;
      continue;
    }

    const externalUid = vevent.uid || null;
    if (externalUid) {
      const { data: existing } = await req.supabase
        .from("events")
        .select("event_id")
        .eq("external_uid", externalUid)
        .eq("created_by", userId)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const { data: inserted, error: insertError } = await req.supabase
      .from("events")
      .insert({
        event_title: String(vevent.summary),
        event_description: vevent.description ? String(vevent.description) : "",
        location: vevent.location ? String(vevent.location) : "",
        ...row,
        created_by: userId,
        external_uid: externalUid,
      })
      .select("event_id")
      .single();

    if (insertError || !inserted) {
      skipped++;
      continue;
    }

    // Query builders have no .catch(): await and inspect the error instead.
    const { error: participantError } = await req.supabase
      .from("profiles_events")
      .insert({ user_id: userId, event_id: inserted.event_id, rsvp_status: "going" });
    if (participantError) {
      console.warn("[ical import] participant insert failed:", participantError.message);
    }

    imported++;
  }

  return res.json({ success: true, imported, skipped });
});
```

- [ ] **Step 8: Run all tests.**

Run: `npm test`
Expected: all pass, including `tests/icsImportRoute.test.js`.

- [ ] **Step 9: Commit.**

```bash
git add utils/wallClock.js utils/icsImport.js utils/google.js routes/ical.js tests/icsImport.test.js tests/icsImportRoute.test.js
git commit -m "fix(ical): import every event with correct dates, times and recurrence"
```

Note: this also commits the uncommitted edit already present in `routes/ical.js`; it is superseded by the new handler. `utils/recurrence.js`'s `export` of `addDaysStr` is committed in Task 5.

### Task 3: Remove dead push subscriptions (M6)

**Files:**
- Modify: `utils/notifications.js:96-104`

- [ ] **Step 1: Make the error callback async and await the delete.** Replace:

```js
            ).catch(err => {
              // 404/410 = subscription gone; 403 = key mismatch (VAPID rotated) —
              // in all cases the row is dead weight, delete it so we stop retrying.
              if ([403, 404, 410].includes(err.statusCode)) {
                supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).catch(() => {});
              } else {
```

with:

```js
            ).catch(async err => {
              // 404/410 = subscription gone; 403 = key mismatch (VAPID rotated) —
              // in all cases the row is dead weight, delete it so we stop retrying.
              if ([403, 404, 410].includes(err.statusCode)) {
                // Query builders are lazy and have no .catch(): await to actually send it.
                const { error: delError } = await supabaseAdmin
                  .from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                if (delError) console.warn("[push] could not delete dead subscription:", delError.message);
              } else {
```

- [ ] **Step 2: Check no builder `.catch` remains.**

Run: `grep -rn "\.catch(" routes utils | grep -v node_modules`
Expected: every remaining hit is on a function call or promise (e.g. `syncEventToGoogle(...)`, `webpush.sendNotification(...)`), none directly on a `.from(...)` chain. Review each line by eye.

- [ ] **Step 3: Run tests and commit.**

Run: `npm test` — Expected: all pass.

```bash
git add utils/notifications.js
git commit -m "fix(push): actually delete dead push subscriptions"
```

### Task 4: Fix the reminder dedupe (H3)

**Files:**
- Create: `utils/reminderDedupe.js`
- Modify: `utils/scheduler.js:82-89` (reminder sweep), `:157-165` (countdown sweep)
- Test: `tests/reminderDedupe.test.js`

**Interfaces:** Produces `alreadySent(db, { eventId, occurrenceDate, reminderType }) → Promise<boolean>`; throws on query error.

- [ ] **Step 1: Write the failing test.** Create `tests/reminderDedupe.test.js`:

```js
import { describe, it, expect } from "vitest";
import { alreadySent } from "../utils/reminderDedupe.js";

// Chainable stand-in for a Supabase client that records filters.
function fakeDb(rows, error = null) {
  const calls = [];
  const q = {
    select: (...a) => (calls.push(["select", ...a]), q),
    eq: (c, v) => (calls.push(["eq", c, v]), q),
    limit: (n) => (calls.push(["limit", n]), Promise.resolve({ data: error ? null : rows, error })),
  };
  return { calls, from: (t) => (calls.push(["from", t]), q) };
}
const key = { eventId: 7, occurrenceDate: "2027-03-10", reminderType: "reminder" };

describe("alreadySent", () => {
  it("filters on all three key columns", async () => {
    const db = fakeDb([]);
    await alreadySent(db, key);
    expect(db.calls).toContainEqual(["from", "event_reminders_sent"]);
    expect(db.calls).toContainEqual(["eq", "event_id", 7]);
    expect(db.calls).toContainEqual(["eq", "occurrence_date", "2027-03-10"]);
    expect(db.calls).toContainEqual(["eq", "reminder_type", "reminder"]);
  });
  it("false when nothing was sent", async () => {
    expect(await alreadySent(fakeDb([]), key)).toBe(false);
  });
  it("true when a row exists, however many", async () => {
    expect(await alreadySent(fakeDb([{ event_id: 7 }]), key)).toBe(true);
    expect(await alreadySent(fakeDb([{ event_id: 7 }, { event_id: 7 }]), key)).toBe(true);
  });
  it("throws when the query fails, so callers can skip instead of re-sending", async () => {
    await expect(alreadySent(fakeDb(null, { message: "boom" }), key)).rejects.toThrow("boom");
  });
});
```

Run: `npx vitest run tests/reminderDedupe.test.js`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement.** Create `utils/reminderDedupe.js`:

```js
// Has this (event, occurrence, reminder type) already fired?
// limit(1) instead of maybeSingle(): several rows must mean "sent", not an error.
export async function alreadySent(db, { eventId, occurrenceDate, reminderType }) {
  const { data, error } = await db
    .from("event_reminders_sent")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("occurrence_date", occurrenceDate)
    .eq("reminder_type", reminderType)
    .limit(1);
  if (error) throw new Error(`reminder dedupe check failed: ${error.message}`);
  return data.length > 0;
}
```

Run: `npx vitest run tests/reminderDedupe.test.js` — Expected: PASS.

- [ ] **Step 3: Use it in the reminder sweep.** In `utils/scheduler.js` add `import { alreadySent } from './reminderDedupe.js';` and replace:

```js
        // Skip if we already fired for this (event, occurrence).
        const { data: sent } = await db
          .from('event_reminders_sent')
          .select('event_id')
          .eq('event_id', event.event_id)
          .eq('occurrence_date', occurrenceDate)
          .maybeSingle();
        if (sent) continue;
```

with:

```js
        // Skip if we already fired this reminder. On a failed check, skip too:
        // a missed reminder is better than one re-sent every 5 minutes.
        let sent;
        try {
          sent = await alreadySent(db, { eventId: event.event_id, occurrenceDate, reminderType: 'reminder' });
        } catch (err) {
          console.error('[scheduler]', err.message);
          continue;
        }
        if (sent) continue;
```

- [ ] **Step 4: Use it in the countdown sweep.** Replace:

```js
      const { data: sent } = await db
        .from('event_reminders_sent')
        .select('event_id')
        .eq('event_id', event.event_id)
        .eq('occurrence_date', event.start_date)
        .eq('reminder_type', type)
        .maybeSingle();
      if (sent) continue;
```

with:

```js
      let sent;
      try {
        sent = await alreadySent(db, { eventId: event.event_id, occurrenceDate: event.start_date, reminderType: type });
      } catch (err) {
        console.error('[scheduler]', err.message);
        continue;
      }
      if (sent) continue;
```

- [ ] **Step 5: Run tests and commit.**

Run: `npm test` — Expected: all pass.

```bash
git add utils/reminderDedupe.js utils/scheduler.js tests/reminderDedupe.test.js
git commit -m "fix(scheduler): dedupe reminders by type so they neither vanish nor repeat"
```

### Task 5: Fix "this and following" for all-day and COUNT series (H5, M2)

**Files:**
- Modify: `utils/recurrence.js:94-105` (`capRuleUntil`), add `followingRule`
- Modify: `routes/events.js:197-201` (select), `:217-249` (split)
- Test: `tests/recurrence.test.js`

**Interfaces:** Produces `followingRule(event, occurrenceDate) → string | null` (null = no occurrences from that date on).

- [ ] **Step 1: Write the failing tests.** Create `tests/recurrence.test.js`:

```js
import { describe, it, expect } from "vitest";
import { expandRecurringEvent, capRuleUntil, followingRule } from "../utils/recurrence.js";

const win = [new Date("2027-01-01T00:00:00Z"), new Date("2027-12-31T00:00:00Z")];
const days = (ev) => expandRecurringEvent(ev, ...win, []).map((o) => o.start_date);
const base = { event_id: 1, event_title: "x", start_date: "2027-03-01", end_date: "2027-03-01", profiles_events: [] };
const allDay = { ...base, all_day: true, start_time: null, end_time: null };
const at9 = { ...base, all_day: false, start_time: "09:00:00", end_time: "10:00:00" };
const at0 = { ...base, all_day: false, start_time: "00:00:00", end_time: "01:00:00" };

describe("capRuleUntil ends the series the day before the split", () => {
  for (const [name, ev] of [["all-day", allDay], ["timed 09:00", at9], ["timed 00:00", at0]]) {
    it(name, () => {
      expect(days({ ...ev, recurrence_rule: capRuleUntil("FREQ=WEEKLY", "2027-03-15") }))
        .toEqual(["2027-03-01", "2027-03-08"]);
    });
  }
  it("splitting on the first occurrence leaves the old master empty", () => {
    expect(days({ ...allDay, recurrence_rule: capRuleUntil("FREQ=WEEKLY", "2027-03-01") })).toEqual([]);
  });
  it("replaces an existing COUNT", () => {
    expect(capRuleUntil("FREQ=WEEKLY;COUNT=10", "2027-03-15")).toBe("FREQ=WEEKLY;UNTIL=20270314T235959Z");
  });
});

describe("followingRule keeps the series length", () => {
  it("COUNT is reduced by the occurrences before the split", () => {
    const ev = { ...at9, recurrence_rule: "FREQ=WEEKLY;COUNT=4" };
    const next = followingRule(ev, "2027-03-15");
    expect(next).toBe("FREQ=WEEKLY;COUNT=2");
    const before = days({ ...ev, recurrence_rule: capRuleUntil(ev.recurrence_rule, "2027-03-15") });
    const after = days({ ...ev, start_date: "2027-03-15", end_date: "2027-03-15", recurrence_rule: next });
    expect([...before, ...after]).toEqual(["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22"]);
  });
  it("works for all-day series", () => {
    expect(followingRule({ ...allDay, recurrence_rule: "FREQ=WEEKLY;COUNT=4" }, "2027-03-15")).toBe("FREQ=WEEKLY;COUNT=2");
  });
  it("a rule without COUNT is returned unchanged", () => {
    expect(followingRule({ ...at9, recurrence_rule: "FREQ=DAILY;INTERVAL=2" }, "2027-03-15")).toBe("FREQ=DAILY;INTERVAL=2");
  });
  it("null when nothing remains", () => {
    expect(followingRule({ ...at9, recurrence_rule: "FREQ=WEEKLY;COUNT=2" }, "2027-04-01")).toBeNull();
  });
});
```

Run: `npx vitest run tests/recurrence.test.js`
Expected: FAIL (`followingRule` is not exported; the all-day and 00:00 cap cases return `2027-03-15` as a third day).

- [ ] **Step 2: Fix `capRuleUntil` and add `followingRule`.** In `utils/recurrence.js`, replace the `capRuleUntil` function and its comment with:

```js
/**
 * Set/replace the UNTIL of an RRULE string so the series ends the day before
 * `beforeDateStr`. Used for "this and following" deletes/edits.
 * UNTIL is inclusive, so cap at 23:59:59 of the previous day: an all-day
 * occurrence (or one at 00:00) on beforeDateStr must not survive.
 */
export function capRuleUntil(recurrenceRule, beforeDateStr) {
  const untilStr = addDaysStr(beforeDateStr, -1).replace(/-/g, "") + "T235959Z";
  const parts = recurrenceRule
    .split(";")
    .filter((p) => p && !/^UNTIL=/i.test(p) && !/^COUNT=/i.test(p));
  parts.push(`UNTIL=${untilStr}`);
  return parts.join(";");
}

/**
 * Rule for the new master created by a "this and following" split at
 * `occurrenceDate`. A COUNT rule only gets the occurrences that were left;
 * returns null when none are left.
 */
export function followingRule(event, occurrenceDate) {
  let options;
  try {
    options = RRule.parseString(event.recurrence_rule);
  } catch {
    return event.recurrence_rule;
  }
  if (!options.count) return event.recurrence_rule;

  const [sy, sm, sd] = event.start_date.split("-").map(Number);
  const [shh, smin] = event.start_time ? event.start_time.split(":").map(Number) : [0, 0];
  options.dtstart = new Date(Date.UTC(sy, sm - 1, sd, shh || 0, smin || 0, 0));
  const [oy, om, od] = occurrenceDate.split("-").map(Number);
  const splitAt = new Date(Date.UTC(oy, om - 1, od));

  const consumed = new RRule(options)
    .between(options.dtstart, splitAt, true)
    .filter((d) => d < splitAt).length;
  const remaining = options.count - consumed;
  if (remaining <= 0) return null;

  return event.recurrence_rule
    .split(";")
    .map((p) => (/^COUNT=/i.test(p) ? `COUNT=${remaining}` : p))
    .join(";");
}
```

Run: `npx vitest run tests/recurrence.test.js` — Expected: PASS.

- [ ] **Step 3: Use it in the PUT split.** In `routes/events.js`, update the import:

```js
import { expandRecurringEvent, capRuleUntil, followingRule } from "../utils/recurrence.js";
```

Change the `eventCheck` select in `router.put('/parseEvent/:eventId', …)` from `'created_by, recurrence_rule, groups_id'` to:

```js
      .select('created_by, recurrence_rule, groups_id, start_date, start_time')
```

At the top of the `if (eventCheck.recurrence_rule && recurrenceScope === 'following' && req.body.occurrenceDate) {` block, immediately after `const occurrenceDate = req.body.occurrenceDate;`, add:

```js
      // Keep the series length for COUNT rules; respect a rule the user edited.
      const ruleEdited = updateEventObj.recurrence_rule && updateEventObj.recurrence_rule !== eventCheck.recurrence_rule;
      const nextRule = ruleEdited ? updateEventObj.recurrence_rule : followingRule(eventCheck, occurrenceDate);
      if (!nextRule) {
        return res.status(400).json({ success: false, error: 'This series has no occurrences from that date.' });
      }
```

In the new-master insert of the same block, replace `recurrence_rule: eventCheck.recurrence_rule,` with `recurrence_rule: nextRule,`.

- [ ] **Step 4: Run tests and commit.**

Run: `npm test` — Expected: all pass.

```bash
git add utils/recurrence.js routes/events.js tests/recurrence.test.js
git commit -m "fix(recurrence): cap before the split day and keep COUNT series length"
```

### Task 6: Sanitise `/checkUser` filter input (H4)

**Files:**
- Create: `utils/postgrestFilter.js`
- Modify: `routes/groups.js:133-137` (`/checkUser`), `:198` (`/users/search`)
- Test: `tests/postgrestFilter.test.js`

**Interfaces:** Produces `sanitizeOrTerm(raw: unknown) → string`.

- [ ] **Step 1: Write the failing test.** Create `tests/postgrestFilter.test.js`:

```js
import { it, expect } from "vitest";
import { sanitizeOrTerm } from "../utils/postgrestFilter.js";

it("removes every character that can add a condition to an or() filter", () => {
  const out = sanitizeOrTerm("nomatch,and(username.eq.alice,ical_token.like.3f*)");
  expect(out).not.toMatch(/[,()*%]/);
});
it("keeps ordinary usernames and emails intact", () => {
  expect(sanitizeOrTerm("  alice.b@example.com ")).toBe("alice.b@example.com");
  expect(sanitizeOrTerm("Jean-Luc_2")).toBe("Jean-Luc_2");
});
it("handles missing input", () => {
  expect(sanitizeOrTerm(undefined)).toBe("");
  expect(sanitizeOrTerm(42)).toBe("42");
});
```

Run: `npx vitest run tests/postgrestFilter.test.js` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement.** Create `utils/postgrestFilter.js`:

```js
// Values interpolated into a PostgREST .or() string must not contain the
// characters that separate or group conditions, or wildcards.
export function sanitizeOrTerm(raw) {
  return String(raw ?? "").trim().replace(/[,()%*]/g, "");
}
```

- [ ] **Step 3: Use it.** In `routes/groups.js` add `import { sanitizeOrTerm } from "../utils/postgrestFilter.js";`. In `/checkUser`, before the query, add:

```js
    const term = sanitizeOrTerm(req.body.isUser);
    if (term.length < 2) {
      return res.json({ success: true, match: false });
    }
```

and change the filter line to:

```js
    .or(`username.ilike.${term},email.ilike.${term}`)
```

In `/users/search`, replace `const q = raw.replace(/[,()%*]/g, '');` with `const q = sanitizeOrTerm(raw);`.

- [ ] **Step 4: Run tests and commit.**

Run: `npm test` — Expected: all pass.

```bash
git add utils/postgrestFilter.js routes/groups.js tests/postgrestFilter.test.js
git commit -m "fix(security): sanitise checkUser input before building the or() filter"
```

### Task 7: One inclusive event array; FullCalendar-only conversion (H2, M4, L3)

**Release:** do not deploy before Task 14 (see "Release ordering").

**Files:**
- Create: `client/src/lib/calendarEvents.ts`
- Modify: `client/src/pages/CalendarPage.tsx` (imports, `loadEvents` remap, `filteredEvents`, `<FullCalendar events>`, `AgendaList`)
- Modify: `client/src/components/MobileMonthGrid.tsx:117-125`
- Modify: `client/src/components/EventFormModal.tsx:76`
- Test: `tests/calendarEvents.test.js`

**Interfaces:**
- Consumes: `addDaysStr`, `toCalendarAllDayEnd` from `client/src/lib/allDayDates.ts` (already in the working tree).
- Produces: `normalizeApiEvent(ev: CalEvent): CalEvent`, `toFullCalendarEvents(events: CalEvent[]): CalEvent[]`, `eventDays(ev: CalEvent, maxDays?: number): string[]`, `agendaDayKey(ev: CalEvent, todayKey: string): string | null`.

- [ ] **Step 1: Write the failing tests.** Create `tests/calendarEvents.test.js`:

```js
import { describe, it, expect } from "vitest";
import { normalizeApiEvent, toFullCalendarEvents, eventDays, agendaDayKey } from "../client/src/lib/calendarEvents.ts";

const ev = (start, end) => ({ id: "1", title: "t", start, end });

describe("normalizeApiEvent", () => {
  it("marks date-only events all-day and keeps the inclusive end", () => {
    expect(normalizeApiEvent(ev("2026-10-13", "2026-10-13"))).toMatchObject({ allDay: true, end: "2026-10-13" });
  });
  it("marks timed events not all-day", () => {
    expect(normalizeApiEvent(ev("2026-10-13T10:00", "2026-10-13T11:00")).allDay).toBe(false);
  });
});

describe("toFullCalendarEvents", () => {
  it("makes all-day ends exclusive without touching app state (agenda/edit regression)", () => {
    const state = [normalizeApiEvent(ev("2026-12-31", "2026-12-31")), normalizeApiEvent(ev("2026-10-14T10:00", "2026-10-14T11:00"))];
    const fc = toFullCalendarEvents(state);
    expect(fc[0].end).toBe("2027-01-01");
    expect(fc[1].end).toBe("2026-10-14T11:00");
    expect(state[0].end).toBe("2026-12-31"); // what the agenda and edit form see
  });
  it("leap day", () => {
    expect(toFullCalendarEvents([normalizeApiEvent(ev("2028-02-29", "2028-02-29"))])[0].end).toBe("2028-03-01");
  });
});

describe("eventDays", () => {
  it("month boundary", () => {
    expect(eventDays(ev("2026-10-30", "2026-11-02"))).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("year boundary", () => {
    expect(eventDays(ev("2026-12-30", "2027-01-02"))).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
  it("leap day", () => {
    expect(eventDays(ev("2028-02-28", "2028-03-01"))).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
  it("no end, and timed same-day", () => {
    expect(eventDays(ev("2026-10-06"))).toEqual(["2026-10-06"]);
    expect(eventDays(ev("2026-10-14T10:00", "2026-10-14T11:00"))).toEqual(["2026-10-14"]);
  });
  it("is capped", () => {
    expect(eventDays(ev("2026-01-01", "2030-01-01"), 10)).toHaveLength(10);
  });
});

describe("agendaDayKey", () => {
  const today = "2026-10-14";
  it("upcoming event goes under its start day", () => {
    expect(agendaDayKey(ev("2026-10-20", "2026-10-22"), today)).toBe("2026-10-20");
  });
  it("event in progress goes under today", () => {
    expect(agendaDayKey(ev("2026-10-12", "2026-10-16"), today)).toBe(today);
  });
  it("finished event is dropped", () => {
    expect(agendaDayKey(ev("2026-10-10", "2026-10-13"), today)).toBeNull();
  });
});
```

Run: `npx vitest run tests/calendarEvents.test.js` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement.** Create `client/src/lib/calendarEvents.ts` (relative imports only, so the root Vitest can load it):

```ts
// Calendar event shapes, in one place.
//
// App state holds events in Eventli's convention: `allDay` is explicit and an
// all-day `end` is INCLUSIVE. FullCalendar wants an EXCLUSIVE all-day end, so
// toFullCalendarEvents() is applied only to the array handed to <FullCalendar>
// — never to state, the agenda, the mobile grid, or the edit form.
import type { CalEvent } from '../types'
import { addDaysStr, toCalendarAllDayEnd } from './allDayDates'

/** API → app state. renderEvents sends no allDay; a date-only start means all-day. */
export function normalizeApiEvent(ev: CalEvent): CalEvent {
  return { ...ev, allDay: !ev.start.includes('T') }
}

/** App state → FullCalendar input. Returns new objects; input is not modified. */
export function toFullCalendarEvents(events: CalEvent[]): CalEvent[] {
  return events.map((ev) => (ev.allDay ? { ...ev, end: toCalendarAllDayEnd(ev.end) } : ev))
}

/** Every YYYY-MM-DD the event covers, start to inclusive end, at most maxDays. */
export function eventDays(ev: CalEvent, maxDays = 366): string[] {
  const start = ev.start.split('T')[0]
  const end = (ev.end ?? ev.start).split('T')[0]
  const days: string[] = []
  for (let d = start; d <= end && days.length < maxDays; d = addDaysStr(d, 1)) days.push(d)
  return days.length ? days : [start]
}

/** Agenda bucket: the start day, today for an event in progress, null once finished. */
export function agendaDayKey(ev: CalEvent, todayKey: string): string | null {
  const start = ev.start.split('T')[0]
  const end = (ev.end ?? ev.start).split('T')[0]
  if (end < todayKey) return null
  return start < todayKey ? todayKey : start
}
```

Run: `npx vitest run tests/calendarEvents.test.js` — Expected: PASS.

- [ ] **Step 3: CalendarPage imports.** Replace:

```ts
import { addDaysStr, toCalendarAllDayEnd, fromCalendarAllDayEnd } from '@/lib/allDayDates'
```

with:

```ts
import { addDaysStr, fromCalendarAllDayEnd } from '@/lib/allDayDates'
import { normalizeApiEvent, toFullCalendarEvents, agendaDayKey } from '@/lib/calendarEvents'
```

- [ ] **Step 4: Normalise once on load.** In `loadEvents`, replace:

```ts
          return {
            ...ev,
            backgroundColor: hex + '22',
            borderColor: hex,
            extendedProps: { ...(ev.extendedProps ?? {}), resolvedHex: hex },
          }
```

with:

```ts
          return normalizeApiEvent({
            ...ev,
            backgroundColor: hex + '22',
            borderColor: hex,
            extendedProps: { ...(ev.extendedProps ?? {}), resolvedHex: hex },
          })
```

- [ ] **Step 5: Keep `filteredEvents` in the app convention; convert only for FullCalendar.** Replace the whole `filteredEvents` `useMemo` (its two comment lines through `}, [events, activeGroups, groupsLoaded])`) with:

```ts
  // Filter events for the calendar views based on active groups.
  const filteredEvents = useMemo(() => {
    if (!groupsLoaded) return events  // show everything until user can see the filter panel
    return events.filter(ev => {
      if (ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID) return activeGroups.has(GOOGLE_SOURCE_ID)
      const gid = String(ev.extendedProps?.groupsId ?? '')
      if (!gid) return activeGroups.has('self')
      return activeGroups.has(gid)
    })
  }, [events, activeGroups, groupsLoaded])

  // FullCalendar alone gets exclusive all-day ends. Never store or pass this elsewhere.
  const fullCalendarEvents = useMemo(() => toFullCalendarEvents(filteredEvents), [filteredEvents])
```

Then, inside the `<FullCalendar … />` element only (around line 1122; the other two `events={filteredEvents}` props are on `MobileMonthGrid` and `AgendaList` and must stay), change `events={filteredEvents}` to `events={fullCalendarEvents}`.

- [ ] **Step 6: Agenda buckets.** In `AgendaList`, replace:

```ts
      const day = ev.start.split('T')[0]
      if (day < todayKey) continue
```

with:

```ts
      const day = agendaDayKey(ev, todayKey)
      if (!day) continue
```

- [ ] **Step 7: Mobile grid covers every day.** In `client/src/components/MobileMonthGrid.tsx`, add `import { eventDays } from '@/lib/calendarEvents'` and replace the body of the `eventsByDate` loop:

```ts
    for (const ev of events) {
      const dateStr = ev.start.split('T')[0]
      if (!map.has(dateStr)) map.set(dateStr, [])
      map.get(dateStr)!.push(ev)
    }
```

with:

```ts
    for (const ev of events) {
      for (const dateStr of eventDays(ev)) {
        if (!map.has(dateStr)) map.set(dateStr, [])
        map.get(dateStr)!.push(ev)
      }
    }
```

- [ ] **Step 8: Multi-day selection opens as all-day.** In `client/src/components/EventFormModal.tsx`, replace:

```ts
    allDay: event ? (event.allDay ?? !event.start.includes('T')) : false,
```

with:

```ts
    // A selection spanning several days is an all-day range; a single click stays timed.
    allDay: event
      ? (event.allDay ?? !event.start.includes('T'))
      : !!selectInfo?.allDay &&
        fromCalendarAllDayEnd(selectInfo.startStr, selectInfo.endStr) > selectInfo.startStr.split('T')[0],
```

- [ ] **Step 9: Typecheck, test, build.**

Run: `npm test && npm run typecheck && (cd client && npm run build)`
Expected: all tests pass, typecheck exit 0, build exit 0.

- [ ] **Step 10: Manual check (dev server, any account or mocked API).** With `cd client && npm run dev`:
  1. Desktop month view: a stored 30 Oct → 2 Nov all-day event spans exactly those four cells; dragging it one day saves `31 Oct → 3 Nov`.
  2. Agenda: open a single-day all-day event → Edit → end date equals start date. Save without changes → `PUT /api/parseEvent/:id` body has the same `endDate`.
  3. Width 390 px, compact layout: the 30 Oct → 2 Nov event is listed when selecting 1 Nov; Edit shows end 2 Nov.
  4. Drag-select three days on desktop: form opens with All day checked.

- [ ] **Step 11: Commit (includes the previously uncommitted all-day diff).**

```bash
git add client/src/lib/allDayDates.ts client/src/lib/calendarEvents.ts client/src/pages/CalendarPage.tsx client/src/components/MobileMonthGrid.tsx client/src/components/EventFormModal.tsx tests/calendarEvents.test.js
git commit -m "fix(calendar): inclusive all-day ends in app state, exclusive only for FullCalendar"
```

### Task 8: Show an error when events fail to load (M5)

**Files:**
- Modify: `client/src/pages/CalendarPage.tsx` (`loadEvents`, render above `{/* Loading indicator */}`)

- [ ] **Step 1: Add state.** Next to `const [loading, setLoading] = useState(true)`:

```ts
  const [loadError, setLoadError] = useState(false)
```

- [ ] **Step 2: Set it in `loadEvents`.** Directly after `if (seq !== loadSeq.current) return`, add:

```ts
      setLoadError(!data.success)
```

and replace the catch:

```ts
    } catch {
      // silently fail — auth interceptor handles 401
    } finally {
```

with:

```ts
    } catch {
      // 401 is handled by the auth interceptor; anything else is shown to the user.
      if (seq === loadSeq.current) setLoadError(true)
    } finally {
```

- [ ] **Step 3: Render it.** Directly above `{/* Loading indicator */}`:

```tsx
        {loadError && !loading && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              margin: '8px 24px', padding: '10px 14px', borderRadius: 'var(--r-sm)',
              background: 'var(--surface-2)', border: '1px solid var(--border-2)',
              color: 'var(--text-2)', fontSize: 13.5,
            }}
          >
            Couldn't load your events.
            <Button variant="soft" size="sm" onClick={() => loadEvents()}>Retry</Button>
          </div>
        )}
```

- [ ] **Step 4: Verify.** `npm run typecheck` → exit 0. In the dev server, stop the backend (`node app.js`) and reload `/calendar`: the alert appears; start the backend and press Retry: the alert disappears and events load.

- [ ] **Step 5: Commit.**

```bash
git add client/src/pages/CalendarPage.tsx
git commit -m "fix(calendar): show a retryable error when events fail to load"
```

### Task 9: Quick-add dates use the local calendar day (M12)

**Files:**
- Modify: `client/src/lib/nlParser.ts:14-16`
- Test: `tests/nlParser.test.js`

- [ ] **Step 1: Write the failing test.** Create `tests/nlParser.test.js`:

```js
import { it, expect, vi, afterEach } from "vitest";
import { parseNL } from "../client/src/lib/nlParser.ts";

afterEach(() => vi.useRealTimers());

it("weekday just after local midnight resolves to the right local date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 0, 30)); // Wed 14 Oct 2026, 00:30 local
  expect(parseNL("Lunch friday 1pm").date).toBe("2026-10-16");
});
```

Run: `TZ=Europe/Brussels npx vitest run tests/nlParser.test.js`
Expected: FAIL, received `2026-10-15`.

- [ ] **Step 2: Fix.** Replace:

```ts
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

with:

```ts
// Local calendar date; toISOString() would shift it near midnight east of UTC.
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

Run: `TZ=Europe/Brussels npx vitest run tests/nlParser.test.js && TZ=America/Los_Angeles npx vitest run tests/nlParser.test.js`
Expected: PASS twice.

- [ ] **Step 3: Commit.**

```bash
git add client/src/lib/nlParser.ts tests/nlParser.test.js
git commit -m "fix(nlParser): format parsed dates in local time"
```

### Task 10: Stop sending guest vote tokens to members (M7)

**Files:**
- Modify: `routes/events.js:770`

- [ ] **Step 1: Hash the token.** `crypto` is already imported in `routes/events.js`. Replace:

```js
                userId: v.user_id || `guest:${v.guest_token}`,
```

with:

```js
                // Stable per guest (keeps voter counts right) without revealing the
                // token that authorises changing that guest's votes.
                userId: v.user_id || `guest:${crypto.createHash('sha256').update(String(v.guest_token)).digest('hex').slice(0, 16)}`,
```

- [ ] **Step 2: Confirm no client code parses the token.**

Run: `grep -rn "guest:" client/src`
Expected: no output.

- [ ] **Step 3: Test and commit.** `npm test` → all pass.

```bash
git add routes/events.js
git commit -m "fix(voting): do not expose guest vote tokens in renderEvents"
```

### Task 11: Expand recurring events for the month being viewed (M3)

**Files:**
- Modify: `utils/recurrence.js` (add `expansionWindow`)
- Modify: `routes/events.js:620-621`
- Modify: `client/src/lib/calendarEvents.ts` (add `eventWindow`)
- Modify: `client/src/pages/CalendarPage.tsx` (`loadEvents` params, load effect)
- Test: `tests/recurrence.test.js`, `tests/calendarEvents.test.js`

**Interfaces:**
- Produces: `expansionWindow(query: { from?: string, to?: string }, now?: Date) → { windowStart: Date, windowEnd: Date }` (server).
- Produces: `eventWindow(monthDate: Date, today?: Date) → { from: string, to: string }` (client).

- [ ] **Step 1: Failing server test.** Append to `tests/recurrence.test.js`:

```js
import { expansionWindow } from "../utils/recurrence.js";

describe("expansionWindow", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  it("defaults to 60 days back and 365 ahead", () => {
    const { windowStart, windowEnd } = expansionWindow({}, now);
    expect(windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(windowEnd.toISOString().slice(0, 10)).toBe("2027-10-14");
  });
  it("uses from/to when valid", () => {
    const { windowStart, windowEnd } = expansionWindow({ from: "2028-01-25", to: "2028-03-14" }, now);
    expect(windowStart.toISOString()).toBe("2028-01-25T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2028-03-14T23:59:59.000Z");
  });
  it("ignores malformed or inverted ranges and caps the span at two years", () => {
    expect(expansionWindow({ from: "x", to: "2026-01-01" }, now).windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(expansionWindow({ from: "2027-01-01", to: "2026-01-01" }, now).windowStart.toISOString().slice(0, 10)).toBe("2026-08-15");
    const wide = expansionWindow({ from: "2020-01-01", to: "2030-01-01" }, now);
    expect((wide.windowEnd - wide.windowStart) / 864e5).toBeLessThanOrEqual(731);
  });
});
```

Run: `npx vitest run tests/recurrence.test.js` — Expected: FAIL, `expansionWindow` not exported.

- [ ] **Step 2: Implement.** Append to `utils/recurrence.js`:

```js
const DAY_MS = 86400000;
const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Window for expanding recurring events: the client's visible range when it
 * sends a valid ?from=&to= (YYYY-MM-DD), otherwise 60 days back / 365 ahead.
 */
export function expansionWindow(query = {}, now = new Date()) {
  const fallback = {
    windowStart: new Date(now.getTime() - 60 * DAY_MS),
    windowEnd: new Date(now.getTime() + 365 * DAY_MS),
  };
  if (!isDay(query.from) || !isDay(query.to)) return fallback;
  const windowStart = new Date(`${query.from}T00:00:00Z`);
  const windowEnd = new Date(`${query.to}T23:59:59Z`);
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime()) || windowEnd <= windowStart) return fallback;
  if (windowEnd - windowStart > 731 * DAY_MS) return { windowStart, windowEnd: new Date(windowStart.getTime() + 731 * DAY_MS) };
  return { windowStart, windowEnd };
}
```

Run: `npx vitest run tests/recurrence.test.js` — Expected: PASS.

- [ ] **Step 3: Use it in `renderEvents`.** Add `expansionWindow` to the `utils/recurrence.js` import in `routes/events.js`, and replace:

```js
  const windowStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
```

with:

```js
  const { windowStart, windowEnd } = expansionWindow(req.query);
```

Callers that send no range (GroupDetailPage, dev harness) keep today's behaviour.

- [ ] **Step 4: Failing client test.** Append to `tests/calendarEvents.test.js`:

```js
import { eventWindow } from "../client/src/lib/calendarEvents.ts";

describe("eventWindow", () => {
  it("covers the visible month grid and the agenda's year ahead", () => {
    expect(eventWindow(new Date(2026, 9, 1), new Date(2026, 9, 14))).toEqual({ from: "2026-09-24", to: "2027-10-14" });
  });
  it("a month far in the future reaches its own end", () => {
    expect(eventWindow(new Date(2028, 1, 1), new Date(2026, 9, 14))).toEqual({ from: "2026-10-14", to: "2028-03-14" });
  });
  it("a past month starts there", () => {
    expect(eventWindow(new Date(2025, 0, 1), new Date(2026, 9, 14)).from).toBe("2024-12-25");
  });
});
```

Run: `npx vitest run tests/calendarEvents.test.js` — Expected: FAIL, `eventWindow` not exported.

- [ ] **Step 5: Implement.** Append to `client/src/lib/calendarEvents.ts`:

```ts
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Date range to request from /renderEvents: the month grid (with its leading
 * and trailing days) plus a year from today for the agenda.
 */
export function eventWindow(monthDate: Date, today: Date = new Date()): { from: string; to: string } {
  const gridFrom = addDaysStr(ymd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)), -7)
  const gridTo = addDaysStr(ymd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)), 14)
  const t = ymd(today)
  const yearOut = addDaysStr(t, 365)
  return { from: gridFrom < t ? gridFrom : t, to: gridTo > yearOut ? gridTo : yearOut }
}
```

Run: `npx vitest run tests/calendarEvents.test.js` — Expected: PASS.

- [ ] **Step 6: Fetch per visible month.** In `CalendarPage.tsx`, add `eventWindow` to the `@/lib/calendarEvents` import. In `loadEvents`, replace `const { data } = await api.get('/renderEvents')` with:

```ts
      const { data } = await api.get('/renderEvents', { params: eventWindow(currentDate) })
```

In the mount `useEffect` that starts with `loadEvents()` and then loads `/groups`, delete the `loadEvents()` line, and add this effect directly after `loadEvents` is defined:

```ts
  // Refetch when the visible month changes; the first load shows the spinner.
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`
  const firstLoad = useRef(true)
  useEffect(() => {
    loadEvents({ silent: !firstLoad.current })
    firstLoad.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])
```

- [ ] **Step 7: Verify.** `npm test && npm run typecheck` → pass. In the dev server, create a weekly recurring event, navigate 14 months ahead: occurrences still show (before this task they stopped after ~12 months).

- [ ] **Step 8: Commit.**

```bash
git add utils/recurrence.js routes/events.js client/src/lib/calendarEvents.ts client/src/pages/CalendarPage.tsx tests/recurrence.test.js tests/calendarEvents.test.js
git commit -m "fix(calendar): expand recurring events for the month being viewed"
```

### Task 12: Pact status updates only from `active` (M11, part 1)

**Files:**
- Modify: `routes/pacts.js:25-28`, `utils/scheduler.js` (pact cron), `routes/habits.js:440-446`

- [ ] **Step 1: Make every status transition conditional.** In `routes/pacts.js` `resolvePactIfExpired`, replace:

```js
  await supabaseAdmin.from('pacts').update({ status: newStatus }).eq('pact_id', pact.pact_id);
  if (pact.reward_event_id) {
```

with:

```js
  // Only the first resolver wins; a concurrent cron or habit log may have resolved it already.
  const { data: changed } = await supabaseAdmin
    .from('pacts').update({ status: newStatus })
    .eq('pact_id', pact.pact_id).eq('status', 'active')
    .select('pact_id');
  if (!changed?.length) return { ...pact, status: newStatus };
  if (pact.reward_event_id) {
```

In `utils/scheduler.js` pact cron, replace:

```js
        await supabaseAdmin.from('pacts').update({ status: newStatus }).eq('pact_id', pact.pact_id);
        if (pact.reward_event_id) {
```

with:

```js
        const { data: changed } = await supabaseAdmin
          .from('pacts').update({ status: newStatus })
          .eq('pact_id', pact.pact_id).eq('status', 'active')
          .select('pact_id');
        if (!changed?.length) continue;
        if (pact.reward_event_id) {
```

In `routes/habits.js`, in the log handler's pact loop, change `.update({ status: 'succeeded', completions_count: newCount }).eq('pact_id', pact.pact_id)` to add `.eq('status', 'active')` before the `;`.

- [ ] **Step 2: Test and commit.** `npm test` → pass.

```bash
git add routes/pacts.js utils/scheduler.js routes/habits.js
git commit -m "fix(pacts): resolve a pact only while it is still active"
```

### Task 13: Explicit access checks instead of RLS-only (M8)

Independent of Phase 0's answers (defence in depth), but read Step 0.3's output first: if a policy already allows something on purpose (e.g. RSVP to events you were not invited to), keep that behaviour.

**Files:**
- Create: `utils/groupAccess.js`
- Modify: `routes/events.js` (`/rsvp/:eventId`, reactions GET/POST, comments GET/POST, `/retrieveUsersSelectedGroup`, POST and PUT `/parseEvent` group target)
- Modify: `routes/groups.js` (`/getGroupMembers/:groupId`)
- Modify: `routes/todo.js` (`/createTaskList`, `/createTask`, `/membersTaskList/`)
- Test: `tests/groupAccess.test.js`

**Interfaces:** Produces `isGroupMember(client, userId, groupId) → Promise<boolean>`; `canAccessEvent(client, userId, eventId) → Promise<{ event_id, created_by, groups_id } | null>`. Both throw on query error.

- [ ] **Step 1: Failing tests.** Create `tests/groupAccess.test.js`:

```js
import { describe, it, expect } from "vitest";
import { isGroupMember, canAccessEvent } from "../utils/groupAccess.js";

// tables: { tableName: rows[] }. Supports select/eq/limit/maybeSingle over in-memory rows.
function fakeDb(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
        limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      };
      return q;
    },
  };
}

const db = fakeDb({
  profiles_groups: [
    { user_id: "member", groups_id: 1, invite_status: "accepted" },
    { user_id: "invited", groups_id: 1, invite_status: "pending" },
  ],
  events: [
    { event_id: 10, created_by: "owner", groups_id: 1 },
    { event_id: 11, created_by: "owner", groups_id: null },
  ],
  profiles_events: [{ event_id: 11, user_id: "guest" }],
});

describe("isGroupMember", () => {
  it("accepted member only", async () => {
    expect(await isGroupMember(db, "member", 1)).toBe(true);
    expect(await isGroupMember(db, "invited", 1)).toBe(false);
    expect(await isGroupMember(db, "stranger", 1)).toBe(false);
    expect(await isGroupMember(db, "member", null)).toBe(false);
  });
});

describe("canAccessEvent", () => {
  it("creator, group member, or participant", async () => {
    expect(await canAccessEvent(db, "owner", 10)).toMatchObject({ event_id: 10 });
    expect(await canAccessEvent(db, "member", 10)).toMatchObject({ event_id: 10 });
    expect(await canAccessEvent(db, "guest", 11)).toMatchObject({ event_id: 11 });
  });
  it("nobody else, and unknown events", async () => {
    expect(await canAccessEvent(db, "invited", 10)).toBeNull();
    expect(await canAccessEvent(db, "stranger", 11)).toBeNull();
    expect(await canAccessEvent(db, "owner", 999)).toBeNull();
  });
});
```

Run: `npx vitest run tests/groupAccess.test.js` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement.** Create `utils/groupAccess.js`:

```js
// Explicit authorization checks, so correctness does not rest on RLS alone.

export async function isGroupMember(client, userId, groupId) {
  if (!groupId || !userId) return false;
  const { data, error } = await client
    .from("profiles_groups")
    .select("user_id")
    .eq("groups_id", groupId)
    .eq("user_id", userId)
    .eq("invite_status", "accepted")
    .limit(1);
  if (error) throw new Error(`membership check failed: ${error.message}`);
  return data.length > 0;
}

// The event if the user created it, is an accepted member of its group, or is a participant.
export async function canAccessEvent(client, userId, eventId) {
  const { data: event, error } = await client
    .from("events")
    .select("event_id, created_by, groups_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`event lookup failed: ${error.message}`);
  if (!event) return null;
  if (event.created_by === userId) return event;
  if (event.groups_id && (await isGroupMember(client, userId, event.groups_id))) return event;
  const { data: part, error: partError } = await client
    .from("profiles_events")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .limit(1);
  if (partError) throw new Error(`participant lookup failed: ${partError.message}`);
  return part.length ? event : null;
}
```

Run: `npx vitest run tests/groupAccess.test.js` — Expected: PASS.

- [ ] **Step 3: Guard event-scoped routes.** In `routes/events.js` add `import { isGroupMember, canAccessEvent } from "../utils/groupAccess.js";`. In each of `PATCH /rsvp/:eventId`, `GET` and `POST /events/:eventId/reactions`, `GET` and `POST /events/:eventId/comments`, insert immediately after the handler's existing `isNaN(eventId)` check:

```js
  if (!(await canAccessEvent(req.supabase, req.cookies.userId, eventId))) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }
```

(404 rather than 403 so event ids cannot be probed.) In `/rsvp/:eventId` the `isNaN` check is a one-liner `if (isNaN(eventId)) return res.status(400)…`; insert after that line.

- [ ] **Step 4: Guard group-scoped reads.** In `routes/events.js` `/retrieveUsersSelectedGroup`, after its `isNaN(groupId)` line:

```js
  if (!(await isGroupMember(req.supabase, req.cookies.userId, groupId))) {
    return res.status(403).json({ success: false, error: 'Not a group member.' });
  }
```

In `routes/groups.js` add the same import (`isGroupMember` only) and in `/getGroupMembers/:groupId` replace `const { groupId } = req.params;` with:

```js
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid group ID.' });
  if (!(await isGroupMember(req.supabase, req.cookies.userId, groupId))) {
    return res.status(403).json({ success: false, error: 'Not a group member.' });
  }
```

- [ ] **Step 5: Guard event group targets.** In `routes/events.js` `POST /parseEvent`, directly after `const insertEventObj = createEventObj(req.body)`, add:

```js
  const targetGroupId = insertEventObj.tagNames ? parseInt(insertEventObj.tagNames) : null;
  if (targetGroupId && !(await isGroupMember(req.supabase, req.cookies.userId, targetGroupId))) {
    return res.status(403).json({ success: false, error: 'Not a member of that group.' });
  }
```

In `PUT /parseEvent/:eventId`, directly after `const updateEventObj = createEventObj(req.body);`, add:

```js
    const targetGroupId = updateEventObj.tagNames ? parseInt(updateEventObj.tagNames) : null;
    if (targetGroupId && !(await isGroupMember(req.supabase, req.cookies.userId, targetGroupId))) {
      return res.status(403).json({ success: false, error: 'Not a member of that group.' });
    }
```

- [ ] **Step 6: Guard tasks.** In `routes/todo.js` add `import { isGroupMember } from "../utils/groupAccess.js";`.
  - `/createTaskList`, first lines of the handler:
    ```js
    const groupId = parseInt(req.body.groups_id, 10);
    if (isNaN(groupId) || !(await isGroupMember(req.supabase, req.cookies.userId, groupId))) {
      return res.status(403).json({ success: false, error: 'Not a group member.' });
    }
    ```
  - `/createTask`, first lines of the handler:
    ```js
    const { data: list } = await req.supabase
      .from("task_list").select("groups_id").eq("task_list_id", req.body.task_list_id).maybeSingle();
    if (!list || !(await isGroupMember(req.supabase, req.cookies.userId, list.groups_id))) {
      return res.status(403).json({ success: false, error: 'Not a group member.' });
    }
    ```
  - `/membersTaskList/`, directly after the `task_list` lookup (`.single();`):
    ```js
    if (!taskList || !(await isGroupMember(req.supabase, req.cookies.userId, taskList.groups_id))) {
      return res.status(403).json({ success: false, error: 'Not a group member.' });
    }
    ```

- [ ] **Step 7: Test, typecheck, manual smoke.** `npm test` → pass. With the backend running and a test account: create a group event, RSVP, comment, react, create a task list and a task: all still work for a member. From a second account that is not in the group, `curl` each endpoint with that account's cookies and the first account's ids: 403/404.

- [ ] **Step 8: Commit.**

```bash
git add utils/groupAccess.js routes/events.js routes/groups.js routes/todo.js tests/groupAccess.test.js
git commit -m "fix(security): explicit membership checks on event, group and task routes"
```

---

## Phase 3 — Gated on Phase 0 results

### Task 14: Repair all-day rows stored with an exclusive end (M1) — blocks deploying Task 7

**Requires:** Step 0.2 counts, decision D1.

- [ ] **Step 1: Snapshot the rows you will change** (SELECT only; save the output as a CSV backup outside the repo):

```sql
select event_id, start_date, end_date, external_uid, external_source
from events
where start_time is null and end_date > start_date
  and external_uid is not null and external_source is null;   -- .ics imports
```

- [ ] **Step 2: Apply (needs owner's explicit go-ahead for this statement).** For the recommended D1 option:

```sql
begin;
update events set end_date = end_date - 1
where start_time is null and end_date > start_date
  and external_uid is not null and external_source is null;
-- check the row count equals Step 1's, then:
commit;
```

- [ ] **Step 3: Record what was changed** (row count, timestamp, backup location) in `docs/audits/2026-10-14-db-inventory.md` and commit that file.

### Task 15: Personal events: filter on the event, not the embed (M9)

**Requires:** Step 0.3 answer for `events` SELECT.

**Files:** Modify `routes/events.js:525-530`, `:570-581`.

- [ ] **Step 1: Filter personal events by participation and keep the full participant list.** Replace the `userEvents` query:

```js
  let { data: userEvents, error: userEventsError} = await req.supabase.
  from('events')
  .select(`*,
    profiles_events(
      user_id,
      rsvp_status,
      profiles(
      username
      )
    )`)
  .eq('profiles_events.user_id', req.cookies.userId)
  .is('groups_id', null);
```

with:

```js
  // `mine` (inner join) decides WHICH personal events; `profiles_events` lists ALL their participants.
  let { data: userEvents, error: userEventsError } = await req.supabase
    .from('events')
    .select(`*,
      mine:profiles_events!inner(user_id),
      profiles_events(user_id, rsvp_status, profiles(username))`)
    .eq('mine.user_id', req.cookies.userId)
    .is('groups_id', null);
```

- [ ] **Step 2: Only accepted groups feed the calendar.** In the first query of `renderEvents`, change the embed to include and filter the status:

```js
  .select(`groups_id, tag_name, shared_color,
    profiles_groups!inner(
    user_id, invite_status
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId)
  .eq('profiles_groups.invite_status', 'accepted');
```

- [ ] **Step 3: Verify with two accounts.** Account A creates a personal event inviting B. B's calendar shows it with both participants listed. Account C (not invited) does not see it. An account with only a pending invite to a group sees none of that group's events.

- [ ] **Step 4: Commit.**

```bash
git add routes/events.js
git commit -m "fix(calendar): personal events by participation; accepted groups only"
```

### Task 16: Atomic pact counter (M11, part 2)

**Requires:** Step 0.1 `pacts` column types; owner's go-ahead to apply a migration.

**Files:**
- Create: `db/migrations/2026-10-14_pact_increment.sql`
- Modify: `routes/habits.js:438-447` (log) and `:350-355` (un-log)

- [ ] **Step 1: Write the migration.** Use the column types from Step 0.1 in place of `bigint`/`integer` if they differ:

```sql
-- Atomically add p_delta to a pact's completions and mark it succeeded at target.
create or replace function public.bump_pact_completions(p_pact_id bigint, p_delta integer)
returns table (pact_id bigint, completions_count integer, target_completions integer, status text, reward_event_id bigint)
language sql security definer set search_path = public as $$
  update pacts
     set completions_count = greatest(0, pacts.completions_count + p_delta),
         status = case when pacts.completions_count + p_delta >= pacts.target_completions then 'succeeded' else pacts.status end
   where pacts.pact_id = p_pact_id and pacts.status = 'active'
  returning pacts.pact_id, pacts.completions_count, pacts.target_completions, pacts.status, pacts.reward_event_id;
$$;
revoke execute on function public.bump_pact_completions(bigint, integer) from public, anon, authenticated;
grant execute on function public.bump_pact_completions(bigint, integer) to service_role;
```

Apply in the SQL editor after review.

- [ ] **Step 2: Use it on log.** In `routes/habits.js`, replace the body of `for (const pact of activePacts || []) { … }` in the log handler with:

```js
    for (const pact of activePacts || []) {
      const { data: bumped, error: bumpError } = await supabaseAdmin
        .rpc('bump_pact_completions', { p_pact_id: pact.pact_id, p_delta: 1 });
      if (bumpError) { console.warn('[pacts] bump failed:', bumpError.message); continue; }
      const row = bumped?.[0];
      if (row?.status === 'succeeded' && row.reward_event_id) {
        await supabaseAdmin.from('events').update({ status: 'confirmed' }).eq('event_id', row.reward_event_id);
      }
    }
```

- [ ] **Step 3: Use it on un-log.** In the un-log handler's pact loop, replace the read-modify-write update with:

```js
      const { error: bumpError } = await supabaseAdmin
        .rpc('bump_pact_completions', { p_pact_id: pact.pact_id, p_delta: -1 });
      if (bumpError) console.warn('[pacts] un-bump failed:', bumpError.message);
```

- [ ] **Step 4: Verify.** With two test accounts in one group with an active pact (target 2), log a habit from both at the same moment (two browser tabs): `completions_count` is 2 and the pact is `succeeded`.

- [ ] **Step 5: Commit.**

```bash
git add db/migrations/2026-10-14_pact_increment.sql routes/habits.js
git commit -m "fix(pacts): atomic completion counter"
```

---

## Phase 4 — Documentation

### Task 17: Bring CLAUDE.md and the privacy page up to date (L7, L13)

**Requires:** D3 for the privacy page.

**Files:** Modify `CLAUDE.md`, `client/src/pages/PrivacyPage.tsx:6-8`, `client/src/components/ui/Avatar.tsx`

- [ ] **Step 1: CLAUDE.md.** Add to the folder listing: `routes/google.js`, `routes/billing.js`, `utils/google.js`, `utils/tier.js`, `utils/wallClock.js`, `utils/icsImport.js`, `utils/reminderDedupe.js`, `utils/postgrestFilter.js`, `utils/groupAccess.js`, `client/src/lib/allDayDates.ts`, `client/src/lib/calendarEvents.ts`, `client/src/lib/recurrence.ts`, components `MobileMonthGrid`, `OnboardingWizard`, `CommentThread`, `RecurringScopePrompt`, `UpgradeModal`, pages `PublicEventPage`, `JoinGroupPage`, `PrivacyPage`. Add tables `event_overrides`, `event_reactions`, `event_comments`, `group_invite_tokens`, `google_calendar_tokens`, `google_synced_calendars`, `google_event_links`, `subscriptions`, `xp_transactions`, `profiles_task`, `timers`. Under Dev Commands add `npm run typecheck`. Under Common Gotchas add:
  - "All-day `end_date` is inclusive. Only `toFullCalendarEvents()` (FullCalendar), `utils/google.js` and `utils/ical.js` convert to exclusive ends."
  - "Supabase query builders have no `.catch()`. Always `const { error } = await …`."
  Fix "`mockData.ts` — MOCK_MEMBERS (sample avatars used by EventModal)" to "used by `Avatar.tsx`" (or remove it after Step 3).

- [ ] **Step 2: Privacy page.** Replace the two TODO constants with the values from D3.

- [ ] **Step 3: Drop the mock avatar lookup.** In `Avatar.tsx`, remove `import { MOCK_MEMBERS } from '@/lib/mockData'` and the `const mock = MOCK_MEMBERS[id]` line; replace each `mock?.x ?? y` with `y`. Run `npm run typecheck`; if `mockData.ts` now has no importers (`grep -rn mockData client/src`), delete it.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md client/src/pages/PrivacyPage.tsx client/src/components/ui/Avatar.tsx client/src/lib/mockData.ts
git commit -m "docs: update CLAUDE.md; real privacy contact; drop mock avatars"
```

---

## Not in this plan (backlog, by design)

Low-severity maintainability items from the audit, deliberately left out so each phase above stays shippable: splitting `GroupDetailPage`/`ProfilePage`/`routes/events.js` (L4); wrapping FullCalendar in its own adapter module (audit §6, step 2; Task 7 already fixes the leak that motivated it); the 69 silent catches beyond M5 (L5); deleting the legacy EJS app and unused dependencies (L6); generic error messages instead of raw DB errors (L9); `CalEvent` type cleanup beyond `allDay` (L11); token revocation endpoints (L12); the `!important` tentative style (L14).
