-- Task wishlists. Depends on 2026-11-03_lists.sql.
alter table public.lists add column task_id integer references public.task(task_id) on delete cascade;
alter table public.lists drop constraint lists_shopping_no_event;
alter table public.lists drop constraint lists_wishlist_on_event;
alter table public.lists add constraint lists_shopping_no_parent
  check (kind <> 'shopping' or (event_id is null and task_id is null));
alter table public.lists add constraint lists_wishlist_one_parent
  check (kind <> 'wishlist' or (groups_id is null and num_nonnulls(event_id, task_id) = 1));
create unique index lists_one_wishlist_per_task on public.lists(task_id) where task_id is not null;

create function public.list_visible(k text, gid bigint, eid bigint, owner uuid, tid integer)
returns boolean language sql stable security definer set search_path = public as $$
  select case when k = 'wishlist' and tid is not null then exists (
    select 1 from public.task t join public.task_list tl using (task_list_id)
    where t.task_id = tid and public.is_group_member(tl.groups_id::bigint)
  ) else public.list_visible(k, gid, eid, owner) end;
$$;
revoke execute on function public.list_visible(text,bigint,bigint,uuid,integer) from public, anon;
grant execute on function public.list_visible(text,bigint,bigint,uuid,integer) to authenticated;

create or replace function public.can_see_list(lid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lists l where l.list_id = lid
    and public.list_visible(l.kind,l.groups_id,l.event_id,l.created_by,l.task_id));
$$;
create or replace function public.can_edit_list_items(lid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lists l where l.list_id = lid
    and public.can_see_list(lid) and (l.kind = 'shopping' or l.created_by = auth.uid()));
$$;
create or replace function public.can_claim_item(iid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.list_items i join public.lists l using (list_id)
    where i.item_id = iid and l.kind = 'wishlist' and l.created_by <> auth.uid()
    and public.can_see_list(l.list_id));
$$;

alter policy "lists read visible" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by,task_id));
alter policy "lists insert own" on public.lists
  with check (created_by = auth.uid() and public.list_visible(kind,groups_id,event_id,created_by,task_id));
alter policy "lists update owner or admin" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by,task_id)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))))
  with check (public.list_visible(kind,groups_id,event_id,created_by,task_id)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))));
alter policy "lists delete owner or admin" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by,task_id)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))));

create or replace function public.lists_immutable()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and (
    new.created_by is distinct from old.created_by or new.kind is distinct from old.kind
    or new.event_id is distinct from old.event_id or new.groups_id is distinct from old.groups_id
    or new.task_id is distinct from old.task_id) then
    raise exception 'List owner, kind and parent cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Invoker privileges preserve RLS. Any failure rolls back the task and wishlist.
create function public.create_task_with_wishlist(
  p_task_list_id integer, p_title text, p_description text, p_priority text,
  p_due_date date, p_items jsonb
) returns public.task language plpgsql security invoker set search_path = public as $$
declare
  result public.task;
  lid bigint;
begin
  if not exists (select 1 from public.task_list tl where tl.task_list_id = p_task_list_id
    and public.is_group_member(tl.groups_id::bigint)) then
    raise exception 'Not a group member' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_title), '') is null or length(p_title) > 200
    or p_priority not in ('low','medium','high') or p_priority is null
    or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid task or wishlist' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Max 100 wishlist items' using errcode = '22023';
  end if;
  insert into public.task(task_list_id,task_title,task_description,priority,due_date)
    values(p_task_list_id,btrim(p_title),p_description,p_priority,p_due_date) returning * into result;
  insert into public.lists(kind,title,task_id) values('wishlist','Wishlist',result.task_id) returning list_id into lid;
  insert into public.list_items(list_id,title,link,note)
    select lid, btrim(x->>'title'), nullif(btrim(x->>'link'),''), nullif(btrim(x->>'note'),'')
    from jsonb_array_elements(p_items) x;
  return result;
end;
$$;
revoke execute on function public.create_task_with_wishlist(integer,text,text,text,date,jsonb) from public, anon;
grant execute on function public.create_task_with_wishlist(integer,text,text,text,date,jsonb) to authenticated;
