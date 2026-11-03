-- Access rules (RLS) that match the app — 2026-11-02
-- Design: docs/superpowers/specs/2026-11-02-access-rules-design.md
-- Findings: docs/audits/2026-11-02-db-inventory.md (R1–R8)
--
-- The Express routes check permissions, but the database's own row-level security was far
-- looser: any logged-in user could read every profile (email, calendar-feed token), add
-- themselves to any group as admin, and create or edit events in any group; `anon` held
-- every table privilege. With this migration a user calling PostgREST directly with their
-- own token can do no more than the app lets them, and `anon` can do nothing in `public`.
--
-- One principle: RLS allows what a user does to their own data or data they can see.
-- Anything one user does to another user's rows (inviting, removing a member, joining via
-- an invite link, finding a person by exact email, reading one's own ical_token) goes
-- through supabaseAdmin after the route's explicit check. Those route changes must be
-- DEPLOYED BEFORE this migration is applied (they work under both the old and new rules).
--
-- Test: db/tests/access_rules_test.sql. Run FORWARD + the test inside one
-- `begin; … rollback;` — it must end with the error text exactly `ACCESS_RULES_OK`.
--
-- Apply in the Supabase dashboard → SQL Editor: it runs the pasted script as one
-- transaction, so a failure part-way changes nothing. No begin/commit in this file, so it
-- can be wrapped in `begin; … rollback;` for testing.
--
-- =========================== FORWARD ===========================

-- ---------- helpers ----------
-- All SECURITY DEFINER so a policy can call them without re-entering RLS on the tables
-- they read (no policy recursion). STABLE: they only read.

-- Accepted member. A pending invite no longer opens group data.
create or replace function public.is_group_member(gid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles_groups
    where groups_id = gid and user_id = auth.uid() and invite_status = 'accepted'
  );
$$;

-- Accepted member with role 'admin'.
create or replace function public.is_group_admin(gid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles_groups
    where groups_id = gid and user_id = auth.uid()
      and invite_status = 'accepted' and role = 'admin'
  );
$$;

-- Any membership row, pending included. Only so an invitee can see the group's name
-- (and who is in it) in their invite list.
create or replace function public.has_group_row(gid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles_groups
    where groups_id = gid and user_id = auth.uid()
  );
$$;

-- Creator, participant, or accepted member of the event's group (= utils/groupAccess.js
-- canAccessEvent).
create or replace function public.can_access_event(eid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.event_id = eid
      and (
        e.created_by = auth.uid()
        or (e.groups_id is not null and public.is_group_member(e.groups_id))
        or exists (select 1 from public.profiles_events pe
                   where pe.event_id = e.event_id and pe.user_id = auth.uid())
      )
  );
$$;

-- Creator, or admin of the event's group (= routes/events.js canManageEvent).
create or replace function public.can_manage_event(eid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.event_id = eid
      and (
        e.created_by = auth.uid()
        or (e.groups_id is not null and public.is_group_admin(e.groups_id))
      )
  );
$$;

revoke execute on function public.is_group_member(bigint)  from public, anon;
revoke execute on function public.is_group_admin(bigint)   from public, anon;
revoke execute on function public.has_group_row(bigint)    from public, anon;
revoke execute on function public.can_access_event(bigint) from public, anon;
revoke execute on function public.can_manage_event(bigint) from public, anon;
grant  execute on function public.is_group_member(bigint)  to authenticated;
grant  execute on function public.is_group_admin(bigint)   to authenticated;
grant  execute on function public.has_group_row(bigint)    to authenticated;
grant  execute on function public.can_access_event(bigint) to authenticated;
grant  execute on function public.can_manage_event(bigint) to authenticated;

