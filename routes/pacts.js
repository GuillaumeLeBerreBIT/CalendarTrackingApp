import express from 'express';
import authRequire from '../utils/utils.js';
import { supabaseAdmin } from '../db/supabase.js';

const router = express.Router();

async function verifyMembership(supabase, userId, groupId) {
  const { data } = await supabase
    .from('profiles_groups')
    .select('user_id, role')
    .eq('user_id', userId)
    .eq('groups_id', groupId)
    .eq('invite_status', 'accepted')
    .maybeSingle();
  return data;
}

async function resolvePactIfExpired(pact) {
  const today = new Date().toISOString().slice(0, 10);
  if (pact.status !== 'active' || pact.ends_at >= today) return pact;

  const newStatus = pact.completions_count >= pact.target_completions ? 'succeeded' : 'failed';
  const eventStatus = newStatus === 'succeeded' ? 'confirmed' : 'failed';

  await supabaseAdmin.from('pacts').update({ status: newStatus }).eq('pact_id', pact.pact_id);
  if (pact.reward_event_id) {
    await supabaseAdmin.from('events').update({ status: eventStatus }).eq('event_id', pact.reward_event_id);
  }

  return { ...pact, status: newStatus };
}

// GET /groups/:groupId/pacts/active
router.get('/groups/:groupId/pacts/active', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const membership = await verifyMembership(req.supabase, req.cookies.userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });

  const { data: pacts, error } = await req.supabase
    .from('pacts')
    .select('*')
    .eq('groups_id', groupId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, error: error.message });

  const active = (pacts || []).find((p) => p.status === 'active');
  if (!active) {
    const last = pacts?.[0] ?? null;
    return res.json({ success: true, pact: null, last });
  }

  const resolved = await resolvePactIfExpired(active);
  return res.json({ success: true, pact: resolved });
});

// GET /groups/:groupId/pacts
router.get('/groups/:groupId/pacts', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const membership = await verifyMembership(req.supabase, req.cookies.userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });

  const { data, error } = await req.supabase
    .from('pacts')
    .select('*')
    .eq('groups_id', groupId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, pacts: data || [] });
});

// POST /groups/:groupId/pacts
router.post('/groups/:groupId/pacts', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const userId = req.cookies.userId;
  const membership = await verifyMembership(req.supabase, userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });
  if (membership.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can create pacts.' });

  // Check no active pact already
  const { data: existing } = await req.supabase
    .from('pacts').select('pact_id').eq('groups_id', groupId).eq('status', 'active').maybeSingle();
  if (existing) return res.status(409).json({ success: false, error: 'A pact is already active for this group.' });

  const { reward_title, reward_date, reward_time, target_completions, ends_at } = req.body;
  if (!reward_title || !reward_date || !target_completions || !ends_at) {
    return res.status(400).json({ success: false, error: 'reward_title, reward_date, target_completions, and ends_at are required.' });
  }

  const today = new Date().toISOString().slice(0, 10);

  // 1. Create the locked reward event
  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .insert([{
      event_title: reward_title,
      groups_id: groupId,
      created_by: userId,
      all_day: !reward_time,
      start_date: reward_date,
      end_date: reward_date,
      start_time: reward_time || null,
      end_time: reward_time || null,
      status: 'locked',
      event_type: 'social',
    }])
    .select()
    .single();

  if (eventError) return res.status(500).json({ success: false, error: eventError.message });

  // 2. Create the pact referencing that event
  const { data: pact, error: pactError } = await supabaseAdmin
    .from('pacts')
    .insert([{
      groups_id: groupId,
      created_by: userId,
      target_completions: parseInt(target_completions, 10),
      completions_count: 0,
      starts_at: today,
      ends_at,
      reward_event_id: event.event_id,
      status: 'active',
    }])
    .select()
    .single();

  if (pactError) {
    // Clean up the orphaned event
    await supabaseAdmin.from('events').delete().eq('event_id', event.event_id);
    return res.status(500).json({ success: false, error: pactError.message });
  }

  // 3. Link event back to pact
  await supabaseAdmin.from('events').update({ pact_id: pact.pact_id }).eq('event_id', event.event_id);

  // 4. Auto-invite all group members to the locked event
  const { data: members } = await supabaseAdmin
    .from('profiles_groups')
    .select('user_id')
    .eq('groups_id', groupId)
    .eq('invite_status', 'accepted');

  if (members?.length) {
    await supabaseAdmin.from('profiles_events').insert(
      members.map((m) => ({
        user_id: m.user_id,
        event_id: event.event_id,
        rsvp_status: m.user_id === userId ? 'going' : 'pending',
      })),
    );
  }

  return res.status(201).json({ success: true, pact: { ...pact, pact_id: pact.pact_id }, event });
});

// DELETE /groups/:groupId/pacts/:pactId
router.delete('/groups/:groupId/pacts/:pactId', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  const pactId = parseInt(req.params.pactId, 10);
  if (isNaN(groupId) || isNaN(pactId)) return res.status(400).json({ success: false, error: 'Invalid id.' });

  const userId = req.cookies.userId;
  const membership = await verifyMembership(req.supabase, userId, groupId);
  if (!membership || membership.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can cancel pacts.' });

  const { data: pact } = await req.supabase
    .from('pacts').select('reward_event_id').eq('pact_id', pactId).eq('groups_id', groupId).single();

  if (!pact) return res.status(404).json({ success: false, error: 'Pact not found.' });

  await supabaseAdmin.from('pacts').update({ status: 'failed' }).eq('pact_id', pactId);
  if (pact.reward_event_id) {
    await supabaseAdmin.from('events').update({ status: 'failed' }).eq('event_id', pact.reward_event_id);
  }

  return res.status(204).send();
});

export default router;
