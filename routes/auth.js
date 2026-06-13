import express from "express";
import rateLimit from "express-rate-limit";
import supabase, { supabaseAdmin } from "../db/supabase.js";
import { validatePassword, setSessionCookies } from "../utils/utils.js";
import authRequire from "../utils/utils.js";
import {
  attachTier,
  countAcceptedGroups,
  countEventsThisMonth,
  FREE_MAX_GROUPS,
  FREE_MAX_EVENTS_MONTH,
} from "../utils/tier.js";

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post("/login", authLimiter, async (req, res) => {

  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.body["email"],
    password: req.body["password"],
  });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  setSessionCookies(res, data.session, data.user);

  res.json({ success: true });
});

router.post("/register", authLimiter, async (req, res) => {

  if (req.body["password"] != req.body["passwordConfirm"]) {
    return res.status(422).json({
      success: false,
      error: "Make sure the passwords entered are identical to each other.",
    });
  }

  const [isValid, messageSuccess] = validatePassword(req.body["password"]);

  if (!isValid) {
    return res.status(422).json({ success: false, error: messageSuccess });
  }

  const { data, error } = await supabase.auth.signUp({
    email: req.body["email"],
    password: req.body["password"],
    options: {
      data: {
        username: req.body["username"],
      },
    },
  });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  setSessionCookies(res, data.session, data.user);

  res.json({ success: true });
});

router.post("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.json({ success: true });
});

router.get("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.json({ success: true });
});

/**
 * GET /profile
 * Render the profile/settings page with the user's account info and preferences.
 */
router.get('/profile', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username, email, created_at, email_digest_enabled, city, has_completed_onboarding, searchable, total_xp')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    return res.status(500).json({ success: false, error: 'Could not load profile.' });
  }

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Unknown';

  return res.json({
    success: true,
    userId,
    username: profile.username || '',
    email: profile.email || '',
    memberSince,
    emailDigestEnabled: profile.email_digest_enabled !== false,
    city: profile.city || '',
    hasCompletedOnboarding: profile.has_completed_onboarding === true,
    searchable: profile.searchable !== false,
    total_xp: profile.total_xp || 0,
  });
});

/**
 * GET /usage
 * Returns the user's plan/tier plus current usage against free-tier limits.
 * Plus / always-free users still get real counts (frontend shows "unlimited").
 */
router.get('/usage', authRequire, attachTier, async (req, res) => {
  const userId = req.cookies.userId;
  const client = req.supabase || supabase;

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('plan, always_free')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    return res.status(500).json({ success: false, error: profileError.message });
  }

  const [groupsUsed, eventsUsed] = await Promise.all([
    countAcceptedGroups(client, userId),
    countEventsThisMonth(client, userId),
  ]);

  return res.json({
    success: true,
    plan: profile.plan || 'free',
    alwaysFree: profile.always_free === true,
    tier: req.tier,
    groups: { used: groupsUsed, max: FREE_MAX_GROUPS },
    eventsThisMonth: { used: eventsUsed, max: FREE_MAX_EVENTS_MONTH },
  });
});

/**
 * PATCH /profile
 * Update profile-level boolean preferences.
 * Body: { has_completed_onboarding?: boolean, searchable?: boolean }
 */
router.patch('/profile', authRequire, async (req, res) => {
  const { has_completed_onboarding, searchable } = req.body;

  const updates = {};
  if (has_completed_onboarding !== undefined) updates.has_completed_onboarding = Boolean(has_completed_onboarding);
  if (searchable !== undefined) updates.searchable = Boolean(searchable);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields provided to update.' });
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', req.cookies.userId);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.json({ success: true, ...updates });
});

/**
 * PATCH /profile/city
 * Update the authenticated user's home city (used as the default discovery location).
 * Body: { city: string }  — empty string clears it.
 */
router.patch('/profile/city', authRequire, async (req, res) => {
  const { city } = req.body;

  if (typeof city !== 'string') {
    return res.status(400).json({ success: false, error: 'City must be a string.' });
  }

  const sanitized = city.trim().slice(0, 100);

  const { error } = await supabase
    .from('profiles')
    .update({ city: sanitized || null })
    .eq('user_id', req.cookies.userId);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.json({ success: true, city: sanitized });
});

/**
 * PATCH /profile/username
 * Update the authenticated user's username.
 * Body: { username: string }
 */
router.patch('/profile/username', authRequire, async (req, res) => {
  const { username } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Username must be at least 2 characters.' });
  }

  const sanitized = username.trim();

  const { error } = await supabase
    .from('profiles')
    .update({ username: sanitized })
    .eq('user_id', req.cookies.userId);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.json({ success: true, username: sanitized });
});

/**
 * GET /profile/stats
 * Lightweight dashboard counters for the authenticated user. Tolerant of
 * individual query failures — each metric defaults to 0.
 */