-- ---------- drop today's policies on the tables below ----------
drop policy if exists "Public profiles viewable by everyone" on public.profiles;
drop policy if exists "Users can insert own profile"         on public.profiles;
drop policy if exists "Users can update own profile"         on public.profiles;
drop policy if exists "authenticated view memberships"       on public.profiles_groups;
drop policy if exists "own membership delete"                on public.profiles_groups;
drop policy if exists "own membership insert"                on public.profiles_groups;
drop policy if exists "own membership update"                on public.profiles_groups;
drop policy if exists "authenticated create group"           on public.groups;
drop policy if exists "group members delete"                 on public.groups;
drop policy if exists "group members select"                 on public.groups;
drop policy if exists "group members update"                 on public.groups;
drop policy if exists "events delete"                        on public.events;
drop policy if exists "events insert"                        on public.events;
drop policy if exists "events select"                        on public.events;
drop policy if exists "events update"                        on public.events;
drop policy if exists "authenticated view rsvps"             on public.profiles_events;
drop policy if exists "own rsvp delete"                      on public.profiles_events;
drop policy if exists "rsvp insert"                          on public.profiles_events;
drop policy if exists "rsvp update"                          on public.profiles_events;
drop policy if exists "own comments delete"                  on public.event_comments;
drop policy if exists "own comments write"                   on public.event_comments;
drop policy if exists "participants read comments"           on public.event_comments;
drop policy if exists "members react"                        on public.event_reactions;
drop policy if exists event_overrides_modify                 on public.event_overrides;
drop policy if exists event_overrides_select                 on public.event_overrides;

-- ---------- profiles ----------
-- Read: self; an accepted member of a group I have any row in (so a pending invitee sees
-- the group's members, but members do not see a pending invitee); the creator of an
-- event I can access. Being a fellow participant does NOT count: whoever manages an event can add
-- anyone to it with any RSVP status, so participation would let a stranger reveal
-- anyone's profile (and email) by inviting them.
-- Strangers are found only through the search routes (supabaseAdmin).
create policy "profiles read self or shared" on public.profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles_groups mine
                 join public.profiles_groups theirs on theirs.groups_id = mine.groups_id
                where mine.user_id = auth.uid() and theirs.user_id = profiles.user_id
                  and theirs.invite_status = 'accepted')
    or exists (select 1 from public.events e
                where e.created_by = profiles.user_id and public.can_access_event(e.event_id))
  );
-- Rows are created by the signup trigger; kept as before for a user's own row.
create policy "profiles insert own" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- profiles_groups ----------
-- Read: own rows, and rows of groups where I have any row. No insert for users
-- (invites, joins and createGroup go through supabaseAdmin). Update: own row, columns
-- invite_status and color only (grant below). Delete: own row (leave).
create policy "memberships read own groups" on public.profiles_groups
  for select to authenticated
  using (user_id = auth.uid() or public.has_group_row(groups_id));
create policy "memberships update own" on public.profiles_groups
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "memberships delete own" on public.profiles_groups
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- groups ----------
-- Read: any membership row (an invitee sees the name). No insert for users
-- (createGroup uses supabaseAdmin). Update and delete: admin.
create policy "groups read with a row" on public.groups
  for select to authenticated
  using (public.has_group_row(groups_id));
create policy "groups update admin" on public.groups
  for update to authenticated
  using (public.is_group_admin(groups_id))
  with check (public.is_group_admin(groups_id));
create policy "groups delete admin" on public.groups
  for delete to authenticated
  using (public.is_group_admin(groups_id));

-- ---------- events ----------
-- Read: unchanged (group member / creator / participant; is_group_member is now
-- accepted-only). Insert: as myself, personal or in a group I am a member of.
-- Update and delete: creator or group admin (= canManageEvent); the updated row must
-- stay personal or in a group I am a member of. created_by cannot be changed by users
-- (trigger below): a WITH CHECK cannot compare against the old row.
create policy "events select" on public.events
  for select to authenticated
  using (
    (groups_id is not null and public.is_group_member(groups_id::bigint))
    or (groups_id is null and (
          created_by = auth.uid()
          or auth.uid() in (select profiles_events.user_id from public.profiles_events
                             where profiles_events.event_id = events.event_id)))
  );
create policy "events insert own" on public.events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (groups_id is null or public.is_group_member(groups_id::bigint))
  );
create policy "events update manager" on public.events
  for update to authenticated
  using (public.can_manage_event(event_id))
  with check (groups_id is null or public.is_group_member(groups_id::bigint));
create policy "events delete manager" on public.events
  for delete to authenticated
  using (public.can_manage_event(event_id));

-- Users (role authenticated, i.e. PostgREST with a user token) may not rewrite
-- created_by; supabaseAdmin (service_role) and the owner still can.
create or replace function public.events_created_by_immutable()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and new.created_by is distinct from old.created_by then
    raise exception 'events.created_by cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.events_created_by_immutable() from public, anon, authenticated;
