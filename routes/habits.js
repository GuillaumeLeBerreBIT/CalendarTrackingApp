import express from 'express';
import authRequire from '../utils/utils.js';
import { supabaseAdmin } from '../db/supabase.js';

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function utcDateStr(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function addUTCDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getMondayOfDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function computeWeeklyProgress(habit, allDates) {
  if (!habit.weekly_target) return { currentWeekTarget: null, currentWeekCompletions: null };

  const today = utcDateStr(0);
  const weekMonday = getMondayOfDate(today);
  const currentWeekCompletions = allDates.filter(d => d >= weekMonday && d <= today).length;

  const startWeek = habit.habit_start_week || weekMonday;
  const weeksElapsed = Math.max(0, Math.floor(
    (new Date(weekMonday + 'T00:00:00Z') - new Date(startWeek + 'T00:00:00Z')) / (7 * 24 * 3600 * 1000)
  ));
  const increment = habit.target_increment || 0;
  const base = habit.weekly_target;
  const cap = base * 4;
  const currentWeekTarget = Math.min(base + weeksElapsed * increment, cap);

  return { currentWeekTarget, currentWeekCompletions };
}

function getStreakMultiplier(streak) {
  if (streak >= 100) return 5.0;
  if (streak >= 30) return 3.0;
  if (streak >= 14) return 2.0;
  if (streak >= 7) return 1.5;
  return 1.0;
}

function calcStats(completionDates, frequency) {
  const dateSet = new Set(completionDates);
  const today = utcDateStr(0);

  const recentDays = Array.from({ length: 7 }, (_, i) =>
    dateSet.has(addUTCDays(today, -(6 - i))),
  );

  const completedToday = recentDays[6];
  let streak = 0;

  if (frequency === 'weekly') {
    const getMondayStr = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00Z');
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1 - day);
      d.setUTCDate(d.getUTCDate() + diff);
      return d.toISOString().slice(0, 10);
    };
    const weekSet = new Set(completionDates.map((ds) => getMondayStr(ds)));
    let cursorStr = today;
    while (true) {
      const monday = getMondayStr(cursorStr);
      if (!weekSet.has(monday)) break;
      streak++;
      cursorStr = addUTCDays(cursorStr, -7);
    }
  } else {
    let cursorStr = today;
    while (true) {
      if (!dateSet.has(cursorStr)) break;
      streak++;
      cursorStr = addUTCDays(cursorStr, -1);
    }
  }

  return { completedToday, recentDays, streak };
}

// ─── GET /habits ─────────────────────────────────────────────────────────────

router.get('/habits', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  const { data: habits, error: habitsError } = await req.supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId);

  if (habitsError) return res.status(500).json({ success: false, error: habitsError.message });

  const enriched = await Promise.all(
    (habits || []).map(async (habit) => {
      const { data: allCompletions } = await req.supabase
        .from('habit_completions')
        .select('completed_date')
        .eq('habit_id', habit.habit_id)
        .eq('user_id', userId)
        .order('completed_date', { ascending: false });

      const allDates = (allCompletions || []).map((c) => c.completed_date);
      const cutoff = addUTCDays(utcDateStr(), -83);
      const completionHistory = allDates.filter((d) => d >= cutoff);
      const { completedToday, recentDays, streak } = calcStats(allDates, habit.frequency);
      const { currentWeekTarget, currentWeekCompletions } = computeWeeklyProgress(habit, allDates);

      return { ...habit, completedToday, recentDays, streak, completionHistory, currentWeekTarget, currentWeekCompletions };
    }),
  );

  return res.json({ success: true, habits: enriched });
});

// ─── POST /habits ─────────────────────────────────────────────────────────────

