-- Events store a naive date + time. This column records which IANA zone that
-- wall clock is read in, so reminders/sync stay correct for people elsewhere.
-- Existing rows are backfilled by the default (the app has only run in Belgium).
-- Additive and safe to run before the matching code is deployed.
alter table public.events
  add column if not exists timezone text not null default 'Europe/Brussels';
