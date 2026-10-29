-- Creating a personal event (groups_id null) failed with "new row violates
-- row-level security policy for table events": POST /parseEvent inserts with
-- .select(), so the new row must pass the SELECT policy, which only admitted
-- users with a profiles_events row, and that row is written after the insert.
-- Let the creator see their own personal events.
alter policy "events select" on public.events
  using (
    ((groups_id is not null) and is_group_member((groups_id)::bigint))
    or ((groups_id is null) and (
      created_by = auth.uid()
      or auth.uid() in (select profiles_events.user_id from profiles_events where profiles_events.event_id = events.event_id)
    ))
  );
