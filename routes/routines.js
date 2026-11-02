import express from 'express';
import authRequire from '../utils/utils.js';
import { routineView } from '../utils/routines.js';

const router = express.Router();

/**
 * GET /routines
 * The caller's own repeating events (swim Mon/Tue, climbing Wed/Sat…), personal
 * or shared with one of their groups, each with its next session and group label. Creating, editing and stopping a routine reuse the
 * event endpoints (POST/PUT/DELETE /parseEvent), so there is no write API here.
 */
router.get('/routines', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  const { data: events, error } = await req.supabase
    .from('events')
    .select('*')
    .eq('created_by', userId)
    .is('external_uid', null)
    .not('recurrence_rule', 'is', null);
  if (error) return res.status(500).json({ success: false, error: error.message });

  const ids = (events || []).map((e) => e.event_id);
  const overridesByEvent = {};
  if (ids.length > 0) {
    const { data: overrides, error: ovError } = await req.supabase
      .from('event_overrides')
      .select('*')
      .in('event_id', ids);
    if (ovError) return res.status(500).json({ success: false, error: ovError.message });
    (overrides || []).forEach((o) => { (overridesByEvent[o.event_id] ||= []).push(o); });
  }

  const groupIds = [...new Set((events || []).map((e) => e.groups_id).filter((g) => g != null))];
  const groupTitles = {};
  if (groupIds.length > 0) {
    const { data: groups, error: grError } = await req.supabase
      .from('groups')
      .select('groups_id, groups_title')
      .in('groups_id', groupIds);
    if (grError) return res.status(500).json({ success: false, error: grError.message });
    (groups || []).forEach((g) => { groupTitles[g.groups_id] = g.groups_title; });
  }

  const now = new Date();
  const routines = (events || [])
    .map((e) => ({
      ...routineView(e, overridesByEvent[e.event_id] || [], now),
      groupId: e.groups_id ?? null,
      groupTitle: e.groups_id != null ? groupTitles[e.groups_id] ?? null : null,
    }))
    // Active routines first by what is coming up next; finished ones last.
    .sort((a, b) => {
      if (a.ended !== b.ended) return a.ended ? 1 : -1;
      const ka = a.next ? `${a.next.date}T${a.next.time || '00:00'}` : '';
      const kb = b.next ? `${b.next.date}T${b.next.time || '00:00'}` : '';
      return ka.localeCompare(kb) || a.title.localeCompare(b.title);
    });

  return res.json({ success: true, routines });
});

export default router;
