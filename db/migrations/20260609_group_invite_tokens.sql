-- Migration: group_invite_tokens
-- Apply via: Supabase Dashboard → SQL Editor, or Supabase CLI

create table if not exists public.group_invite_tokens (
  token uuid primary key default gen_random_uuid(),
  groups_id bigint not null references public.groups(groups_id) on delete cascade,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days'),
  max_uses int default 50,
  use_count int default 0
);

alter table public.group_invite_tokens enable row level security;

create policy "group_members_can_read_tokens" on public.group_invite_tokens
  for select using (
    exists (
      select 1 from public.profiles_groups pg
      where pg.groups_id = group_invite_tokens.groups_id
        and pg.user_id = auth.uid()
        and pg.invite_status = 'accepted'
    )
  );

create policy "group_admins_can_insert_tokens" on public.group_invite_tokens
  for insert with check (
    exists (
      select 1 from public.profiles_groups pg
      where pg.groups_id = group_invite_tokens.groups_id
        and pg.user_id = auth.uid()
        and pg.role = 'admin'
    )
  );

create policy "service_update_token" on public.group_invite_tokens
  for update using (true);
