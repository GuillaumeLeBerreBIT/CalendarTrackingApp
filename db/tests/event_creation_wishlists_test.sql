-- Run both 2026-11-04 migrations + this file in BEGIN ... ROLLBACK.
-- EVENT_CREATION_WISHLISTS_OK intentionally raises, rolling back all test rows.
do $$
declare
  a uuid := '27e2f0e9-1cac-45a5-a9d2-2744b7eb386a';
  m uuid := 'f4ba23cc-a139-4fa3-ad86-f01e1b877eb7';
  p uuid := 'e2fd2f84-e186-4a4b-967a-e466e7b9e9f3';
  s uuid := 'd0f2154a-a331-4709-9bd8-a2b87fe960c7';
  g integer; ev public.events; pe public.events; lid bigint; iid bigint; payload jsonb; denied boolean;
begin
  insert into public.groups(groups_title) values('ZZ event creation wishlist test') returning groups_id into g;
  insert into public.profiles_groups(user_id,groups_id,role,invite_status) values
    (a,g,'admin','accepted'),(m,g,'member','accepted'),(p,g,'member','pending');
  payload := jsonb_build_object('event_title','ZZ Christmas','start_date','2030-12-24','end_date','2030-12-24',
    'all_day',true,'groups_id',g,'status','tentative','event_type','social','timezone','Europe/Brussels',
    'recurrence_rule','FREQ=YEARLY','reminder_minutes',15,'created_by',m);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  select * into ev from public.create_event_with_wishlist(payload,array[a,m,m],
    '[{"startDate":"2030-12-24"},{"startDate":"2030-12-25"}]',
    '[{"title":"Book","link":"https://example.com/book","note":"Hardcover"}]');
  if ev.created_by <> a or ev.timezone <> 'Europe/Brussels' or ev.recurrence_rule <> 'FREQ=YEARLY'
    or ev.reminder_minutes <> 15 then raise exception 'FAIL: event metadata or forged creator'; end if;
  if (select count(*) from public.profiles_events where event_id=ev.event_id) <> 2
    or not exists(select 1 from public.profiles_events where event_id=ev.event_id and user_id=a and rsvp_status='going')
    or not exists(select 1 from public.profiles_events where event_id=ev.event_id and user_id=m and rsvp_status='pending')
    then raise exception 'FAIL: invitations'; end if;
  if (select count(*) from public.event_date_options where event_id=ev.event_id) <> 2 then raise exception 'FAIL: candidate dates'; end if;
  select list_id into lid from public.lists where event_id=ev.event_id;
  select item_id into iid from public.list_items where list_id=lid;
  if iid is null then raise exception 'FAIL: wishlist gifts'; end if;
  denied := false;
  begin
    perform public.create_event_with_wishlist(payload || '{"event_title":"ZZ invalid event gift"}',array[m],
      '[{"startDate":"2030-12-24"}]','[{"title":"Bad","link":"javascript:bad"}]');
  exception when check_violation then denied := true;
  end;
  if not denied or exists(select 1 from public.events where event_title='ZZ invalid event gift') then raise exception 'FAIL: atomic gifts'; end if;
  denied := false;
  begin
    perform public.create_event_with_wishlist(payload || '{"event_title":"ZZ invalid event date"}',array[m],
      '[{"startDate":"bad"}]','[]');
  exception when invalid_datetime_format then denied := true;
  end;
  if not denied or exists(select 1 from public.events where event_title='ZZ invalid event date') then raise exception 'FAIL: atomic dates'; end if;
  -- Personal events retain participant access, without group membership.
  select * into pe from public.create_event_with_wishlist(payload || '{"groups_id":null,"status":"confirmed"}',array[m],'[]','[]');
  reset role;
  perform set_config('request.jwt.claims',json_build_object('sub',m,'role','authenticated')::text,true);
  set local role authenticated;
  if not exists(select 1 from public.lists where list_id=lid)
    or not exists(select 1 from public.lists where event_id=pe.event_id) then raise exception 'FAIL: guest reads'; end if;
  insert into public.list_item_claims(item_id) values(iid);
  if not exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: guest reserves'; end if;
  reset role;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: owner sees reservations'; end if;
  reset role;
  foreach s in array array[s,p] loop
    perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
    set local role authenticated;
    if exists(select 1 from public.lists where list_id=lid) then raise exception 'FAIL: stranger/pending reads'; end if;
    denied := false;
    begin
      perform public.create_event_with_wishlist(payload,'{}','[]','[]');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: stranger/pending creates group event'; end if;
    reset role;
  end loop;
  delete from public.events where event_id=ev.event_id;
  if exists(select 1 from public.lists where list_id=lid) or exists(select 1 from public.list_items where item_id=iid)
    or exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: event cascade'; end if;
  raise exception 'EVENT_CREATION_WISHLISTS_OK';
end $$;
