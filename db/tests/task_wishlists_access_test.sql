-- Historical test: only valid before 2026-11-04_remove_task_wishlists.sql.
-- Run migration + this file inside BEGIN ... ROLLBACK.
-- TASK_WISHLISTS_ACCESS_OK is the intentional final exception; all rows roll back.
do $$
declare
  a uuid := '27e2f0e9-1cac-45a5-a9d2-2744b7eb386a';
  m uuid := 'f4ba23cc-a139-4fa3-ad86-f01e1b877eb7';
  p uuid := 'e2fd2f84-e186-4a4b-967a-e466e7b9e9f3';
  s uuid := 'd0f2154a-a331-4709-9bd8-a2b87fe960c7';
  g integer; tl integer; t public.task; lid bigint; iid bigint; n integer; denied boolean;
begin
  insert into public.groups(groups_title) values('ZZ task wishlist test') returning groups_id into g;
  insert into public.profiles_groups(user_id,groups_id,role,invite_status) values
    (a,g,'admin','accepted'),(m,g,'member','accepted'),(p,g,'member','pending');
  insert into public.task_list(task_list_title,groups_id) values('ZZ gifts',g) returning task_list_id into tl;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  select * into t from public.create_task_with_wishlist(tl,'ZZ Christmas',null,'medium','2030-12-24',
    '[{"title":"Book","link":"https://example.com/book","note":"Hardcover"}]');
  select list_id into lid from public.lists where task_id=t.task_id;
  if lid is null then raise exception 'FAIL: task and wishlist created'; end if;
  select item_id into iid from public.list_items where list_id=lid;
  if iid is null then raise exception 'FAIL: initial gift created'; end if;
  -- A failing item rolls back the task and list, even if the caller catches the error.
  denied := false;
  begin
    perform public.create_task_with_wishlist(tl,'ZZ invalid gift',null,'medium',null,'[{"title":"Bad","link":"javascript:bad"}]');
  exception when check_violation then denied := true;
  end;
  if not denied or exists(select 1 from public.task where task_title='ZZ invalid gift') then
    raise exception 'FAIL: atomic creation';
  end if;
  reset role;

  perform set_config('request.jwt.claims',json_build_object('sub',m,'role','authenticated')::text,true);
  set local role authenticated;
  if not exists(select 1 from public.lists where list_id=lid) then raise exception 'FAIL: member reads'; end if;
  denied := false;
  begin
    insert into public.list_items(list_id,title) values(lid,'Intruder gift');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: guest cannot edit gifts'; end if;
  insert into public.list_item_claims(item_id) values(iid);
  if not exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: guest reserves'; end if;
  reset role;

  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: owner blind to claims'; end if;
  denied := false;
  begin
    update public.lists set task_id=null,event_id=(select event_id from public.events limit 1) where list_id=lid;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: immutable parent'; end if;
  denied := false;
  begin
    insert into public.lists(kind,title,task_id) values('wishlist','Duplicate',t.task_id);
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'FAIL: unique task wishlist'; end if;
  reset role;

  foreach s in array array[s,p] loop
    perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
    set local role authenticated;
    if exists(select 1 from public.lists where list_id=lid)
      or exists(select 1 from public.list_items where item_id=iid)
      or exists(select 1 from public.list_item_claims where item_id=iid) then
      raise exception 'FAIL: stranger/pending privacy';
    end if;
    denied := false;
    begin
      perform public.create_task_with_wishlist(tl,'ZZ forbidden',null,'medium',null,'[]');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: stranger/pending creation'; end if;
    reset role;
  end loop;
  delete from public.task where task_id=t.task_id;
  if exists(select 1 from public.lists where list_id=lid)
    or exists(select 1 from public.list_items where item_id=iid)
    or exists(select 1 from public.list_item_claims where item_id=iid) then raise exception 'FAIL: cascade'; end if;
  raise exception 'TASK_WISHLISTS_ACCESS_OK';
end $$;
