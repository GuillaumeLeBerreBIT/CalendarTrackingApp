-- Quick lists — 2026-11-03
-- Design: docs/superpowers/specs/2026-11-03-lists-design.md
--
-- Shopping lists (personal, or shared with a group) and one claimable wishlist per event.
--   lists             one row per list; kind 'shopping' or 'wishlist'
--   list_items        the lines of a list
--   list_item_claims  "I'll get this" on a wishlist item; one claim per item
--
-- Claims live in their own table so they can be hidden by ROW: the wishlist's creator
-- cannot read a single claim row, even with direct PostgREST access. Everyone else who
-- can see the wishlist can.
--
-- Depends on the helpers of 2026-11-02_access_rules.sql (is_group_member,
-- is_group_admin, can_access_event).
--
-- Test: db/tests/lists_access_test.sql. Run FORWARD + the test inside one
-- `begin; … rollback;` — it must end with the error text exactly `LISTS_ACCESS_OK`.
--
-- Apply in the Supabase dashboard → SQL Editor: it runs the pasted script as one
-- transaction, so a failure part-way changes nothing. No begin/commit in this file, so it
-- can be wrapped in `begin; … rollback;` for testing.
--
-- =========================== FORWARD ===========================

-- ---------- tables ----------
create table public.lists (
  list_id    bigint generated always as identity primary key,
  kind       text not null check (kind in ('shopping', 'wishlist')),
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  -- Cascade: deleting an account (POST /account/delete) deletes the lists it created.
  created_by uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  groups_id  bigint null references public.groups (groups_id) on delete cascade,
  event_id   bigint null references public.events (event_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint lists_shopping_no_event check (kind <> 'shopping' or event_id is null),
  constraint lists_wishlist_on_event check (kind <> 'wishlist' or (event_id is not null and groups_id is null))
);
-- One wishlist per event.
create unique index lists_one_wishlist_per_event on public.lists (event_id) where kind = 'wishlist';
create index lists_groups_id_idx  on public.lists (groups_id);
create index lists_created_by_idx on public.lists (created_by);

create table public.list_items (
  item_id    bigint generated always as identity primary key,
  list_id    bigint not null references public.lists (list_id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  link       text null check (link ~* '^https?://' and char_length(link) <= 2000),
  note       text null check (char_length(note) <= 1000),
  is_done    boolean not null default false,
  -- Nullable: items a departed user added to a shared list stay, unattributed.
  created_by uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index list_items_list_id_idx on public.list_items (list_id);

-- Primary key on item_id = one claim per item. Deleting an item takes its claim with it.
create table public.list_item_claims (
  item_id    bigint primary key references public.list_items (item_id) on delete cascade,
  claimed_by uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- helpers ----------
-- SECURITY DEFINER so a policy can call them without re-entering RLS on the tables they
-- read (no policy recursion). STABLE: they only read.

-- Who sees a list, from its own columns (so the lists policies need no lookup).
-- Shopping: personal → creator only (even when creator and viewer share a group);
-- group → accepted members. Wishlist: whoever can access the event, owner included.
create or replace function public.list_visible(k text, gid bigint, eid bigint, owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case k
    when 'shopping' then
      (gid is null and owner = auth.uid())
      or (gid is not null and public.is_group_member(gid))
    when 'wishlist' then
      coalesce(public.can_access_event(eid), false)
    else false
  end;
$$;

create or replace function public.can_see_list(lid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lists l
    where l.list_id = lid
      and public.list_visible(l.kind, l.groups_id, l.event_id, l.created_by)
  );
$$;

-- Add / edit / delete items: anyone who sees a shopping list; only the creator of a wishlist.
create or replace function public.can_edit_list_items(lid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lists l
    where l.list_id = lid
      and public.list_visible(l.kind, l.groups_id, l.event_id, l.created_by)
      and (l.kind = 'shopping' or l.created_by = auth.uid())
  );
$$;

-- Claims: the item is on a wishlist I can see that is NOT mine. False for the wishlist's
-- creator, which is what keeps every claim row invisible to them.
create or replace function public.can_claim_item(iid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.list_items i
      join public.lists l on l.list_id = i.list_id
    where i.item_id = iid
      and l.kind = 'wishlist'
      and public.list_visible(l.kind, l.groups_id, l.event_id, l.created_by)
      and l.created_by <> auth.uid()
  );
$$;

revoke execute on function public.list_visible(text, bigint, bigint, uuid) from public, anon;
revoke execute on function public.can_see_list(bigint)        from public, anon;
revoke execute on function public.can_edit_list_items(bigint) from public, anon;
revoke execute on function public.can_claim_item(bigint)      from public, anon;
grant  execute on function public.list_visible(text, bigint, bigint, uuid) to authenticated;
grant  execute on function public.can_see_list(bigint)        to authenticated;
grant  execute on function public.can_edit_list_items(bigint) to authenticated;
grant  execute on function public.can_claim_item(bigint)      to authenticated;

-- ---------- RLS ----------
alter table public.lists            enable row level security;
alter table public.list_items       enable row level security;
alter table public.list_item_claims enable row level security;

-- lists. Read: list_visible. Insert: as myself, a list I would see. Update and delete:
-- creator, or admin of the list's group (group shopping lists).
create policy "lists read visible" on public.lists
  for select to authenticated
  using (public.list_visible(kind, groups_id, event_id, created_by));
create policy "lists insert own" on public.lists
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.list_visible(kind, groups_id, event_id, created_by)
  );
create policy "lists update owner or admin" on public.lists
  for update to authenticated
  using (
    public.list_visible(kind, groups_id, event_id, created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id)))
  )
  with check (
    public.list_visible(kind, groups_id, event_id, created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id)))
  );
