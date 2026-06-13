-- RLS hardening — 2026-06-14
-- Closes the Supabase security-advisor WARN findings (overly permissive write
-- policies + publicly-executable SECURITY DEFINER functions) and repairs the
-- profiles_task table which had RLS enabled but no policy (task assignment was
-- silently failing under the authenticated client).
--
-- PRE-REQ: deploy the utils/notifications.js change first — notifyUsers now
-- inserts notifications via supabaseAdmin, so it no longer needs the permissive
-- "insert any" policy this migration drops.
--
-- =========================== FORWARD ===========================

-- 1. notifications: any user could insert a notification for ANY user_id
--    (spam/abuse vector). Inserts now go through supabaseAdmin (service role,
--    bypasses RLS), so these public/authenticated INSERT policies are dropped.
DROP POLICY IF EXISTS "notifications_insert_any"    ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_public" ON public.notifications;

-- 2. group_invite_tokens: UPDATE policy was USING (true) — any user could mutate
--    any invite token. The only UPDATE in the app (use_count increment on join)
--    runs via supabaseAdmin, so this policy is unnecessary and dangerous.
DROP POLICY IF EXISTS "service_update_token" ON public.group_invite_tokens;

-- 3. event_reminders_sent: ALL policy USING (true)/WITH CHECK (true). Table is
--    written/read exclusively by the scheduler via supabaseAdmin. Drop the
--    policy; RLS stays enabled so only the service role can touch it.
DROP POLICY IF EXISTS "ers_all" ON public.event_reminders_sent;

-- 4. profiles_task: RLS enabled but NO policy → authenticated reads/writes
--    silently fail. Add a policy mirroring the `task` table: a group member may
--    manage assignees of tasks that belong to a task list in their group.
DROP POLICY IF EXISTS "group members manage task assignees" ON public.profiles_task;
CREATE POLICY "group members manage task assignees" ON public.profiles_task
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.task t
      JOIN public.task_list tl ON t.task_list_id = tl.task_list_id
      WHERE t.task_id = profiles_task.task_id
        AND public.is_group_member(tl.groups_id::bigint)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task t
      JOIN public.task_list tl ON t.task_list_id = tl.task_list_id
      WHERE t.task_id = profiles_task.task_id
        AND public.is_group_member(tl.groups_id::bigint)
    )
  );

-- 5. handle_new_user(): signup trigger, must never be callable via the REST RPC
--    surface. Triggers don't require caller EXECUTE, so this is safe.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 6. is_group_member(bigint): used INSIDE many RLS policies, so the authenticated
--    role MUST keep EXECUTE or those policies break. It only ever returns the
--    caller's own membership (auth.uid()), so authenticated RPC is harmless.
--    EXECUTE is granted to PUBLIC by default (which anon inherits), so revoking
--    "FROM anon" alone is a no-op — revoke from PUBLIC and re-grant authenticated.
--    (The 0029 advisor WARN for authenticated is expected/accepted: the function
--    is required inside RLS policies.)
REVOKE EXECUTE ON FUNCTION public.is_group_member(bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_group_member(bigint) TO authenticated;

-- =========================== ROLLBACK ===========================
-- (kept for reference — do NOT run as part of the forward migration)
--
-- CREATE POLICY "notifications_insert_any"    ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "notifications_insert_public" ON public.notifications FOR INSERT TO public        WITH CHECK (true);
-- CREATE POLICY "service_update_token"        ON public.group_invite_tokens FOR UPDATE USING (true);
-- CREATE POLICY "ers_all"                     ON public.event_reminders_sent FOR ALL USING (true) WITH CHECK (true);
-- DROP POLICY "group members manage task assignees" ON public.profiles_task;
-- GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.is_group_member(bigint) TO PUBLIC;
--
-- =========================== VALIDATION (2026-06-14, all passed) ===========================
-- Simulated via SET LOCAL ROLE + request.jwt.claims against live DB:
--   * authenticated member  → is_group_member(13) = true            (RLS reads still work)
--   * anon                  → is_group_member(13) = permission denied (anon RPC closed)
--   * authenticated         → INSERT notification for another user  = RLS violation (spam vector closed)
--   * authenticated         → UPDATE group_invite_tokens            = 0 rows (token tampering closed)
-- Supabase security advisors: the 4 rls_policy_always_true WARNs + handle_new_user
-- WARNs cleared. Remaining/accepted: is_group_member authenticated WARN (needed for RLS),
-- event_reminders_sent INFO (service-role-only table by design).
