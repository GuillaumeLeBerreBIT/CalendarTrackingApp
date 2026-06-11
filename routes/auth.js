import express from "express";
import rateLimit from "express-rate-limit";
import supabase from "../db/supabase.js";
import { validatePassword, setSessionCookies } from "../utils/utils.js";
import authRequire from "../utils/utils.js";

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

export default router