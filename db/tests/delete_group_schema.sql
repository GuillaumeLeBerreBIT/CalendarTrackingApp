-- Minimal stand-in for the production schema: only the tables and columns the
-- app code touches around group deletion (inferred from routes/ and utils/).
-- Plain foreign keys with NO cascade, so delete_group must clean up children
-- itself, in the right order.
create role service_role;
create role authenticated;
create role anon;
create schema if not exists auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;

create table groups (groups_id bigint primary key, groups_title text, tag_name text);
create table profiles_groups (user_id uuid, groups_id bigint references groups, role text, invite_status text);
create table group_invite_tokens (token text primary key, groups_id bigint references groups on delete cascade);
create table task_list (task_list_id bigint primary key, groups_id bigint references groups, task_list_title text);
create table task (task_id bigint primary key, task_list_id bigint references task_list, task_title text);
create table profiles_task (user_id uuid, task_id bigint references task);
create table pacts (pact_id bigint primary key, groups_id bigint references groups, reward_event_id bigint);
create table events (event_id bigint primary key, groups_id bigint references groups, event_title text, pact_id bigint references pacts);
alter table pacts add foreign key (reward_event_id) references events;
create table profiles_events (user_id uuid, event_id bigint references events);
create table event_date_options (option_id bigint primary key, event_id bigint references events);
create table event_date_votes (event_id bigint references events, option_id bigint references event_date_options, user_id uuid);
create table event_comments (comment_id bigint primary key, event_id bigint references events);
create table event_reactions (reaction_id bigint primary key, event_id bigint references events);
create table event_overrides (event_id bigint references events, occurrence_date date);
create table event_reminders_sent (event_id bigint references events, occurrence_date date, reminder_type text);
create table google_event_links (user_id uuid, event_id bigint references events);
create table group_challenges (challenge_id bigint primary key, groups_id bigint references groups);
create table habits (habit_id bigint primary key, user_id uuid, groups_id bigint references groups, challenge_id bigint references group_challenges);
