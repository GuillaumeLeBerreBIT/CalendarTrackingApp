-- Lists access (RLS) test — 2026-11-03. Checks db/migrations/2026-11-03_lists.sql.
--
-- One DO block that seeds throwaway rows, acts as real users through PostgREST's
-- mechanism (role `authenticated` + the JWT `sub` claim) and asserts what each may do.
-- It always ends in an exception, so everything it did is rolled back:
--   'LISTS_ACCESS_OK'  every assertion passed
--   'FAIL: <name>'     the first assertion that did not hold
--
-- Actors are existing profiles (same four as db/tests/access_rules_test.sql; they must
-- exist, and S must share no group or event with A or M, which is checked first):
--   A  admin of G      M  member of G      P  pending invitee of G      S  stranger
--
-- Seeds: group G (A admin, M member, P pending); group event E (A, in G); personal event
-- PE (A, M RSVP'd); A's group shopping list SL in G with one item; A's personal shopping
-- list PL with one item; M's wishlist W on E with items W1, W2.
--
-- ALWAYS run it wrapped in begin … rollback. The block deletes the actors' existing
-- memberships and RSVPs (see "isolate the actors") and relies on that wrapper, and on its
-- own always-raised exception, to undo everything. How to run:
--   begin;
--   <FORWARD section of db/migrations/2026-11-03_lists.sql, if not applied yet>
--   <this file>
--   rollback;
-- Then check nothing persisted:
--   select count(*) from groups where groups_title like '%ZZ lists test%';  -- 0

do $$
declare
  a uuid := '27e2f0e9-1cac-45a5-a9d2-2744b7eb386a';
  m uuid := 'f4ba23cc-a139-4fa3-ad86-f01e1b877eb7';
  p uuid := 'e2fd2f84-e186-4a4b-967a-e466e7b9e9f3';
  s uuid := 'd0f2154a-a331-4709-9bd8-a2b87fe960c7';
  g int;
  e int;
  pe int;
  sl bigint;
  slm bigint;
  sli bigint;
  pl bigint;
  w bigint;
  w1 bigint;
  w2 bigint;
  n int;
  raised boolean;
begin
  -- ---------- isolate the actors (as owner) ----------
  -- Real profiles share real groups and events, which would make "stranger" checks
  -- meaningless. Remove every existing membership and RSVP of the four actors for the
  -- duration of the block. This is undone by the exception every run ends in
  -- (LISTS_ACCESS_OK or FAIL) and by the surrounding begin … rollback.
  delete from profiles_groups where user_id in (a, m, p, s);
  delete from profiles_events where user_id in (a, m, p, s);

  -- ---------- preconditions (as owner; guards for the isolation above) ----------
  if (select count(*) from profiles where user_id in (a, m, p, s)) <> 4 then
    raise exception 'FAIL: precondition: actor profiles missing';
  end if;
  if exists (select 1 from profiles_groups x join profiles_groups y using (groups_id)
              where x.user_id = a and y.user_id = s)
     or exists (select 1 from profiles_events x join profiles_events y using (event_id)
                 where x.user_id = a and y.user_id = s)
     or exists (select 1 from events ev join profiles_events x using (event_id)
                 where (ev.created_by = a and x.user_id = s) or (ev.created_by = s and x.user_id = a)) then
    raise exception 'FAIL: precondition: S already shares a group or event with A';
  end if;
  if exists (select 1 from profiles_groups x join profiles_groups y using (groups_id)
              where x.user_id = m and y.user_id = s)
     or exists (select 1 from profiles_events x join profiles_events y using (event_id)
                 where x.user_id = m and y.user_id = s)
     or exists (select 1 from events ev join profiles_events x using (event_id)
                 where (ev.created_by = m and x.user_id = s) or (ev.created_by = s and x.user_id = m)) then
    raise exception 'FAIL: precondition: S already shares a group or event with M';
  end if;

  -- ---------- seed (as owner) ----------
  insert into groups (groups_title, groups_description)
    values ('ZZ lists test', 'throwaway, rolled back') returning groups_id into g;
  insert into profiles_groups (user_id, groups_id, role, invite_status) values
    (a, g, 'admin', 'accepted'),
    (m, g, 'member', 'accepted'),
    (p, g, 'member', 'pending');
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ E', '2030-01-01', '2030-01-01', g, a) returning event_id into e;
  insert into events (event_title, start_date, end_date, groups_id, created_by)
    values ('ZZ PE', '2030-01-02', '2030-01-02', null, a) returning event_id into pe;
  insert into profiles_events (user_id, event_id, rsvp_status) values
    (a, e, 'going'), (a, pe, 'going'), (m, pe, 'going');
  insert into lists (kind, title, created_by, groups_id)
    values ('shopping', 'ZZ SL', a, g) returning list_id into sl;
  insert into list_items (list_id, title, created_by) values (sl, 'ZZ milk', a) returning item_id into sli;
  insert into lists (kind, title, created_by, groups_id)
    values ('shopping', 'ZZ SLM', m, g) returning list_id into slm;
  insert into lists (kind, title, created_by)
    values ('shopping', 'ZZ PL', a) returning list_id into pl;
  insert into list_items (list_id, title, created_by) values (pl, 'ZZ secret', a);
  insert into lists (kind, title, created_by, event_id)
    values ('wishlist', 'ZZ W', m, e) returning list_id into w;
  insert into list_items (list_id, title, created_by, link)
    values (w, 'ZZ W1', m, 'https://example.com/w1') returning item_id into w1;
  insert into list_items (list_id, title, created_by) values (w, 'ZZ W2', m) returning item_id into w2;

  -- ---------- group shopping list: members only ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = sl;
  if n <> 1 then raise exception 'FAIL: member sees group list (M reads SL: % rows)', n; end if;
  select count(*) into n from list_items where list_id = sl;
  if n <> 1 then raise exception 'FAIL: member sees group list items (M reads % items of SL)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = sl;
  if n <> 0 then raise exception 'FAIL: stranger cannot see group list (S reads SL: % rows)', n; end if;
  select count(*) into n from list_items where list_id = sl;
  if n <> 0 then raise exception 'FAIL: stranger cannot see group list items (S reads % items)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = sl;
  if n <> 0 then raise exception 'FAIL: pending invitee cannot see group list (P reads SL: % rows)', n; end if;
  reset role;

  -- ---------- personal shopping list: creator only ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = pl;
  if n <> 0 then raise exception 'FAIL: personal list is creator-only (M reads PL: % rows)', n; end if;
  select count(*) into n from list_items where list_id = pl;
  if n <> 0 then raise exception 'FAIL: personal list is creator-only (M reads % items of PL)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = pl;
  if n <> 1 then raise exception 'FAIL: creator sees personal list (A reads PL: % rows)', n; end if;
  select count(*) into n from list_items where list_id = pl;
  if n <> 1 then raise exception 'FAIL: creator sees personal list items (A reads % items)', n; end if;
  reset role;

  -- ---------- group shopping list: members edit items ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into list_items (list_id, title) values (sl, 'ZZ bread');
  update list_items set is_done = true where list_id = sl and title = 'ZZ bread';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: member ticks group list item (M is_done: % rows)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into list_items (list_id, title) values (sl, 'ZZ intruder');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: stranger cannot add to group list (S inserted into SL)'; end if;
  update list_items set is_done = true where list_id = sl;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger cannot tick group list (S updated % rows)', n; end if;
  reset role;

  -- ---------- creating lists ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into lists (kind, title, groups_id) values ('shopping', 'ZZ intruder list', g);
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: stranger cannot create a list in G'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into lists (kind, title, created_by, groups_id) values ('shopping', 'ZZ forged', a, g);
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: cannot create a list as someone else (M as A)'; end if;
  reset role;

  -- ---------- wishlist: visible to event guests ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = w;
  if n <> 1 then raise exception 'FAIL: guest sees wishlist (A reads W: % rows)', n; end if;
  select count(*) into n from list_items where list_id = w;
  if n <> 2 then raise exception 'FAIL: guest sees wishlist items (A reads % items)', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from lists where list_id = w;
  if n <> 0 then raise exception 'FAIL: stranger cannot see wishlist (S reads W: % rows)', n; end if;
  select count(*) into n from list_items where list_id = w;
  if n <> 0 then raise exception 'FAIL: stranger cannot see wishlist items (S reads % items)', n; end if;
  reset role;

  -- ---------- wishlist: only the owner edits items ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    insert into list_items (list_id, title) values (w, 'ZZ A wish');
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: guest cannot add to wishlist (A inserted into W)'; end if;
  update list_items set title = 'ZZ renamed by A' where item_id = w1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: guest cannot edit wishlist items (A updated W1)'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into list_items (list_id, title) values (w, 'ZZ W3');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner adds to wishlist (M inserting into W: % rows)', n; end if;
  reset role;

  -- ---------- claims ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into list_item_claims (item_id) values (w1);
  select count(*) into n from list_item_claims where item_id = w1 and claimed_by = a;
  if n <> 1 then raise exception 'FAIL: guest claims an item (A reads own claim on W1: % rows)', n; end if;
  raised := false;
  begin
    insert into list_item_claims (item_id, claimed_by) values (w2, s);
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: nobody claims for someone else (A claimed W2 as S)'; end if;
  reset role;

  -- Another guest: P accepts the invite, so P is a member of G and sees E's wishlist.
  update profiles_groups set invite_status = 'accepted' where groups_id = g and user_id = p;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from list_item_claims where item_id = w1;
  if n <> 1 then raise exception 'FAIL: other guests see an item is taken (P reads % claims on W1)', n; end if;
  raised := false;
  begin
    insert into list_item_claims (item_id) values (w1);
  exception when unique_violation then raised := true;
  end;
  if not raised then raise exception 'FAIL: one claim per item (P claimed W1 too)'; end if;
  delete from list_item_claims where item_id = w1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: only the claimer unclaims (P deleted A''s claim)'; end if;
  reset role;

  -- ---------- the wishlist owner is blind to claims ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from list_item_claims where item_id = w1;
  if n <> 0 then raise exception 'FAIL: owner is blind to claims (M reads % claims on W1)', n; end if;
  select count(*) into n from list_item_claims;
  if n <> 0 then raise exception 'FAIL: owner is blind to claims (M reads % claims in all)', n; end if;
  raised := false;
  begin
    insert into list_item_claims (item_id) values (w2);
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: owner cannot claim own wish (M claimed W2)'; end if;
  delete from list_item_claims where item_id = w1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: only the claimer unclaims (M deleted A''s claim)'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from list_item_claims where item_id = w1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: claimer unclaims (A deleting own claim: % rows)', n; end if;
  reset role;

  -- ---------- immutable columns ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    update lists set kind = 'shopping' where list_id = w;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: lists.kind is immutable (M changed W''s kind)'; end if;
  raised := false;
  begin
    update lists set event_id = pe where list_id = w;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: lists.event_id is immutable (M moved W to PE)'; end if;
  update lists set title = 'ZZ W (renamed)' where list_id = w;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner renames wishlist (M renaming W: % rows)', n; end if;
  -- M owns W and can edit SL's items, so RLS allows moving SL's item into W: only the
  -- trigger stops it.
  raised := false;
  begin
    update list_items set list_id = w where item_id = sli;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: list_items.list_id is immutable (M moved SL''s item into W)'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raised := false;
  begin
    update lists set groups_id = null where list_id = sl;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: lists.groups_id is immutable (A made SL personal)'; end if;
  -- A is admin of G, so RLS allows A to update M's group list SLM (and the new row
  -- passes the policy): only the trigger stops the change of creator.
  raised := false;
  begin
    update lists set created_by = a where list_id = slm;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: lists.created_by is immutable (admin A took M''s SLM)'; end if;

  -- ---------- one wishlist per event ----------
  raised := false;
  begin
    insert into lists (kind, title, event_id) values ('wishlist', 'ZZ second W', e);
  exception when unique_violation then raised := true;
  end;
  if not raised then raise exception 'FAIL: one wishlist per event (A added a second on E)'; end if;
  reset role;

  -- ---------- anon has nothing ----------
  set local role anon;
  raised := false;
  begin
    select count(*) into n from lists;
  exception when insufficient_privilege then raised := true;
  end;
  if not raised then raise exception 'FAIL: anon has nothing (anon read lists)'; end if;
  reset role;
  if has_table_privilege('anon', 'public.lists', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.list_items', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.list_item_claims', 'select, insert, update, delete') then
    raise exception 'FAIL: anon has nothing (anon holds a privilege on a lists table)';
  end if;

  raise exception 'LISTS_ACCESS_OK';
end
$$;
