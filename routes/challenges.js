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

// GET /groups/:groupId/challenges
router.get('/groups/:groupId/challenges', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const membership = await verifyMembership(req.supabase, req.cookies.userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });

  const { data, error } = await req.supabase
    .from('group_challenges')
    .select('*')
    .eq('groups_id', groupId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, challenges: data || [] });
});

// POST /groups/:groupId/challenges
router.post('/groups/:groupId/challenges', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const userId = req.cookies.userId;
  const membership = await verifyMembership(req.supabase, userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });
  if (membership.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can create challenges.' });

  const { title, description, target_value, unit, start_date, end_date } = req.body;
  if (!title || !target_value || !start_date) {
    return res.status(400).json({ success: false, error: 'title, target_value, and start_date are required.' });
  }

  const { data, error } = await req.supabase
    .from('group_challenges')
    .insert([{
      groups_id: groupId,
      created_by: userId,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      target_value: parseInt(target_value, 10),
      unit: unit || 'completions',
      start_date,
      end_date: end_date || null,
      is_active: true,
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(201).json({ success: true, challenge: data });
});

// PATCH /groups/:groupId/challenges/:challengeId
router.patch('/groups/:groupId/challenges/:challengeId', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  const challengeId = parseInt(req.params.challengeId, 10);
  if (isNaN(groupId) || isNaN(challengeId)) return res.status(400).json({ success: false, error: 'Invalid id.' });

  const userId = req.cookies.userId;
  const membership = await verifyMembership(req.supabase, userId, groupId);
  if (!membership || membership.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can update challenges.' });

  const { title, description, target_value, unit, end_date, is_active } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = String(title).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (target_value !== undefined) updates.target_value = parseInt(target_value, 10);
  if (unit !== undefined) updates.unit = unit;
  if (end_date !== undefined) updates.end_date = end_date || null;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'No fields to update.' });

  const { data, error } = await req.supabase
    .from('group_challenges')
    .update(updates)
    .eq('challenge_id', challengeId)
    .eq('groups_id', groupId)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, challenge: data });
});

// DELETE /groups/:groupId/challenges/:challengeId
router.delete('/groups/:groupId/challenges/:challengeId', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  const challengeId = parseInt(req.params.challengeId, 10);
  if (isNaN(groupId) || isNaN(challengeId)) return res.status(400).json({ success: false, error: 'Invalid id.' });

  const userId = req.cookies.userId;
  const membership = await verifyMembership(req.supabase, userId, groupId);
  if (!membership || membership.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can delete challenges.' });

  const { error } = await req.supabase
    .from('group_challenges')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('groups_id', groupId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(204).send();
});

// GET /groups/:groupId/challenges/:challengeId/leaderboard
router.get('/groups/:groupId/challenges/:challengeId/leaderboard', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  const challengeId = parseInt(req.params.challengeId, 10);
  if (isNaN(groupId) || isNaN(challengeId)) return res.status(400).json({ success: false, error: 'Invalid id.' });

  const membership = await verifyMembership(req.supabase, req.cookies.userId, groupId);
  if (!membership) return res.status(403).json({ success: false, error: 'Not a group member.' });

  const { data: challenge } = await supabaseAdmin
    .from('group_challenges')
    .select('challenge_id, start_date, target_value, current_value, unit, title')
    .eq('challenge_id', challengeId)
    .eq('groups_id', groupId)
    .single();

  if (!challenge) return res.status(404).json({ success: false, error: 'Challenge not found.' });

  const { data: linkedHabits } = await supabaseAdmin
    .from('habits')
    .select('habit_id, contribution_value')
    .eq('challenge_id', challengeId);

  if (!linkedHabits || linkedHabits.length === 0) {
    return res.json({ success: true, leaderboard: [], challenge });
  }

  const habitIds = linkedHabits.map((h) => h.habit_id);
  const habitContribMap = Object.fromEntries(linkedHabits.map((h) => [h.habit_id, h.contribution_value || 1]));

  const { data: completions } = await supabaseAdmin
    .from('habit_completions')
    .select('user_id, habit_id')
    .in('habit_id', habitIds)
    .gte('completed_date', challenge.start_date);

  const userMap = {};
  for (const c of completions || []) {
    if (!userMap[c.user_id]) userMap[c.user_id] = { user_id: c.user_id, completions: 0, total_contribution: 0 };
    userMap[c.user_id].completions++;
    userMap[c.user_id].total_contribution += habitContribMap[c.habit_id] || 1;
  }

  const userIds = Object.keys(userMap);
  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, username')
      .in('user_id', userIds);
    profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.username]));
  }

  const leaderboard = Object.values(userMap)
    .map((u) => ({ ...u, username: profileMap[u.user_id] || 'Unknown' }))
    .sort((a, b) => b.total_contribution - a.total_contribution);

  return res.json({ success: true, leaderboard, challenge });
});

export default router;
