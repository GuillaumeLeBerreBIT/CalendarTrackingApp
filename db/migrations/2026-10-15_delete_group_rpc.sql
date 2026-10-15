-- delete_group(p_group_id) — 2026-10-15
-- Deletes a group and everything that belongs to it in ONE transaction: either
-- all of it goes, or (on any error) nothing does. Replaces the route's seven
-- separate deletes, which could stop half-way (tasks gone, group still there)
-- and, running under RLS, could silently skip other members' rows.
--
-- Called only by the API (routes/groups.js, DELETE /groups/:groupId) through
-- supabaseAdmin AFTER it has checked the caller is a group admin, so the
-- function itself is SECURITY DEFINER and executable by service_role only.
--
-- Kept, not deleted: members' personal habits that were linked to the group or
-- its challenges are unlinked (groups_id / challenge_id set to null).
--
-- Returns { task_lists, tasks, events } counts, or null if the group does not exist.
-- Tables that may not exist in every environment are skipped (to_regclass).
--
-- Apply in the Supabase dashboard → SQL Editor, BEFORE deploying the API change.
--
-- =========================== FORWARD ===========================

CREATE OR REPLACE FUNCTION public.delete_group(p_group_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_ids  bigint[];
  v_task_ids  bigint[];
  v_event_ids bigint[];
  v_pact_ids  bigint[];
  v_challenge_ids bigint[];
  v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groups WHERE groups_id = p_group_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(task_list_id), '{}') INTO v_list_ids FROM task_list WHERE groups_id = p_group_id;
  SELECT coalesce(array_agg(task_id), '{}')      INTO v_task_ids FROM task      WHERE task_list_id = ANY (v_list_ids);
  SELECT coalesce(array_agg(event_id), '{}')     INTO v_event_ids FROM events   WHERE groups_id = p_group_id;
  SELECT coalesce(array_agg(pact_id), '{}')      INTO v_pact_ids FROM pacts     WHERE groups_id = p_group_id;
  SELECT coalesce(array_agg(challenge_id), '{}') INTO v_challenge_ids FROM group_challenges WHERE groups_id = p_group_id;

  -- Tasks
  IF to_regclass('public.profiles_task') IS NOT NULL THEN
    DELETE FROM profiles_task WHERE task_id = ANY (v_task_ids);
  END IF;
  DELETE FROM task      WHERE task_id = ANY (v_task_ids);
  DELETE FROM task_list WHERE task_list_id = ANY (v_list_ids);

  -- Pacts and events point at each other (pacts.reward_event_id, events.pact_id):
  -- break both links before deleting either side.
  UPDATE pacts  SET reward_event_id = NULL WHERE pact_id = ANY (v_pact_ids) OR reward_event_id = ANY (v_event_ids);
  UPDATE events SET pact_id = NULL         WHERE pact_id = ANY (v_pact_ids);

  -- Everything hanging off the group's events
  FOREACH v_table IN ARRAY ARRAY[
    'event_date_votes', 'event_date_options', 'event_comments', 'event_reactions',
    'event_overrides', 'event_reminders_sent', 'google_event_links', 'profiles_events'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I WHERE event_id = ANY ($1)', v_table) USING v_event_ids;
    END IF;
  END LOOP;
  DELETE FROM events WHERE event_id = ANY (v_event_ids);
  DELETE FROM pacts  WHERE pact_id = ANY (v_pact_ids);

  -- Challenges; keep members' habits, just unlink them
  UPDATE habits SET challenge_id = NULL WHERE challenge_id = ANY (v_challenge_ids);
  UPDATE habits SET groups_id = NULL    WHERE groups_id = p_group_id;
  DELETE FROM group_challenges WHERE challenge_id = ANY (v_challenge_ids);

  -- Membership, invites, the group itself
  DELETE FROM group_invite_tokens WHERE groups_id = p_group_id;
  DELETE FROM profiles_groups     WHERE groups_id = p_group_id;
  DELETE FROM groups              WHERE groups_id = p_group_id;

  RETURN jsonb_build_object(
    'task_lists', cardinality(v_list_ids),
    'tasks', cardinality(v_task_ids),
    'events', cardinality(v_event_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_group(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_group(bigint) TO service_role;

-- =========================== ROLLBACK ===========================
-- DROP FUNCTION IF EXISTS public.delete_group(bigint);
