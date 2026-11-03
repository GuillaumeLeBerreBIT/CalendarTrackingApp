# Quick lists: shopping lists and event wishlists — design

Date: 2026-11-03. Status: draft for owner review.

## Intent

Two small features that share one foundation:

1. **Shopping list.** Today a grocery run means creating Tasks one by one and confirming
   each. The owner wants to dump many groceries in fast and tap each one to cross it off
   in the shop.
2. **Event wishlist.** An event (Christmas on 6 December, a birthday, a baby shower) can
   carry a list of wishes so guests know what to give, without two people buying the
   same thing.

Guiding principle from the owner: **keep it stupid simple.** Extras only if they are cheap.
Each list shows who made it.

## Goals

- Adding ten groceries takes about ten Enter presses, no dialogs, no confirm step.
- Ticking an item is one tap; ticked items get out of the way.
- A household (a group like HOME) shares one live list.
- An event can have one wishlist; guests can claim an item; the wish owner's surprise is kept.

## Non-goals (for now, and the design must not block them later)

- Quantities, prices, aisle/category sorting, per-item notes on shopping items,
  "recently used" suggestions, reminders, notifications.
- More than one wishlist per event (owner: "can be significantly expanded on" later).
- Splitting a gift, claim messages, wishlist quantities ("2× this").
- Instant realtime sync.

## Anti-goals

- Shopping items becoming Tasks (assignees, progress bars, task notifications). They are
  plain lines of text.
- The wish owner being able to find out what was claimed, through the UI **or** the API.
- Any new route reading or writing through the anon client, or loosening the access rules
  that went live 2026-11-03.

## The user-facing behaviour

### Shopping list

- **Where:** the Tasks page gets a second tab, `Tasks | Shopping` (using `<Segmented>`).
  *Claude's call* — keeps the bottom nav unchanged.
