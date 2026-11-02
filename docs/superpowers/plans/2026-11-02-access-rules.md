# Database Access Rules (RLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase row-level security enforce what the app already enforces, and fix the routes the current rules (or the anonymous client) silently break.

**Architecture:** Users' own actions run through the user-scoped client (`req.supabase`) and are allowed by RLS. Cross-user writes and lookups run through `supabaseAdmin`, after the route's explicit check. One migration replaces the policies; a SQL test asserts them as real users inside a rolled-back transaction.

**Tech Stack:** Express 5 (ESM), `@supabase/supabase-js`, Postgres RLS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-access-rules-design.md`

## Global Constraints

- Server Supabase clients keep `persistSession: false, autoRefreshToken: false` (`db/supabase.js`); create no new clients — use `req.supabase` or `supabaseAdmin`.
- Supabase query builders have no `.catch()`; always `const { error } = await …`.
- Every endpoint still returns `{ success: true|false, … }`.
- Search results must not include another user's `email` (owner decision 2026-11-02).
- Hidden profile columns (no SELECT/UPDATE for `authenticated`): `ical_token`, `paddle_customer_id`, `plan`, `tier`, `always_free`.
- `anon` keeps no table privileges in `public`.
- Route changes (Tasks 1–2) deploy **before** the migration (Task 3) is applied.

## Review Focus

1. A user with a **pending** invite opens their invite list: the group's title must still show (`has_group_row`), but its events and tasks must not. → Task 3 test `pending invitee sees group name only`.
2. A group **admin** edits or deletes another member's group event (allowed today by `canManageEvent`) and the participant rows follow. → Task 3 test `group admin manages member event`.
3. Accepting an invite and then **re-reading `/groups`**: the member list embeds other members' profiles, which must be readable once a group row exists. → Task 3 test `member reads co-member profiles`.
4. Creating a **personal event with invitees** from a group (appointment): the creator inserts `profiles_events` rows for other users. → Task 3 test `creator invites participants`.
5. `.ics` **import** inserts events and the importer's own RSVP rows through `req.supabase`. → Task 3 test `ics import as self`.

---

### Task 1: Stop using the anonymous client for user and job data

The default `supabase` export is the anon key with no user JWT, so under RLS it acts as nobody. Today `PATCH /profile*` and `POST /email-preferences` update 0 rows silently, and the 07:00 digest can't read events.

**Files:**
- Modify: `routes/auth.js` (handlers at `GET /profile`, `PATCH /profile`, `PATCH /profile/city`, `PATCH /profile/username`: table queries only; leave `supabase.auth.*` calls alone)
- Modify: `routes/email.js` (`fetchDigestData`, `sendDigestForUser` → `supabaseAdmin`; `GET/POST /email-preferences` → `req.supabase`)
- Modify: `utils/scheduler.js:222` (digest profile list → `supabaseAdmin`)
- Test: `tests/anonClientRoutes.test.js`

**Interfaces:**
- Produces: no new exports. After this task no module calls `.from(...)` on the default anon `supabase` export.

- [ ] **Step 1: Write the failing test.** Same local-Supabase stand-in as `tests/routinesRoute.test.js`, which records each request's `authorization` header and method per table. Mount `routes/auth.js` and `routes/email.js`.

```js
it("PATCH /profile/city writes profiles as the logged-in user", async () => {
  await patch("/api/profile/city", { city: "Gent" }, ME);
  const w = writes("profiles");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(`Bearer ${ME}`);
});
it("PATCH /profile and /profile/username write as the user", /* same assertion for both */);
it("POST /email-preferences writes as the user", /* same assertion */);
it("fetchDigestData reads with the secret key", async () => {
  await fetchDigestData(ME);
  expect(reads("events").every((r) => r.authorization === "Bearer test-secret")).toBe(true);
});
```

- [ ] **Step 2:** `npx vitest run tests/anonClientRoutes.test.js` → FAIL (authorization is `Bearer test-anon`).
- [ ] **Step 3:** Swap the clients as listed under Files. Remove the default `supabase` import from `routes/email.js` if it becomes unused.
- [ ] **Step 4:** Run the test → PASS. Then run `grep -nE "(^|[^.\w])supabase\s*\.from" routes/*.js utils/*.js` → no output.
- [ ] **Step 5:** `npm test` passes, then commit `fix: user routes and digest no longer query as the anonymous client`.

### Task 2: Route cross-user writes and lookups through `supabaseAdmin`

**Files:**
- Modify: `routes/groups.js`:
  - `createGroup`: group insert, creator admin row, invite upserts
  - `inviteUsers`: user lookup at :317 and the upsert at :293
  - `checkUser`: :139
  - `/users/search`: :209, select `user_id, username` only
  - `POST /joinGroup/:token`: upsert at :847
  - member removal: delete at :1068
- Modify: `routes/ical.js:106,125` (own `ical_token` read and rotate → `supabaseAdmin` with `.eq('user_id', req.cookies.userId)`)
- Modify: `utils/notifications.js:16` (recipients' `notification_prefs` → `supabaseAdmin`; the `client` parameter stays for API compatibility)
- Modify: `client/src/pages/GroupDetailPage.tsx:2001-2006` (search result row: drop the email line)
- Test: `tests/groupMembershipRoutes.test.js`

**Interfaces:**
- Consumes: the existing admin/token checks in each route (they stay first and unchanged).
- Produces: `/users/search` returns `users: { user_id, username }[]`.

- [ ] **Step 1: Write the failing tests** (stand-in server as in Task 1, mounting `routes/groups.js` and `routes/ical.js`):

```js
it("inviteUsers writes memberships with the secret key after the admin check", …);   // upsert on profiles_groups: Bearer test-secret
it("inviteUsers by a non-admin is refused and writes nothing", …);                   // 403, writes("profiles_groups") empty
it("removing a member deletes with the secret key", …);
it("createGroup inserts group and creator row with the secret key", …);
it("joinGroup with a valid token upserts with the secret key", …);
it("users/search returns no email field", async () => {
  const { users } = await (await get("/api/users/search?q=ha", ME)).json();
  expect(users.length).toBeGreaterThan(0);
  expect(users.every((u) => !("email" in u))).toBe(true);
});
it("ical token is read and rotated with the secret key, scoped to me", …);           // query has user_id=eq.ME
```

- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Swap clients as listed. Each admin call keeps its own `.eq('user_id', …)`/`.eq('groups_id', …)` filters, because RLS no longer narrows it.
- [ ] **Step 4:** Tests PASS. `npm test` and `npm run typecheck` pass.
- [ ] **Step 5:** Commit `fix(groups): invites, removals and joins write through the admin client; search hides emails`.

### Task 3: Access-rules migration and its SQL test

**Files:**
- Create: `db/migrations/2026-11-02_access_rules.sql`, with FORWARD and ROLLBACK sections. ROLLBACK recreates today's policies verbatim from `pg_policies` (dump them into the file before writing FORWARD).
- Create: `db/tests/access_rules_test.sql`, a single `do $$ … $$` block that ends with `raise exception 'ACCESS_RULES_OK'`, so it always rolls back.

**Interfaces:**
- Produces, as SQL functions (all `language sql stable security definer set search_path = public`, `execute` revoked from `public, anon` and granted to `authenticated`):
  - `is_group_member(gid bigint) → boolean` (now requires `invite_status = 'accepted'`)
  - `is_group_admin(gid bigint) → boolean`
  - `has_group_row(gid bigint) → boolean`
  - `can_access_event(eid bigint) → boolean`
  - `can_manage_event(eid bigint) → boolean` (creator, or admin of its group)

- [ ] **Step 1: Write the test file.** Helper inside the block: `perform set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true); set local role authenticated;`, plus `reset role` between actors. Seed throwaway rows as the owner first:
  - group G with admin A, member M and pending P
  - stranger S
  - a group event E_A by A and a group event E_M by M
  - a personal event PE by A with M invited

  Assertions (each `if not … then raise exception 'FAIL: <name>'`):
  - `stranger cannot read profiles`: S selecting A's profile → 0 rows. M reading A's username and email → 1 row.
  - `hidden columns`: `select ical_token from profiles` as A raises `permission denied`.
  - `no self-join`: S inserting `(G, S, 'admin', 'accepted')` raises.
  - `no self-promotion`: M updating own `role` raises. M updating own `color` → 1 row.
  - `pending invitee sees group name only`: P reads G → 1 row. P reads events of G → 0 rows. P updating own `invite_status` to `'accepted'` → 1 row.
  - `only admins change groups`: M updating G's title → 0 rows. A → 1 row.
  - `events in foreign group`: S inserting an event with `groups_id = G` raises.
  - `group admin manages member event`: A updates E_M → 1 row. M updating E_A → 0 rows.
  - `creator invites participants`: A inserting `profiles_events (S, PE)` → ok. S inserting itself on E_A raises.
  - `ics import as self`: S inserts a personal event with `created_by = S` and its own RSVP → ok.
  - `comments need access`: S inserting a comment on E_A raises. M → ok.
  - `member reads co-member profiles`: M joins `profiles_groups` with `profiles(username)` for G → 3 rows.
  - `anon has nothing`: `has_table_privilege('anon','public.profiles','select')` is false.
- [ ] **Step 2: Run against today's rules.** Paste `access_rules_test.sql` into Supabase SQL (or `execute_sql`). Expected: `FAIL: stranger cannot read profiles`, the first of several.
- [ ] **Step 3: Write FORWARD** per the spec's per-table section:
  - helpers
  - drop and recreate the policies on `profiles`, `profiles_groups`, `groups`, `events`, `profiles_events`, `event_comments`, `event_reactions`, `event_overrides`
  - `revoke all on all tables in schema public from anon`
  - on `profiles`: `revoke select, update on profiles from authenticated`, then `grant select (user_id, username, bio, avatar_url, created_at, updated_at, email, email_digest_enabled, city, notification_prefs, has_completed_onboarding, searchable, total_xp)` and `grant update (username, bio, avatar_url, updated_at, email_digest_enabled, city, notification_prefs, has_completed_onboarding, searchable)`
  - on `profiles_groups`: `revoke update` from authenticated, then `grant update (invite_status, color)`
- [ ] **Step 4: Run migration + test together, rolled back.** Send FORWARD followed by the test block as one query. Expected: the error text is exactly `ACCESS_RULES_OK`. Then confirm nothing persisted: `select count(*) from pg_proc where proname = 'can_manage_event'` → 0.
- [ ] **Step 5:** Commit both SQL files: `feat(db): access rules that match the app (RLS)`.

### Task 4: Ship, apply, verify

- [ ] **Step 1:** Push Tasks 1–2 and wait for the production deploy to finish.
- [ ] **Step 2:** Apply FORWARD (owner go-ahead), then rerun `access_rules_test.sql` alone. Expected: `ACCESS_RULES_OK`.
- [ ] **Step 3: Owner click-through.** Check each of these:
  - login
  - calendar loads with group and personal events
  - open HOME
  - invite a user to HOME
  - remove a test member
  - join by invite link
  - RSVP
  - add a comment
  - change city on the profile, and it sticks
  - copy the calendar-feed link, and it opens
  - the Routines page

  On any failure, paste ROLLBACK and report.
- [ ] **Step 4:** Update `docs/audits/2026-11-02-db-inventory.md` (R1–R8 fixed, date). Add a Common Gotcha to `CLAUDE.md`: "Cross-user writes go through `supabaseAdmin` after the route's own check; RLS only allows a user's own actions. Never query tables with the default anon `supabase` export." Commit `docs: access rules applied`.