drop trigger if exists events_created_by_immutable on public.events;
create trigger events_created_by_immutable
  before update on public.events
  for each row execute function public.events_created_by_immutable();

-- ---------- profiles_events ----------
-- Read: rows of events I can access. Insert: myself on an event I can access (RSVP,
-- .ics import), or anyone on an event I manage (creator, or group admin editing a
-- member's group event — PUT /parseEvent/:id adds participants). Update: own row, or any
-- row of an event I manage. Delete: own row, or the event's manager.
create policy "rsvps read accessible" on public.profiles_events
  for select to authenticated
  using (user_id = auth.uid() or public.can_access_event(event_id));
create policy "rsvps insert" on public.profiles_events
  for insert to authenticated
  with check (
    (user_id = auth.uid() and public.can_access_event(event_id))
    or public.can_manage_event(event_id)
  );
create policy "rsvps update" on public.profiles_events
  for update to authenticated
  using (user_id = auth.uid() or public.can_manage_event(event_id))
  with check (
    (user_id = auth.uid() and public.can_access_event(event_id))
    or public.can_manage_event(event_id)
  );
create policy "rsvps delete" on public.profiles_events
  for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_event(event_id));

-- ---------- event_comments ----------
create policy "comments read accessible" on public.event_comments
  for select to authenticated
  using (public.can_access_event(event_id));
create policy "comments insert own" on public.event_comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_event(event_id));
create policy "comments delete own" on public.event_comments
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- event_reactions ----------
create policy "reactions read accessible" on public.event_reactions
  for select to authenticated
  using (public.can_access_event(event_id));
create policy "reactions insert own" on public.event_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_event(event_id));
create policy "reactions update own" on public.event_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_event(event_id));
create policy "reactions delete own" on public.event_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- event_overrides ----------
-- Read: events I can access (was `true`). Write: unchanged (event creator).
create policy event_overrides_select on public.event_overrides
  for select to authenticated
  using (public.can_access_event(event_id));
create policy event_overrides_modify on public.event_overrides
  for all to authenticated
  using (exists (select 1 from public.events e
                  where e.event_id = event_overrides.event_id and e.created_by = auth.uid()))
  with check (exists (select 1 from public.events e
                       where e.event_id = event_overrides.event_id and e.created_by = auth.uid()));

-- ---------- privileges ----------
-- anon (no login) gets nothing in public.
revoke all on all tables in schema public from anon;
-- … and nothing on objects created later. This changes the default privileges of the role
-- running the migration (postgres, as in the SQL Editor); objects created by
-- supabase_admin keep that role's own defaults.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- New functions are also no longer executable by PUBLIC (which includes anon). That grant
-- is a built-in GLOBAL default, and a per-schema REVOKE cannot remove a globally granted
-- privilege (PostgreSQL docs, ALTER DEFAULT PRIVILEGES), so this one is global, for the
-- running role. authenticated and service_role keep EXECUTE on new functions in public
-- through the schema-level defaults.
alter default privileges revoke execute on functions from public;

-- profiles: hidden columns (ical_token, paddle_customer_id, plan, tier, always_free) are
-- neither readable nor writable by users; total_xp and email are readable, not writable.
revoke select, update on public.profiles from authenticated;
grant select (user_id, username, bio, avatar_url, created_at, updated_at, email,
              email_digest_enabled, city, notification_prefs, has_completed_onboarding,
              searchable, total_xp)
  on public.profiles to authenticated;
grant update (username, bio, avatar_url, updated_at, email_digest_enabled, city,
              notification_prefs, has_completed_onboarding, searchable)
  on public.profiles to authenticated;

-- profiles_groups: a member may change only their invite status and colour (no
-- self-promotion through `role`).
revoke update on public.profiles_groups from authenticated;
grant update (invite_status, color) on public.profiles_groups to authenticated;