- **Create:** name + "Where" picker ("Just me" or one of the user's groups), same picker
  as RoutineSheet. Default selection: the first group if the user has one. *Claude's call.*
- **Show:** each list shows its title, its group (or "Just me"), and "by <username>" of the
  creator.
- **Add:** one always-open input at the top of the list. Enter adds the item and keeps focus.
  Pasting text that contains newlines or commas adds one item per non-empty, trimmed piece.
  Typed text with a comma and no paste is a single item. *Claude's call.*
- **Tick:** tapping an item toggles it done. Done items show struck through in a collapsed
  "Done (n)" section under the open items; tapping one again moves it back.
- **Clear done:** a button on the Done section deletes all done items of that list.
- **Rename / delete list:** creator, or a group admin for a group list.
- **Delete one item:** small × on the item (anyone who can see the list).
- **Order:** open items by when they were added, oldest first; new items go to the bottom.
- **Freshness:** the page refetches when it regains focus or visibility. No polling, no
  realtime. *Claude's call.*
- **Empty state:** `<Empty>` with a "New list" action.

### Event wishlist

- **Where:** in `EventModal`, a "Wishlist" section. If the event has none, anyone who can
  see the event gets an "Add a wishlist" button; the person who creates it owns it
  ("<username>'s wishlist"). One wishlist per event. *Claude's call:* not limited to the
  event creator, because a baby-shower or birthday organiser is often not the person
  whose wishes they are.
- **Items:** name (required), optional link (http/https only, opens in a new tab), optional
  note. Quick-add input like the shopping list (Enter adds a name; link and note are set by
  tapping the item to edit). Pasting multiple lines adds one item per line (no comma split,
  since gift names can contain commas). *Claude's call.*
- **Only the owner** adds, edits, deletes items, or deletes the wishlist.
- **Guests** (anyone else who can see the event) see items, and per item either
  "I'll get this" or "Taken" / "You're getting this — undo". One claim per item; only the
  claimer can undo their own claim.
- **The owner never sees claims.** Their view shows the items only, no taken state, no
  claimer.
- **Deleting an item that has a claim** removes the claim too (no notice to the claimer —
  KISS).
- When the event is deleted, its wishlist goes with it.

## Data model (decided)

One foundation, two kinds. New migration `db/migrations/2026-11-03_lists.sql`.

`lists`
- `list_id bigint identity pk`
- `kind text not null check (kind in ('shopping','wishlist'))`
- `title text not null` (wishlists: default "Wishlist")
- `created_by uuid not null default auth.uid()` → `profiles.user_id`, immutable
- `groups_id bigint null` → `groups` (shopping, group-scoped)
- `event_id bigint null` → `events` `on delete cascade` (wishlist)
- `created_at timestamptz default now()`
- Checks: `kind='shopping'` ⇒ `event_id is null`; `kind='wishlist'` ⇒ `event_id is not null and groups_id is null`.
- Unique partial index on `event_id` where `kind='wishlist'` (one wishlist per event).

`list_items`
- `item_id bigint identity pk`, `list_id` → `lists` `on delete cascade`
- `title text not null` (trimmed, 1–200 chars), `link text null`, `note text null`
- `is_done boolean not null default false` (shopping only)
- `created_by uuid default auth.uid()`, `created_at timestamptz default now()`

`list_item_claims` (separate table so claims can be hidden by row, not by column)
- `item_id bigint pk` → `list_items` `on delete cascade` (pk = one claim per item)
- `claimed_by uuid not null default auth.uid()`, `created_at timestamptz default now()`

### Access rules (RLS, using the existing helpers)

- `lists` SELECT: shopping — `created_by = auth.uid()` when `groups_id is null`, else
  `is_group_member(groups_id)`; wishlist — `can_access_event(event_id)`.
  INSERT: same visibility rule and `created_by = auth.uid()`.
  UPDATE/DELETE: creator, or `is_group_admin(groups_id)` for group shopping lists.
- `list_items` SELECT: visible if the parent list is visible. INSERT/UPDATE/DELETE: shopping —
  anyone who sees the list; wishlist — list creator only.
- `list_item_claims` SELECT/INSERT/DELETE: the parent wishlist is visible **and**
  `auth.uid() <> lists.created_by`; INSERT/DELETE also require `claimed_by = auth.uid()`.
  So the owner cannot read a single claim row, even with direct PostgREST access.
- `anon`: no privileges on any of the three tables.
- A helper `can_see_list(lid bigint)` (security definer, same style as `can_access_event`)
  is the expected way to keep these policies short. *Claude's call; builder may restructure.*
- Extend `db/tests/access_rules_test.sql` (or a sibling `lists_access_test.sql`, run in
  `begin … rollback`, ending in a raised `LISTS_ACCESS_OK`) to prove: outsider can't see a
  group list; pending invitee can't; wish owner reads 0 claim rows; guest can claim; guest
  can't add items to someone else's wishlist; nobody can claim for someone else.

## API (decided shape; exact paths are the builder's)

A new `routes/lists.js`, mounted under `/api`, all `authRequire`, all on `req.supabase`
(RLS does the access work). Usernames for "by <username>" and claimer names are filled via
`supabaseAdmin` reading **only** `user_id, username` (profile embeds can come back null
under the new rules — read them null-safely).

- List the user's shopping lists with their items.
- Create / rename / delete a list.
- Add items in bulk (array of titles — the client does the paste splitting).
- Toggle done, edit an item, delete an item, clear done items of a list.
- Get an event's wishlist (items; for non-owners also each item's claim state:
  `claimedByMe` boolean and `taken` boolean — never the claimer's id or name).
  *Claude's call:* guests see "Taken", not who took it. Simpler and avoids leaking guest
  plans among guests.
- Create the wishlist on an event; claim / unclaim an item.

Server-side input rules: trim titles, drop empties, cap a bulk add at 100 items, reject
links that are not `http://` or `https://`.

## Constraints

- Follow CLAUDE.md: ESM, `{ success }` JSON, CSS variables for design tokens, `<Icon>`,
  UI primitives from `components/ui/`, Supabase builders always `await`ed.
- New tables must be added to CLAUDE.md's "Known tables" and folder structure.
- Tests: Vitest route tests against the local Supabase stand-in (like
  `tests/groupMembershipRoutes.test.js`), plus the SQL access test above.
- The migration is applied to production by the controller in the main session with the
  owner present (Supabase MCP prompts expire otherwise).

## Settled after the builder check (Claude's calls)

- **Only the list creator is blind to claims.** The event creator, group admins and every
  other viewer see "Taken" like any guest. The owner may delete or edit items freely; a
  deleted item takes its claim with it. That reveals nothing to the owner, who never sees
  claim state in the first place.
- **Ownership follows access.** Everyone, the owner included, sees a wishlist only through
  `can_access_event(event_id)`. If the owner loses access to the event, they lose the
  wishlist too. Nothing is moved or deleted.
- **Immutable columns:** a trigger keeps `created_by`, `kind`, `event_id` and `groups_id` on
  `lists` (and `list_id`, `created_by` on `list_items`) unchanged, the same pattern as
  `events_created_by_immutable`. `authenticated` gets table grants and RLS decides. The
  client never talks to PostgREST directly; all writes go through the new routes.
- **Group deletion:** `lists.groups_id` is `on delete cascade`, so deleting a group via
  `delete_group()` takes its lists with it in the same transaction. Extend the delete-group
  SQL test to assert that. A member leaving a group leaves the group's lists in place.
- **Personal shopping list** (`groups_id is null`) is strictly creator-only. The default
  in "Where" is the first **accepted** group from `/groups`, else "Just me".
- **Creating a wishlist twice** (a race, or a stale screen) is get-or-create: on a unique
  conflict, return the existing wishlist with 200.

## Left to the builder

- Exact endpoint paths and payload names, component split, file names on the client.
- Visual details within the design system (strike style, Done section animation).
- Whether optimistic updates are used for tick/claim (recommended: yes, with rollback on error).
- Whether the shopping tab and the wishlist share one `ListItemRow` component.

## Later, explicitly not now

Multiple wishlists per event (one per person), quantities, recently-used suggestions,
realtime sync, "X added milk" notifications, aisle sorting.
