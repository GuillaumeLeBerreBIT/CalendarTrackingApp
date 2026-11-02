# Database access rules (RLS) — design

Date: 2026-11-02. Findings: `docs/audits/2026-11-02-db-inventory.md` (R1–R8).

## Why

The Express routes check permissions, but the database's own row-level security (RLS) is
far looser: any logged-in user could read every profile (email, calendar-feed token), add
themselves to any group as admin, and create or edit events in any group. That is only
reachable today with the Supabase publishable key, which the browser never receives, but
Supabase treats that key as public and RLS as the real lock. At the same time, two routes
are **broken** by the current rules (verified 2026-11-02 in a rolled-back transaction):
inviting someone to an existing group fails, and removing a member reports success but
deletes nothing.

## Goals

- A logged-in user, calling PostgREST directly with their own token, can do no more than
  the app lets them do.
- `anon` (no login) can read or write nothing in `public`.
- Fix group invites and member removal.
- No visible change for normal use.

## Non-goals

- New features or UI changes.
- Redesigning the route layer. Routes keep their explicit checks (`utils/groupAccess.js`).

## Approach

**One principle:** RLS allows what a user does *to their own data or data they can see*.
Anything one user does *to another user's rows* (inviting, removing a member, joining via
an invite link, finding a person by exact email) goes through `supabaseAdmin`, **after**
the route's explicit check. That is the same pattern `delete_group()` already uses.

### Helpers (SQL, `SECURITY DEFINER`, `STABLE`)

- `is_group_member(gid)`: changed to require `invite_status = 'accepted'`. A pending invite
  no longer opens group data.
- `is_group_admin(gid)`: accepted member with `role = 'admin'`.
- `has_group_row(gid)`: any membership row, pending included. Used only so an invitee can
  see the group's name in their invite list.
- `can_access_event(eid)`: creator, participant, or accepted member of the event's group.

### Per table

| Table | Read | Write |
|---|---|---|
| `profiles` | self; anyone sharing a group (any status) or an event. Strangers are found only through the search routes. | update own row, **only** username/city/bio/avatar/onboarding/searchable/email-digest/notification-prefs columns. Columns `ical_token`, `paddle_customer_id`, `plan`, `tier`, `always_free`, `total_xp` are not readable or writable by users at all; routes read the own-row values through `supabaseAdmin`. |
| `profiles_groups` | own rows; rows of groups where I have any row | insert: only the group creator's own first admin row (group has no rows yet). Update: own row, columns `invite_status` and `color` only, so no self-promotion. Delete: own row (leave). Invites, removals and invite-link joins go through `supabaseAdmin`. |
| `groups` | `has_group_row` | insert: any user. Update and delete: admin. |
| `events` | unchanged (group member / creator / participant) | insert: `created_by = me` and (personal, or I'm a member of the group). Update and delete: creator or group admin, matching `canManageEvent`. |
| `profiles_events` | rows of events I can access | insert: myself on an event I can access (RSVP, .ics import), or any user if I created the event. Update: own row, or any row if I created the event. Delete: own row, or the event's creator. |
| `event_comments`, `event_reactions` | `can_access_event` | own rows on events I can access |
| `event_overrides` | `can_access_event` | unchanged (creator) |
| everything | `anon` loses all table privileges in `public` | |

### Route changes that come with it

- `routes/groups.js`: `inviteUsers`, invites in `createGroup`, member removal, and
  `POST /joinGroup/:token` switch their membership write to `supabaseAdmin` (their admin
  or token checks already run first). `checkUser` (exact username/email lookup for
  invites) and `/users/search` (searchable users) switch to `supabaseAdmin` and choose
  the columns they return. Per the email decision, search results no longer include
  strangers' emails.
- `routes/ical.js`: reading and rotating your own `ical_token` uses `supabaseAdmin`
  with `.eq('user_id', me)`.
- `routes/email.js`, `utils/scheduler.js`: they currently use the anonymous client with no
  login and rely on `anon` reading profiles. They switch to `supabaseAdmin`.

## How it is verified

- **Before applying:** a SQL test file runs inside one transaction that is rolled back. It
  acts as real users (`set local role authenticated` plus the JWT claim) and asserts each
  allowed and refused action above. That includes the two broken routes now working
  through the admin path, and every abuse case in R1–R8 failing.
- `npm test` and `npm run typecheck` pass.
- **After applying:** owner clicks through login, calendar, a group page, inviting a user,
  joining by link, RSVP, a comment, the profile page and the calendar-feed link.
- **Rollback:** the migration file carries the previous policies, so they can be restored
  in one paste.

## Release order

The route changes deploy **first**: they work under both the old and the new rules,
because `supabaseAdmin` ignores RLS. Then the migration is applied.

## Decided

- **Email visibility (owner, 2026-11-02):** emails visible only to yourself and to
  people you share a group or event with. Search shows username only, and you can still
  invite someone by typing their exact email.