create policy "lists delete owner or admin" on public.lists
  for delete to authenticated
  using (
    public.list_visible(kind, groups_id, event_id, created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id)))
  );

-- list_items. Read: the list is visible. Write: can_edit_list_items.
create policy "list items read visible" on public.list_items
  for select to authenticated
  using (public.can_see_list(list_id));
create policy "list items insert" on public.list_items
  for insert to authenticated
  with check (public.can_edit_list_items(list_id) and created_by = auth.uid());
create policy "list items update" on public.list_items
  for update to authenticated
  using (public.can_edit_list_items(list_id))
  with check (public.can_edit_list_items(list_id));
create policy "list items delete" on public.list_items
  for delete to authenticated
  using (public.can_edit_list_items(list_id));

-- list_item_claims. Read, claim and unclaim: can_claim_item (never the wishlist's
-- creator). Claim and unclaim only as myself. No update.
create policy "claims read" on public.list_item_claims
  for select to authenticated
  using (public.can_claim_item(item_id));
create policy "claims insert own" on public.list_item_claims
  for insert to authenticated
  with check (public.can_claim_item(item_id) and claimed_by = auth.uid());
create policy "claims delete own" on public.list_item_claims
  for delete to authenticated
  using (claimed_by = auth.uid() and public.can_claim_item(item_id));

-- ---------- immutable columns ----------
-- Users (role authenticated, i.e. PostgREST with a user token) may not move a list or an
-- item, or rewrite who made it; supabaseAdmin (service_role) and the owner still can.
-- Same pattern as events_created_by_immutable.
create or replace function public.lists_immutable()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.created_by is distinct from old.created_by
       or new.kind      is distinct from old.kind
       or new.event_id  is distinct from old.event_id
       or new.groups_id is distinct from old.groups_id) then
    raise exception 'lists.created_by, kind, event_id and groups_id cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.lists_immutable() from public, anon, authenticated;
drop trigger if exists lists_immutable on public.lists;
create trigger lists_immutable
  before update on public.lists
  for each row execute function public.lists_immutable();

create or replace function public.list_items_immutable()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.list_id    is distinct from old.list_id
       or new.created_by is distinct from old.created_by) then
    raise exception 'list_items.list_id and created_by cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.list_items_immutable() from public, anon, authenticated;
drop trigger if exists list_items_immutable on public.list_items;
create trigger list_items_immutable
  before update on public.list_items
  for each row execute function public.list_items_immutable();

-- ---------- privileges ----------
-- anon (no login) gets nothing; authenticated gets table grants and RLS decides.
-- Revoke authenticated first: Supabase's default privileges give it ALL (TRUNCATE,
-- UPDATE on claims, …); only the grants below should remain.
revoke all on public.lists, public.list_items, public.list_item_claims from anon;
revoke all on public.lists, public.list_items, public.list_item_claims from authenticated;
grant select, insert, update, delete on public.lists, public.list_items to authenticated;
grant select, insert, delete on public.list_item_claims to authenticated;

-- =========================== ROLLBACK ==========================
-- Kept commented so pasting the whole file never undoes the forward section; uncomment
-- (strip the leading `-- `) and paste it. Dropping the tables drops their policies,
-- indexes, triggers and foreign keys (incl. those to profiles); ALL list data is lost.
--
-- drop trigger if exists list_items_immutable on public.list_items;
-- drop trigger if exists lists_immutable on public.lists;
-- drop function if exists public.list_items_immutable();
-- drop function if exists public.lists_immutable();
-- drop table if exists public.list_item_claims;
-- drop table if exists public.list_items;
-- drop table if exists public.lists;
-- drop function if exists public.can_claim_item(bigint);
-- drop function if exists public.can_edit_list_items(bigint);
-- drop function if exists public.can_see_list(bigint);
-- drop function if exists public.list_visible(text, bigint, bigint, uuid);