router.get('/profile/stats', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  // Current calendar month bounds (YYYY-MM-DD)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  let eventsThisMonth = 0;
  try {
    const { data } = await req.supabase
      .from('profiles_events')
      .select('event_id, events!inner(start_date)')
      .eq('user_id', userId)
      .gte('events.start_date', monthStart)
      .lt('events.start_date', monthEnd);
    eventsThisMonth = (data || []).length;
  } catch (_) { eventsThisMonth = 0; }

  let groups = 0;
  try {
    const { count } = await req.supabase
      .from('profiles_groups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('invite_status', 'accepted');
    groups = count || 0;
  } catch (_) { groups = 0; }

  let saved = 0;
  try {
    const { count } = await req.supabase
      .from('saved_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    saved = count || 0;
  } catch (_) { saved = 0; }

  return res.json({ success: true, eventsThisMonth, groups, saved });
});

// GET /push/vapid-public-key — returns the VAPID public key so the frontend can subscribe
router.get("/push/vapid-public-key", (req, res) => {
  res.json({ success: true, key: process.env.VAPID_PUBLIC_KEY ?? "" });
});

/**
 * GET /account/export
 * GDPR data portability (Art. 20): returns a JSON dump of everything tied to the
 * authenticated user as a downloadable attachment. Uses supabaseAdmin so the
 * export is complete regardless of RLS, but every query is scoped to the
 * caller's own user_id — never trust a body/query param for the id here.
 */
router.get('/account/export', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  // [table, column] pairs — each scoped to this user only.
  const ownTables = [
    ['profiles', 'user_id'],
    ['profiles_groups', 'user_id'],
    ['profiles_events', 'user_id'],
    ['profiles_task', 'user_id'],
    ['events', 'created_by'],
    ['habits', 'user_id'],
    ['habit_completions', 'user_id'],
    ['timers', 'user_id'],
    ['saved_events', 'user_id'],
    ['notifications', 'user_id'],
    ['event_comments', 'user_id'],
    ['event_reactions', 'user_id'],
    ['event_date_votes', 'user_id'],
    ['pacts', 'created_by'],
    ['group_challenges', 'created_by'],
    ['xp_transactions', 'user_id'],
    ['subscriptions', 'user_id'],
  ];

  const data = {};
  for (const [table, column] of ownTables) {
    const { data: rows, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq(column, userId);
    // Tolerate per-table failures (e.g. a table that doesn't exist yet) — an
    // export should never 500 because one optional table is missing.
    data[table] = error ? [] : (rows || []);
  }

  const payload = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    email: req.user?.email ?? data.profiles?.[0]?.email ?? null,
    note: 'This is a copy of the personal data Eventli holds about you.',
    data,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="eventli-data-${userId}.json"`);
  return res.status(200).send(JSON.stringify(payload, null, 2));
});

/**
 * POST /account/delete
 * GDPR erasure (Art. 17): permanently deletes the user's account and personal
 * data. Requires the current password as confirmation (re-auth) so a stolen
 * session or accidental click can't wipe an account.
 *
 * Deletion order matters: tables that reference profiles with ON DELETE NO ACTION
 * must be cleared before the profiles row, otherwise the FK blocks the delete.
 * Tables with ON DELETE CASCADE on profiles are removed automatically.
 * Body: { password: string }
 */
router.post('/account/delete', authRequire, async (req, res) => {
  const userId = req.cookies.userId;
  const email = req.user?.email;
  const { password } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Could not determine the account to delete.' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(422).json({ success: false, error: 'Your password is required to delete your account.' });
  }

  // Re-authenticate to confirm identity before an irreversible action.
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password });
  if (reauthError) {
    return res.status(403).json({ success: false, error: 'Incorrect password.' });
  }

  try {
    // 1. Clear rows that reference profiles with NO ACTION (would block the delete).
    await supabaseAdmin.from('event_date_votes').delete().eq('user_id', userId);
    await supabaseAdmin.from('group_invite_tokens').delete().eq('created_by', userId);
    await supabaseAdmin.from('pacts').delete().eq('created_by', userId);
    await supabaseAdmin.from('group_challenges').delete().eq('created_by', userId);

    // 2. Clear personal rows with no FK to profiles (would orphan otherwise).
    await supabaseAdmin.from('notifications').delete().eq('user_id', userId);
    await supabaseAdmin.from('saved_events').delete().eq('user_id', userId);
    await supabaseAdmin.from('subscriptions').delete().eq('user_id', userId);
    await supabaseAdmin.from('events').delete().eq('created_by', userId);

    // 3. Delete the profile — cascades habits, completions, push subs, memberships,
    //    profiles_events/task, timers, xp, comments, reactions.
    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('user_id', userId);
    if (profileError) {
      return res.status(500).json({ success: false, error: 'Failed to delete account data.' });
    }

    // 4. Remove the auth user itself.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      return res.status(500).json({ success: false, error: 'Account data removed but the login could not be deleted. Contact support.' });
    }
  } catch (_) {
    return res.status(500).json({ success: false, error: 'Failed to delete account.' });
  }

  // 5. Clear the session cookies — the account no longer exists.
  res.clearCookie('authCookie');
  res.clearCookie('refreshToken');
  res.clearCookie('expiresAt');
  res.clearCookie('userId');

  return res.json({ success: true });
});

export default router