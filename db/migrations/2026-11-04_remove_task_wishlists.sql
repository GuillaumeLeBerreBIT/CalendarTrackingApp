-- Restore event-only wishlists. Refuse to discard any task wishlist data.
do $$ begin
  if exists(select 1 from public.lists where task_id is not null) then
    raise exception 'Task wishlists exist; preserve or migrate them before removing task support';
  end if;
end $$;
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

alter policy "lists read visible" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by));
alter policy "lists insert own" on public.lists
  with check (created_by = auth.uid() and public.list_visible(kind,groups_id,event_id,created_by));
alter policy "lists update owner or admin" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))))
  with check (public.list_visible(kind,groups_id,event_id,created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))));
alter policy "lists delete owner or admin" on public.lists
  using (public.list_visible(kind,groups_id,event_id,created_by)
    and (created_by = auth.uid() or (groups_id is not null and public.is_group_admin(groups_id))));
drop function public.create_task_with_wishlist(integer,text,text,text,date,jsonb);
drop function public.list_visible(text,bigint,bigint,uuid,integer);
alter table public.lists drop constraint lists_shopping_no_parent;
alter table public.lists drop constraint lists_wishlist_one_parent;
alter table public.lists drop column task_id;
alter table public.lists add constraint lists_shopping_no_event check(kind <> 'shopping' or event_id is null);
alter table public.lists add constraint lists_wishlist_on_event check(kind <> 'wishlist' or (event_id is not null and groups_id is null));