router.post('/habits', authRequire, async (req, res) => {
  const { title, frequency, emoji, color, groups_id, xp_value, weekly_target, target_increment, challenge_id, contribution_value } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ success: false, error: 'title is required.' });
  }

  if (!['daily', 'weekly'].includes(frequency)) {
    return res.status(400).json({ success: false, error: "frequency must be 'daily' or 'weekly'." });
  }

  const weeklyTargetNum = weekly_target ? Math.max(1, Math.min(14, parseInt(weekly_target, 10) || 0)) || null : null;
  const parsedGroupId = groups_id ? parseInt(groups_id, 10) || null : null;
  const parsedChallengeId = challenge_id ? parseInt(challenge_id, 10) || null : null;

  // Verify challenge belongs to the specified group before linking
  if (parsedChallengeId && parsedGroupId) {
    const { data: ch } = await req.supabase
      .from('group_challenges')
      .select('challenge_id')
      .eq('challenge_id', parsedChallengeId)
      .eq('groups_id', parsedGroupId)
      .maybeSingle();
    if (!ch) return res.status(400).json({ success: false, error: 'Challenge not found in this group.' });
  }

  const { data: habit, error } = await req.supabase
    .from('habits')
    .insert([{
      user_id: req.cookies.userId,
      title: title.trim(),
      frequency,
      emoji: emoji || null,
      color: color || null,
      groups_id: parsedGroupId,
      challenge_id: parsedChallengeId,
      contribution_value: parsedChallengeId ? Math.max(1, parseInt(contribution_value, 10) || 1) : null,
      xp_value: Math.max(1, Math.min(100, parseInt(xp_value, 10) || 10)),
      weekly_target: weeklyTargetNum,
      target_increment: weeklyTargetNum ? (parseInt(target_increment, 10) || 0) : 0,
      habit_start_week: getMondayOfDate(utcDateStr()),
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, habit });
});

// ─── DELETE /habits/:id ───────────────────────────────────────────────────────

router.delete('/habits/:id', authRequire, async (req, res) => {
  const habitId = parseInt(req.params.id, 10);
  if (isNaN(habitId)) return res.status(400).json({ success: false, error: 'Invalid habit id.' });

  const { error } = await req.supabase
    .from('habits')
    .delete()
    .eq('habit_id', habitId)
    .eq('user_id', req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(204).send();
});

// ─── PUT /habits/:id ──────────────────────────────────────────────────────────

router.put('/habits/:id', authRequire, async (req, res) => {
  const habitId = parseInt(req.params.id, 10);
  if (isNaN(habitId)) return res.status(400).json({ success: false, error: 'Invalid habit id.' });

  const { title, emoji, color, weekly_target, target_increment, groups_id, challenge_id, contribution_value } = req.body;

  const updates = {};
  if (title !== undefined) {
    if (!title || typeof title !== 'string' || title.trim() === '')
      return res.status(400).json({ success: false, error: 'title cannot be empty.' });
    updates.title = title.trim();
  }
  if (emoji !== undefined) updates.emoji = emoji || null;
  if (color !== undefined) updates.color = color || null;
  if (groups_id !== undefined) updates.groups_id = groups_id ? parseInt(groups_id, 10) || null : null;

  const parsedChallengeId = challenge_id !== undefined
    ? (challenge_id ? parseInt(challenge_id, 10) || null : null)
    : undefined;

  if (parsedChallengeId !== undefined) {
    if (parsedChallengeId && updates.groups_id) {
      const { data: ch } = await req.supabase
        .from('group_challenges')
        .select('challenge_id')
        .eq('challenge_id', parsedChallengeId)
        .eq('groups_id', updates.groups_id)
        .maybeSingle();
      if (!ch) return res.status(400).json({ success: false, error: 'Challenge not found in this group.' });
    }
    updates.challenge_id = parsedChallengeId;
    updates.contribution_value = parsedChallengeId
      ? Math.max(1, parseInt(contribution_value, 10) || 1)
      : null;
  }

  if (weekly_target !== undefined) {
    const wt = weekly_target ? Math.max(1, Math.min(14, parseInt(weekly_target, 10) || 0)) || null : null;
    updates.weekly_target = wt;
    updates.target_increment = wt ? (parseInt(target_increment, 10) || 0) : 0;
  }

  if (!Object.keys(updates).length)
    return res.status(400).json({ success: false, error: 'No fields to update.' });

  const { data: habit, error } = await req.supabase
    .from('habits')
    .update(updates)
    .eq('habit_id', habitId)
    .eq('user_id', req.cookies.userId)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!habit) return res.status(404).json({ success: false, error: 'Habit not found.' });

  return res.json({ success: true, habit });
});

// ─── POST /habits/:id/log ─────────────────────────────────────────────────────

