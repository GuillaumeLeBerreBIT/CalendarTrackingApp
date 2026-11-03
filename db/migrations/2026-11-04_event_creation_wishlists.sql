-- Save a new event, invitations, candidate dates, wishlist and gifts atomically.
-- Invoker privileges retain RLS; creator IDs always come from the verified JWT.
create function public.create_event_with_wishlist(
  p_event jsonb, p_participants uuid[], p_options jsonb, p_items jsonb
) returns public.events language plpgsql security invoker set search_path = public as $$
declare
  ev public.events;
  result public.events;
  lid bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object'
    or p_items is null or jsonb_typeof(p_items) <> 'array'
    or p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'Invalid event or wishlist' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 or jsonb_array_length(p_options) > 6 then
    raise exception 'Too many gifts or candidate dates' using errcode = '22023';
  end if;
  select * into ev from jsonb_populate_record(null::public.events, p_event);
  if nullif(btrim(ev.event_title),'') is null then
    raise exception 'Give the event a title' using errcode = '22023';
  end if;
  insert into public.events(event_title,event_description,all_day,start_date,end_date,
    start_time,end_time,groups_id,created_by,location,image_url,event_type,
    recurrence_rule,reminder_minutes,status,timezone)
  values(btrim(ev.event_title),ev.event_description,ev.all_day,ev.start_date,ev.end_date,
    ev.start_time,ev.end_time,ev.groups_id,auth.uid(),ev.location,ev.image_url,
    coalesce(ev.event_type,'appointment'),ev.recurrence_rule,ev.reminder_minutes,
    coalesce(ev.status,'confirmed'),coalesce(ev.timezone,'Europe/Brussels')) returning * into result;

  insert into public.profiles_events(user_id,event_id,rsvp_status)
    select uid,result.event_id,case when uid=auth.uid() then 'going' else 'pending' end
    from (select distinct unnest(coalesce(p_participants,'{}'::uuid[]) || array[auth.uid()]) as uid) guests
    where uid is not null;
  if result.status = 'tentative' then
    insert into public.event_date_options(event_id,start_date,start_time,end_date,end_time,position)
      select result.event_id,(opt->>'startDate')::date,nullif(opt->>'startTime','')::time,
        nullif(opt->>'endDate','')::date,nullif(opt->>'endTime','')::time,(pos-1)::smallint
      from jsonb_array_elements(p_options) with ordinality as options(opt,pos);
  end if;
  insert into public.lists(kind,title,event_id) values('wishlist','Wishlist',result.event_id) returning list_id into lid;
  insert into public.list_items(list_id,title,link,note)
    select lid,btrim(item->>'title'),nullif(btrim(item->>'link'),''),nullif(btrim(item->>'note'),'')
    from jsonb_array_elements(p_items) item;
  return result;
end;
$$;
revoke execute on function public.create_event_with_wishlist(jsonb,uuid[],jsonb,jsonb) from public,anon;
grant execute on function public.create_event_with_wishlist(jsonb,uuid[],jsonb,jsonb) to authenticated;
