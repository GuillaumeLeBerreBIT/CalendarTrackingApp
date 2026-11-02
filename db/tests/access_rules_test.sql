-- Access-rules (RLS) test — 2026-11-02. Checks db/migrations/2026-11-02_access_rules.sql.
--
-- One DO block that seeds throwaway rows, acts as real users through PostgREST's
-- mechanism (role `authenticated` + the JWT `sub` claim) and asserts what each may do.
-- It always ends in an exception, so everything it did is rolled back:
--   'ACCESS_RULES_OK'  every assertion passed
--   'FAIL: <name>'     the first assertion that did not hold
--
-- Actors are existing profiles (they must exist; nothing else about them is assumed,
-- except that A and S share no group or event, which is checked first):
--   A  admin of G      M  member of G      P  pending invitee of G      S  stranger
--
-- How to run, against today's database, without persisting anything:
--   begin;
--   <FORWARD section of the migration, if testing the new rules>
--   <this file>
--   rollback;
-- Then check nothing persisted:
--   select count(*) from groups where groups_title like '%ZZ access-rules test%';  -- 0
--   select to_regclass('public.zz_access_rules_probe');                             -- null
--   select to_regprocedure('public.zz_access_rules_probe_fn()');                    -- null

do $$
declare
  a uuid := '27e2f0e9-1cac-45a5-a9d2-2744b7eb386a';
  m uuid := 'f4ba23cc-a139-4fa3-ad86-f01e1b877eb7';
  p uuid := 'e2fd2f84-e186-4a4b-967a-e466e7b9e9f3';
  s uuid := 'd0f2154a-a331-4709-9bd8-a2b87fe960c7';
  g int;
  e_a int;
  e_m int;
  pe int;
  ics int;
  s_ev int;
  n int;
  v text;
  raised boolean;
