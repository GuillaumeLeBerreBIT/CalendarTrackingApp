import express from 'express';
import authRequire from '../utils/utils.js';
import { routineView } from '../utils/routines.js';

const router = express.Router();

/**
 * GET /routines
 * The caller's own repeating personal events (swim Mon/Tue, climbing Wed/Sat…),
 * each with its next session. Creating, editing and stopping a routine reuse the
 * event endpoints (POST/PUT/DELETE /parseEvent), so there is no write API here.
 */
router.get('/routines', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  const { data: events, error } = await req.supabase
    .from('events')
    .select('*')
    .eq('created_by', userId)
    .is('groups_id', null)
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

  const now = new Date();
  const routines = (events || [])
    .map((e) => routineView(e, overridesByEvent[e.event_id] || [], now))
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
