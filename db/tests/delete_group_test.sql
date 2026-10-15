-- Run by db/tests/run_delete_group_test.sh against a throwaway Postgres.
\set ON_ERROR_STOP on
\set me '''00000000-0000-4000-8000-0000000000aa'''

insert into groups values (1, 'Home', 'HOME'), (2, 'Weekend Crew', 'HOME');
insert into profiles_groups values (:me, 1, 'admin', 'accepted'), (:me, 2, 'admin', 'accepted');
insert into group_invite_tokens values ('t2', 2);
insert into task_list values (10, 1, 'Afspraken'), (20, 2, 'Packing');
insert into task values (100, 10, 'Tandarts'), (200, 20, 'Tent');
insert into profiles_task values (:me, 100), (:me, 200);
insert into pacts values (5, 2, null);
insert into events values (1000, 1, 'Tandarts', null), (2000, 2, 'Camping', 5);
update pacts set reward_event_id = 2000 where pact_id = 5;
insert into profiles_events values (:me, 1000), (:me, 2000);
insert into event_date_options values (1, 2000);
insert into event_date_votes values (2000, 1, :me);
insert into event_comments values (1, 2000);
insert into event_reactions values (1, 2000);
insert into event_overrides values (2000, '2026-10-17');
insert into event_reminders_sent values (2000, '2026-10-17', 'reminder');
insert into google_event_links values (:me, 2000);
insert into group_challenges values (7, 2);
insert into habits values (1, :me, 2, 7), (2, :me, 1, null);

-- 1. A failure part-way must change nothing (one transaction).
create table blocker (task_id bigint references task);   -- an FK the function does not know about
insert into blocker values (200);
do $$ begin
  perform public.delete_group(2);
  raise exception 'expected delete_group to fail';
exception when foreign_key_violation then null; end $$;
select 'atomic: task Tent kept' as check, count(*) = 1 as ok from task where task_id = 200
union all select 'atomic: group kept', count(*) = 1 from groups where groups_id = 2
union all select 'atomic: events kept', count(*) = 2 from events;
drop table blocker;

-- 2. Deleting Weekend Crew removes all of it and nothing of Home.
select public.delete_group(2) as result;
select 'gone: group 2' as check, count(*) = 0 as ok from groups where groups_id = 2
union all select 'gone: its lists', count(*) = 0 from task_list where groups_id = 2
union all select 'gone: its events', count(*) = 0 from events where groups_id = 2
union all select 'gone: its pact', count(*) = 0 from pacts where groups_id = 2
union all select 'gone: its challenge', count(*) = 0 from group_challenges where groups_id = 2
union all select 'kept: Home', count(*) = 1 from groups where groups_id = 1
union all select 'kept: Tandarts task', count(*) = 1 from task where task_title = 'Tandarts'
union all select 'kept: Tandarts event', count(*) = 1 from events where event_id = 1000
union all select 'kept: Home membership', count(*) = 1 from profiles_groups where groups_id = 1
union all select 'kept: personal habit, unlinked', count(*) = 1 from habits where habit_id = 1 and groups_id is null and challenge_id is null
union all select 'kept: Home habit', count(*) = 1 from habits where habit_id = 2 and groups_id = 1;

-- 3. Unknown group: null, nothing changes.
select 'unknown group returns null' as check, public.delete_group(999) is null as ok;

-- 4. Only the service role may call it.
select 'not callable by authenticated' as check, not has_function_privilege('authenticated', 'public.delete_group(bigint)', 'execute') as ok
union all select 'not callable by anon', not has_function_privilege('anon', 'public.delete_group(bigint)', 'execute')
union all select 'callable by service_role', has_function_privilege('service_role', 'public.delete_group(bigint)', 'execute');