begin
  -- ---------- preconditions (as owner) ----------
  if (select count(*) from profiles where user_id in (a, m, p, s)) <> 4 then
    raise exception 'FAIL: precondition: actor profiles missing';
  end if;
  if exists (select 1 from profiles_groups x join profiles_groups y using (groups_id)
              where x.user_id = a and y.user_id = s)
     or exists (select 1 from profiles_events x join profiles_events y using (event_id)
                 where x.user_id = a and y.user_id = s)
     or exists (select 1 from events e join profiles_events x using (event_id)
                 where (e.created_by = a and x.user_id = s) or (e.created_by = s and x.user_id = a)) then
    raise exception 'FAIL: precondition: S already shares a group or event with A';
  end if;
  if exists (select 1 from profiles_groups x join profiles_groups y using (groups_id)
              where x.user_id = m and y.user_id = s)
     or exists (select 1 from profiles_events x join profiles_events y using (event_id)
                 where x.user_id = m and y.user_id = s)
     or exists (select 1 from events e join profiles_events x using (event_id)
                 where (e.created_by = m and x.user_id = s) or (e.created_by = s and x.user_id = m)) then
    raise exception 'FAIL: precondition: S already shares a group or event with M';
  end if;

  -- ---------- seed (as owner) ----------
  insert into groups (groups_title, groups_description)
    values ('ZZ access-rules test', 'throwaway, rolled back') returning groups_id into g;
  insert into profiles_groups (user_id, groups_id, role, invite_status) values
    (a, g, 'admin', 'accepted'),
    (m, g, 'member', 'accepted'),
    (p, g, 'member', 'pending');
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ E_A', '2030-01-01', '2030-01-01', g, a) returning event_id into e_a;
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ E_M', '2030-01-02', '2030-01-02', g, m) returning event_id into e_m;
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ PE', '2030-01-03', '2030-01-03', null, a) returning event_id into pe;
  insert into profiles_events (user_id, event_id, rsvp_status) values
    (a, e_a, 'going'), (m, e_m, 'going'), (a, pe, 'going'), (m, pe, 'pending');
  insert into event_overrides (event_id, occurrence_date, is_cancelled)
    values (e_a, '2030-01-08', true);

  -- ---------- stranger cannot read profiles ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where user_id = a;
  if n <> 0 then raise exception 'FAIL: stranger cannot read profiles (S sees A: % rows)', n; end if;
  select count(*) into n from profiles_groups where groups_id = g;
  if n <> 0 then raise exception 'FAIL: stranger cannot read memberships (% rows)', n; end if;
  select count(*) into n from profiles_events where event_id = e_a;
  if n <> 0 then raise exception 'FAIL: stranger cannot read RSVPs (S reads % rows of E_A)', n; end if;
  select count(*) into n from event_overrides where event_id = e_a;
  if n <> 0 then raise exception 'FAIL: stranger cannot read overrides (S reads % rows of E_A)', n; end if;
  -- S invites A to S's own event: an invite alone does not reveal A.
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ S bait', '2030-01-06', '2030-01-06', null, s) returning event_id into s_ev;
  insert into profiles_events (user_id, event_id, rsvp_status) values
    (s, s_ev, 'going'), (a, s_ev, 'pending');
  select count(*) into n from profiles where user_id = a;
  if n <> 0 then raise exception 'FAIL: stranger cannot read profiles (S invited A, then sees A: % rows)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where user_id = a and username is not null and email is not null;
  if n <> 1 then raise exception 'FAIL: stranger cannot read profiles (M reading A: % rows)', n; end if;
  reset role;

  -- ---------- hidden columns ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    select ical_token into v from profiles where user_id = a;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: hidden columns (A read own ical_token)'; end if;
  raised := false;
  begin
    update profiles set total_xp = 999999 where user_id = a;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: hidden columns (A wrote own total_xp)'; end if;
  raised := false;
  begin
    update profiles set plan = 'plus' where user_id = a;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: hidden columns (A wrote own plan)'; end if;
  raised := false;
  begin
    update profiles set ical_token = 'zz-forged' where user_id = a;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: hidden columns (A wrote own ical_token)'; end if;
  update profiles set city = city where user_id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: hidden columns (A cannot update own city: % rows)', n; end if;
  reset role;

  -- ---------- no self-join ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into profiles_groups (groups_id, user_id, role, invite_status) values (g, s, 'admin', 'accepted');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: no self-join'; end if;
  reset role;

  -- ---------- no self-promotion ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    update profiles_groups set role = 'admin' where groups_id = g and user_id = m;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: no self-promotion (M set own role)'; end if;
  update profiles_groups set color = '#123456' where groups_id = g and user_id = m;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: no self-promotion (M own color: % rows)', n; end if;
  update profiles_groups set color = '#123456' where groups_id = g and user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: no self-promotion (M changed A''s color: % rows)', n; end if;
  reset role;

  -- ---------- pending invitee sees group name only ----------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from groups where groups_id = g;
  if n <> 1 then raise exception 'FAIL: pending invitee sees group name only (P reads G: % rows)', n; end if;
  select count(*) into n from events where groups_id = g;
  if n <> 0 then raise exception 'FAIL: pending invitee sees group name only (P reads % events of G)', n; end if;
  update profiles_groups set invite_status = 'accepted' where groups_id = g and user_id = p;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: pending invitee sees group name only (P accepting: % rows)', n; end if;
  reset role;

  -- ---------- only admins change groups ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update groups set groups_title = 'ZZ access-rules test (M)' where groups_id = g;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: only admins change groups (M updated G)'; end if;
  delete from groups where groups_id = g;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: only admins change groups (M deleted G)'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update groups set groups_title = 'ZZ access-rules test (A)' where groups_id = g;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: only admins change groups (A updating G: % rows)', n; end if;
  raised := false;
  begin
    insert into groups (groups_title) values ('ZZ access-rules test (insert)');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: only admins change groups (user inserted a group)'; end if;
  reset role;

  -- ---------- events in foreign group ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into events (event_title, start_date, end_date, groups_id, created_by)
      values ('ZZ intruder', '2030-01-04', '2030-01-04', g, s);
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: events in foreign group'; end if;
  reset role;

  -- ---------- group admin manages member event ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update events set event_title = 'ZZ E_M (edited by A)' where event_id = e_m;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: group admin manages member event (A updating E_M: % rows)', n; end if;
  raised := false;
  begin
    update events set created_by = m where event_id = e_a;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: created_by is immutable (A gave E_A to M)'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update events set event_title = 'ZZ E_A (edited by M)' where event_id = e_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: group admin manages member event (M updated E_A)'; end if;
  delete from events where event_id = e_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: group admin manages member event (M deleted E_A)'; end if;
  reset role;

  -- ---------- creator invites participants ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into profiles_events (user_id, event_id, rsvp_status) values (s, e_a, 'pending');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: creator invites participants (M added S to E_A)'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into profiles_events (user_id, event_id, rsvp_status) values (s, pe, 'pending');
  -- Group admin editing a member's event adds participants (PUT /parseEvent/:id).
  insert into profiles_events (user_id, event_id, rsvp_status) values (p, e_m, 'pending');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into profiles_events (user_id, event_id, rsvp_status) values (s, e_a, 'going');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: creator invites participants (S joined E_A)'; end if;
  -- S was invited to PE: can RSVP on it.
  update profiles_events set rsvp_status = 'going' where user_id = s and event_id = pe;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: creator invites participants (S RSVP on PE: % rows)', n; end if;
  update profiles_events set rsvp_status = 'no' where user_id = m and event_id = pe;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: creator invites participants (S changed M''s RSVP)'; end if;
  -- Having answered on PE, S sees PE's creator A, but not M, who is still pending on it.
  select count(*) into n from profiles where user_id = a;
  if n <> 1 then raise exception 'FAIL: event co-participants (S on PE reading creator A: % rows)', n; end if;
  select count(*) into n from profiles where user_id = m;
  if n <> 0 then raise exception 'FAIL: event co-participants (S on PE reads pending M: % rows)', n; end if;
  reset role;

  -- ---------- ics import as self ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ imported', '2030-01-05', '2030-01-05', null, s) returning event_id into ics;
  insert into profiles_events (user_id, event_id, rsvp_status) values (s, ics, 'going');
  reset role;

  -- ---------- comments need access ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into event_comments (event_id, user_id, body) values (e_a, s, 'ZZ intruder');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: comments need access (S commented on E_A)'; end if;
  raised := false;
  begin
    insert into event_reactions (event_id, user_id, emoji) values (e_a, s, 'x');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: comments need access (S reacted on E_A)'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into event_comments (event_id, user_id, body) values (e_a, m, 'ZZ hello');
  insert into event_reactions (event_id, user_id, emoji) values (e_a, m, 'x');
  select count(*) into n from event_comments where event_id = e_a;
  if n <> 1 then raise exception 'FAIL: comments need access (M reads % comments)', n; end if;
  reset role;

  -- ---------- member reads co-member profiles ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles_groups pg join profiles pr on pr.user_id = pg.user_id
   where pg.groups_id = g and pr.username is not null;
  if n <> 3 then raise exception 'FAIL: member reads co-member profiles (% rows)', n; end if;
  reset role;

  -- ---------- anon has nothing ----------
  -- A table created now (as the role running this, e.g. postgres) gives anon nothing,
  -- and that role's default privileges in public no longer name anon.
  create table public.zz_access_rules_probe (id int);
  if has_table_privilege('anon', 'public.zz_access_rules_probe', 'select, insert, update, delete') then
    raise exception 'FAIL: anon has nothing (new table grants anon)';
  end if;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) x
              where d.defaclnamespace = 'public'::regnamespace
                and d.defaclrole = current_user::regrole
                and x.grantee = 'anon'::regrole) then
    raise exception 'FAIL: anon has nothing (default privileges still grant anon)';
  end if;
  create function public.zz_access_rules_probe_fn() returns int language sql as 'select 1';
  if has_function_privilege('anon', 'public.zz_access_rules_probe_fn()', 'execute') then
    raise exception 'FAIL: anon has nothing (new function executable by anon)';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'FAIL: anon has nothing (anon selects profiles)';
  end if;
  if exists (select 1 from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
                and has_table_privilege('anon', c.oid, 'select, insert, update, delete')) then
    raise exception 'FAIL: anon has nothing (anon holds a table privilege in public)';
  end if;

  raise exception 'ACCESS_RULES_OK';
end
$$;