router.post('/habits/:id/log', authRequire, async (req, res) => {
  const habitId = parseInt(req.params.id, 10);
  if (isNaN(habitId)) return res.status(400).json({ success: false, error: 'Invalid habit id.' });

  const userId = req.cookies.userId;
  const today = todayStr();

  const { data: existing, error: fetchError } = await req.supabase
    .from('habit_completions')
    .select('habit_id')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .eq('completed_date', today)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ success: false, error: fetchError.message });

  if (existing) {
    // Un-log: delete by composite key
    const { error: deleteError } = await req.supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .eq('completed_date', today);

    if (deleteError) return res.status(500).json({ success: false, error: deleteError.message });

    // Reverse XP: find today's transaction for this habit
    const { data: todayTx } = await supabaseAdmin
      .from('xp_transactions')
      .select('id, xp_earned')
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .gte('created_at', today + 'T00:00:00Z')
      .lt('created_at', addUTCDays(today, 1) + 'T00:00:00Z')
      .maybeSingle();

    let newTotalXp = null;
    if (todayTx) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('total_xp')
        .eq('user_id', userId)
        .single();
      newTotalXp = Math.max(0, (profile?.total_xp || 0) - todayTx.xp_earned);
      await Promise.all([
        supabaseAdmin.from('profiles').update({ total_xp: newTotalXp }).eq('user_id', userId),
        supabaseAdmin.from('xp_transactions').delete().eq('id', todayTx.id),
      ]);

      // Reverse challenge contribution
      const { data: habit } = await req.supabase
        .from('habits')
        .select('challenge_id, contribution_value')
        .eq('habit_id', habitId)
        .single();
      if (habit?.challenge_id) {
        const { data: challenge } = await supabaseAdmin
          .from('group_challenges')
          .select('current_value')
          .eq('challenge_id', habit.challenge_id)
          .single();
        if (challenge) {
          await supabaseAdmin
            .from('group_challenges')
            .update({ current_value: Math.max(0, challenge.current_value - (habit.contribution_value || 1)) })
            .eq('challenge_id', habit.challenge_id);
        }
      }
    }

    // Reverse pact contribution
    const { data: userMemberships } = await req.supabase
      .from('profiles_groups')
      .select('groups_id')
      .eq('user_id', userId)
      .eq('invite_status', 'accepted');
    const gIds = (userMemberships || []).map(m => m.groups_id);
    if (gIds.length > 0) {
      const { data: activePacts } = await supabaseAdmin
        .from('pacts')
        .select('pact_id, completions_count')
        .in('groups_id', gIds)
        .eq('status', 'active');
      for (const pact of activePacts || []) {
        await supabaseAdmin
          .from('pacts')
          .update({ completions_count: Math.max(0, pact.completions_count - 1) })
          .eq('pact_id', pact.pact_id);
      }
    }

    return res.json({
      success: true,
      completedToday: false,
      xpEarned: todayTx ? -todayTx.xp_earned : 0,
      newTotalXp,
    });
  }

  // Log: insert a new completion
  const { error: insertError } = await req.supabase
    .from('habit_completions')
    .insert([{ habit_id: habitId, user_id: userId, completed_date: today }]);

  if (insertError) return res.status(500).json({ success: false, error: insertError.message });

  // Fetch habit details for XP + weekly target
  const { data: habit } = await req.supabase
    .from('habits')
    .select('xp_value, challenge_id, contribution_value, frequency, weekly_target, target_increment, habit_start_week')
    .eq('habit_id', habitId)
    .single();

  // Compute streak after insert
  const { data: allCompletions } = await req.supabase
    .from('habit_completions')
    .select('completed_date')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .order('completed_date', { ascending: false });

  const allDates = (allCompletions || []).map((c) => c.completed_date);
  const { streak } = calcStats(allDates, habit?.frequency || 'daily');

  const multiplier = getStreakMultiplier(streak);
  const xpEarned = Math.round((habit?.xp_value || 10) * multiplier);
  const reason = streak >= 100 ? 'streak_100' : streak >= 30 ? 'streak_30' : streak >= 7 ? 'streak_7' : 'completion';

  // Award XP atomically
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('total_xp')
    .eq('user_id', userId)
    .single();
  const newTotalXp = (profile?.total_xp || 0) + xpEarned;

  await Promise.all([
    supabaseAdmin.from('profiles').update({ total_xp: newTotalXp }).eq('user_id', userId),
    supabaseAdmin.from('xp_transactions').insert([{
      user_id: userId, habit_id: habitId, xp_earned: xpEarned, multiplier, reason,
    }]),
  ]);

  // Group challenge contribution
  if (habit?.challenge_id) {
    const { data: challenge } = await supabaseAdmin
      .from('group_challenges')
      .select('current_value')
      .eq('challenge_id', habit.challenge_id)
      .single();
    if (challenge) {
      await supabaseAdmin
        .from('group_challenges')
        .update({ current_value: challenge.current_value + (habit.contribution_value || 1) })
        .eq('challenge_id', habit.challenge_id);
    }
  }

  // Pact contribution — find all active pacts in groups this user belongs to
  const { data: userMemberships } = await req.supabase
    .from('profiles_groups')
    .select('groups_id')
    .eq('user_id', userId)
    .eq('invite_status', 'accepted');
  const gIds = (userMemberships || []).map(m => m.groups_id);
  if (gIds.length > 0) {
    const { data: activePacts } = await supabaseAdmin
      .from('pacts')
      .select('pact_id, target_completions, completions_count, reward_event_id')
      .in('groups_id', gIds)
      .eq('status', 'active');
    for (const pact of activePacts || []) {
      const newCount = pact.completions_count + 1;
      if (newCount >= pact.target_completions) {
        await supabaseAdmin.from('pacts').update({ status: 'succeeded', completions_count: newCount }).eq('pact_id', pact.pact_id);
        if (pact.reward_event_id) {
          await supabaseAdmin.from('events').update({ status: 'confirmed' }).eq('event_id', pact.reward_event_id);
        }
      } else {
        await supabaseAdmin.from('pacts').update({ completions_count: newCount }).eq('pact_id', pact.pact_id);
      }
    }
  }

  // Weekly target bonus XP
  let weeklyTargetHit = false;
  let bonusXp = 0;
  let finalTotalXp = newTotalXp;
  if (habit?.weekly_target) {
    const { currentWeekTarget, currentWeekCompletions } = computeWeeklyProgress(habit, allDates);
    if (currentWeekTarget && currentWeekCompletions === currentWeekTarget) {
      weeklyTargetHit = true;
      bonusXp = Math.round((habit.xp_value || 10) * 0.5);
      finalTotalXp = newTotalXp + bonusXp;
      await supabaseAdmin.from('profiles').update({ total_xp: finalTotalXp }).eq('user_id', userId);
    }
  }

  return res.json({ success: true, completedToday: true, xpEarned, multiplier, newTotalXp: finalTotalXp, weeklyTargetHit, bonusXp });
});

