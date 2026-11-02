-- bump_pact_completions(p_pact_id, p_delta) — 2026-11-02
-- Adds p_delta (+1 on habit log, -1 on un-log) to a pact's completions in ONE
-- statement, and marks it 'succeeded' when the target is reached. Replaces the
-- route's read-then-write, where two members logging at the same moment both
-- read N and both wrote N+1, losing a completion (audit M11, plan Task 16).
--
-- Only touches 'active' pacts, so a resolved pact is never changed. Returns the
-- updated row, or no row if the pact is missing or no longer active. A returned
-- status of 'succeeded' therefore means THIS call completed the pact.
--
-- Called only by the API (routes/habits.js) through supabaseAdmin, so it is
-- SECURITY DEFINER and executable by service_role only.
--
-- Apply in the Supabase dashboard → SQL Editor, BEFORE deploying the API change.
--
-- =========================== FORWARD ===========================

create or replace function public.bump_pact_completions(p_pact_id bigint, p_delta integer)
returns table (pact_id bigint, completions_count integer, target_completions integer, status text, reward_event_id bigint)
language sql security definer set search_path = public as $$
  update pacts
     set completions_count = greatest(0, pacts.completions_count + p_delta),
         status = case when pacts.completions_count + p_delta >= pacts.target_completions
                       then 'succeeded' else pacts.status end
   where pacts.pact_id = p_pact_id and pacts.status = 'active'
  returning pacts.pact_id, pacts.completions_count, pacts.target_completions, pacts.status, pacts.reward_event_id;
$$;

revoke execute on function public.bump_pact_completions(bigint, integer) from public, anon, authenticated;
grant execute on function public.bump_pact_completions(bigint, integer) to service_role;

-- =========================== ROLLBACK ==========================
-- drop function if exists public.bump_pact_completions(bigint, integer);