-- =========================== ROLLBACK ==========================
-- Restores the state of 2026-11-02 before this migration exactly (policies dumped
-- verbatim from pg_policies; privileges from pg_class.relacl, which were
-- arwdDxtm = ALL for anon and authenticated on all 28 public tables, with no column
-- grants; postgres's default privileges in public granting ALL on tables, sequences and
-- functions to anon and no global default-privilege entries; no trigger on events;
-- is_group_member as defined before). Kept commented so pasting the whole file
-- never undoes the forward section; uncomment (strip the leading `-- `) and paste it.
--
-- drop policy if exists "profiles read self or shared"  on public.profiles;
-- drop policy if exists "profiles insert own"           on public.profiles;
-- drop policy if exists "profiles update own"           on public.profiles;
-- drop policy if exists "memberships read own groups"   on public.profiles_groups;
-- drop policy if exists "memberships update own"        on public.profiles_groups;
-- drop policy if exists "memberships delete own"        on public.profiles_groups;
-- drop policy if exists "groups read with a row"        on public.groups;
-- drop policy if exists "groups update admin"           on public.groups;
-- drop policy if exists "groups delete admin"           on public.groups;
-- drop policy if exists "events select"                 on public.events;
-- drop policy if exists "events insert own"             on public.events;
-- drop policy if exists "events update manager"         on public.events;
-- drop policy if exists "events delete manager"         on public.events;
-- drop policy if exists "rsvps read accessible"         on public.profiles_events;
-- drop policy if exists "rsvps insert"                  on public.profiles_events;
-- drop policy if exists "rsvps update"                  on public.profiles_events;
-- drop policy if exists "rsvps delete"                  on public.profiles_events;
-- drop policy if exists "comments read accessible"      on public.event_comments;
-- drop policy if exists "comments insert own"           on public.event_comments;
-- drop policy if exists "comments delete own"           on public.event_comments;
-- drop policy if exists "reactions read accessible"     on public.event_reactions;
-- drop policy if exists "reactions insert own"          on public.event_reactions;
-- drop policy if exists "reactions update own"          on public.event_reactions;
-- drop policy if exists "reactions delete own"          on public.event_reactions;
-- drop policy if exists event_overrides_select          on public.event_overrides;
-- drop policy if exists event_overrides_modify          on public.event_overrides;
--
-- create policy "own comments delete" on public.event_comments as PERMISSIVE for DELETE to public
--   using ((auth.uid() = user_id));
-- create policy "own comments write" on public.event_comments as PERMISSIVE for INSERT to public
--   with check ((auth.uid() = user_id));
-- create policy "participants read comments" on public.event_comments as PERMISSIVE for SELECT to public
--   using (((EXISTS ( SELECT 1
--    FROM profiles_events pe
--   WHERE ((pe.event_id = event_comments.event_id) AND (pe.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
--    FROM (events e
--      JOIN profiles_groups pg ON ((e.groups_id = pg.groups_id)))
--   WHERE ((e.event_id = event_comments.event_id) AND (pg.user_id = auth.uid()) AND (pg.invite_status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
--    FROM events e
--   WHERE ((e.event_id = event_comments.event_id) AND (e.created_by = auth.uid()))))));
-- create policy event_overrides_modify on public.event_overrides as PERMISSIVE for ALL to authenticated
--   using ((EXISTS ( SELECT 1
--    FROM events e
--   WHERE ((e.event_id = event_overrides.event_id) AND (e.created_by = auth.uid())))))
--   with check ((EXISTS ( SELECT 1
--    FROM events e
--   WHERE ((e.event_id = event_overrides.event_id) AND (e.created_by = auth.uid())))));
-- create policy event_overrides_select on public.event_overrides as PERMISSIVE for SELECT to authenticated
--   using (true);
-- create policy "members react" on public.event_reactions as PERMISSIVE for ALL to public
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- create policy "events delete" on public.events as PERMISSIVE for DELETE to public
--   using ((((groups_id IS NOT NULL) AND is_group_member((groups_id)::bigint)) OR ((groups_id IS NULL) AND (auth.uid() IN ( SELECT profiles_events.user_id
--    FROM profiles_events
--   WHERE (profiles_events.event_id = events.event_id))))));
-- create policy "events insert" on public.events as PERMISSIVE for INSERT to public
--   with check ((auth.uid() IS NOT NULL));
-- create policy "events select" on public.events as PERMISSIVE for SELECT to public
--   using ((((groups_id IS NOT NULL) AND is_group_member((groups_id)::bigint)) OR ((groups_id IS NULL) AND ((created_by = auth.uid()) OR (auth.uid() IN ( SELECT profiles_events.user_id
--    FROM profiles_events
--   WHERE (profiles_events.event_id = events.event_id)))))));
-- create policy "events update" on public.events as PERMISSIVE for UPDATE to public
--   using ((((groups_id IS NOT NULL) AND is_group_member((groups_id)::bigint)) OR ((groups_id IS NULL) AND (auth.uid() IN ( SELECT profiles_events.user_id
--    FROM profiles_events
--   WHERE (profiles_events.event_id = events.event_id))))));
-- create policy "authenticated create group" on public.groups as PERMISSIVE for INSERT to public
--   with check ((auth.uid() IS NOT NULL));
-- create policy "group members delete" on public.groups as PERMISSIVE for DELETE to public
--   using (is_group_member((groups_id)::bigint));
-- create policy "group members select" on public.groups as PERMISSIVE for SELECT to public
--   using (is_group_member((groups_id)::bigint));
-- create policy "group members update" on public.groups as PERMISSIVE for UPDATE to public
--   using (is_group_member((groups_id)::bigint));
-- create policy "Public profiles viewable by everyone" on public.profiles as PERMISSIVE for SELECT to public
--   using (true);
-- create policy "Users can insert own profile" on public.profiles as PERMISSIVE for INSERT to public
--   with check ((auth.uid() = user_id));
-- create policy "Users can update own profile" on public.profiles as PERMISSIVE for UPDATE to public
--   using ((auth.uid() = user_id));
-- create policy "authenticated view rsvps" on public.profiles_events as PERMISSIVE for SELECT to public
--   using ((auth.uid() IS NOT NULL));
-- create policy "own rsvp delete" on public.profiles_events as PERMISSIVE for DELETE to public
--   using ((auth.uid() = user_id));
-- create policy "rsvp insert" on public.profiles_events as PERMISSIVE for INSERT to public
--   with check (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
--    FROM events e
--   WHERE ((e.event_id = profiles_events.event_id) AND (e.groups_id IS NOT NULL) AND is_group_member((e.groups_id)::bigint))))));
-- create policy "rsvp update" on public.profiles_events as PERMISSIVE for UPDATE to public
--   using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
--    FROM events e
--   WHERE ((e.event_id = profiles_events.event_id) AND (e.groups_id IS NOT NULL) AND is_group_member((e.groups_id)::bigint))))));
-- create policy "authenticated view memberships" on public.profiles_groups as PERMISSIVE for SELECT to public
--   using ((auth.uid() IS NOT NULL));
-- create policy "own membership delete" on public.profiles_groups as PERMISSIVE for DELETE to public
--   using ((auth.uid() = user_id));
-- create policy "own membership insert" on public.profiles_groups as PERMISSIVE for INSERT to public
--   with check ((auth.uid() = user_id));
-- create policy "own membership update" on public.profiles_groups as PERMISSIVE for UPDATE to public
--   using ((auth.uid() = user_id));
--
-- create or replace function public.is_group_member(gid bigint)
--  returns boolean
--  language sql
--  stable security definer
--  set search_path to 'public'
-- as $function$
--   SELECT EXISTS (
--     SELECT 1 FROM public.profiles_groups
--     WHERE groups_id = gid AND user_id = auth.uid()
--   );
-- $function$;
-- drop function if exists public.can_manage_event(bigint);
-- drop function if exists public.can_access_event(bigint);
-- drop function if exists public.has_group_row(bigint);
-- drop function if exists public.is_group_admin(bigint);
--
-- revoke select (user_id, username, bio, avatar_url, created_at, updated_at, email,
--                email_digest_enabled, city, notification_prefs, has_completed_onboarding,
--                searchable, total_xp)
--   on public.profiles from authenticated;
-- revoke update (username, bio, avatar_url, updated_at, email_digest_enabled, city,
--                notification_prefs, has_completed_onboarding, searchable)
--   on public.profiles from authenticated;
-- revoke update (invite_status, color) on public.profiles_groups from authenticated;
-- grant all on public.profiles, public.profiles_groups to authenticated;
-- grant all on all tables in schema public to anon;
-- alter default privileges in schema public grant all on tables    to anon;
-- alter default privileges in schema public grant all on sequences to anon;
-- alter default privileges in schema public grant all on functions to anon;
-- alter default privileges grant execute on functions to public;
--
-- drop trigger if exists events_created_by_immutable on public.events;
-- drop function if exists public.events_created_by_immutable();