// ─── GET /groups/:groupId/habits ──────────────────────────────────────────────

router.get('/groups/:groupId/habits', authRequire, async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ success: false, error: 'Invalid groupId.' });

  const userId = req.cookies.userId;

  const { data: membership, error: membershipError } = await req.supabase
    .from('profiles_groups')
    .select('user_id')
    .eq('user_id', userId)
    .eq('groups_id', groupId)
    .eq('invite_status', 'accepted')
    .maybeSingle();

  if (membershipError) return res.status(500).json({ success: false, error: membershipError.message });
  if (!membership) return res.status(403).json({ success: false, error: 'You are not a member of this group.' });

  const { data: habits, error: habitsError } = await req.supabase
    .from('habits')
    .select('*')
    .eq('groups_id', groupId);

  if (habitsError) return res.status(500).json({ success: false, error: habitsError.message });

  const enriched = await Promise.all(
    (habits || []).map(async (habit) => {
      const { data: profileData } = await req.supabase
        .from('profiles')
        .select('username')
        .eq('user_id', habit.user_id)
        .maybeSingle();

      const username = profileData?.username || null;

      const { data: allCompletions } = await req.supabase
        .from('habit_completions')
        .select('completed_date')
        .eq('habit_id', habit.habit_id)
        .eq('user_id', habit.user_id)
        .order('completed_date', { ascending: false });

      const allDates = (allCompletions || []).map((c) => c.completed_date);
      const { completedToday, recentDays, streak } = calcStats(allDates, habit.frequency);

      return { ...habit, username, completedToday, recentDays, streak };
    }),
  );

  return res.json({ success: true, habits: enriched });
});

export default router;
