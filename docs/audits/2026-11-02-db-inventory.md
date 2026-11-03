# Database inventory — 2026-11-02

Plan: `docs/superpowers/plans/2026-10-14-audit-remediation.md`, Task 0 (steps 0.1–0.3).
Project `fhaffbgrrepbowirthcb` (CalanderTracking, eu-central-1). All queries SELECT-only
except the data changes listed at the end.

## Exposure model

The browser never talks to Supabase: no Supabase URL or key exists in `client/`, and the
session JWT sits in an HTTP-only cookie. Every finding below therefore needs someone who
has the publishable key **and** a user JWT and calls PostgREST directly. Supabase treats
the publishable key as public, so RLS is meant to be the real boundary; today the Express
routes are. Severity below is "if PostgREST is reached directly".

## RLS

RLS is enabled (not forced) on all 28 public tables.

`is_group_member(gid)` (SECURITY DEFINER) checks only that a `profiles_groups` row exists for
`auth.uid()`. It does **not** check `invite_status = 'accepted'`, so a pending invitee counts
as a member in every policy that uses it.

## Step 0.3 answers

| Question | Answer |
|---|---|
| Can `authenticated` read another user's `profiles.ical_token`? | **Yes.** `profiles` SELECT policy is `true`; `anon` and `authenticated` hold column SELECT on every column, including `ical_token`, `email` and `paddle_customer_id`. Anyone holding a token can subscribe to that user's full calendar feed. H4 → **Critical** per the plan's rule. |
| Does `events` SELECT expose others' personal events? | No. Personal rows need `created_by = auth.uid()` or a `profiles_events` row. M9 was a display bug (participant list cut to the viewer), fixed in `d015011`. |
| Can a user add themselves to any event via `profiles_events` INSERT? | **Yes** (`auth.uid() = user_id` is the whole check). Group events also allow any member to insert rows for anyone. |
| Do `task_list` / `task` policies require membership? | Yes, via `is_group_member` (so pending invitees included). |
| Do `event_comments` / `event_reactions` require access to the event? | SELECT on comments does. INSERT on comments and ALL on reactions check only `auth.uid() = user_id`: anyone can comment or react on any event id. |

## Further findings from the policy dump

| # | Table | Problem | Severity (direct PostgREST) |
|---|---|---|---|
| R1 | `profiles` | Everyone reads every row and column (email, `ical_token`). | Critical |
| R2 | `profiles_groups` | INSERT is `auth.uid() = user_id`: anyone can add themselves to **any** group, with any `role` and `invite_status`. UPDATE lets a member set their own `role = 'admin'`. Joining a group this way opens its events, tasks, pacts and invite tokens. | Critical |
| R3 | `events` | INSERT allows any user into any `groups_id`. UPDATE/DELETE allow any group member (routes restrict to creator). | High |
| R4 | `groups` | Any member (including pending) can UPDATE or DELETE the group row. | High |
| R5 | `is_group_member` | Ignores `invite_status`; pending invitees read group data. | Medium |
| R6 | `profiles_events`, `profiles_groups` | SELECT is `auth.uid() IS NOT NULL`: every RSVP and every membership is readable by any user. | Medium |
| R7 | `event_overrides` | SELECT is `true`. | Low |
| R8 | `profiles` | Users can UPDATE their own `total_xp`, `plan`, `ical_token`. | Low |

## Task 16 inputs

`pacts`: `pact_id bigint`, `groups_id integer`, `target_completions integer`,
`completions_count integer`, `reward_event_id bigint`, `status text` — matches the plan's
function signature.

## Step 0.2 / Task 14 outcome (data changes made 2026-11-02, with the owner's go-ahead)

- All-day multi-day rows: 0 `.ics`, 0 Google, 18 app-created. Owner reviewed all 18; none
  shifted except event 514 "Verlof", extended to Sun 8 Nov at the owner's request.
- Deleted 7 orphaned Nov 2025 test events (ids 1, 12, 13, 14, 15, 24, 25; creator account gone).
- Separately: routines 580–583 moved to group 35 (HOME) at the owner's request.

## Resolution (2026-11-03)

R1–R8 fixed by `db/migrations/2026-11-02_access_rules.sql`, applied to production on
2026-11-03 at 08:56 UTC (migration version 20261103085611), after the route changes in PR #2
were deployed. `db/tests/access_rules_test.sql` passed against the live rules
(ACCESS_RULES_OK); the migration's ROLLBACK section was proven to restore the previous state
(ROLLBACK_OK). One incident followed: `/renderEvents` returned 500 because a participant's
profile embed was now null; fixed by PR #3 (usernames filled via supabaseAdmin), live 09:11 UTC.
Known leftover: legacy membership row with `invite_status` NULL (group 14 "Testing").
