import express from "express";
import supabase from "../db/supabase.js";
import { validatePassword } from "../utils/utils.js";
import authRequire from "../utils/utils.js";

const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login.ejs");
});

router.get("/register", (req, res) => {
  res.render("register.ejs");
});

router.post("/login", async (req, res) => {

  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.body["email"],
    password: req.body["password"],
  });

  if (error) {
    return res
      .status(400)
      .render("login.ejs", { success: false, message: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('userId', data.user.id,  {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/calendar");
  }
});

router.post("/register", async (req, res) => {

  if (req.body["password"] != req.body["passwordConfirm"]) {
    return res.status(422).render("register.ejs", {
      success: false,
      error: "Make sure the passwords entered are identical to each other.",
    });
  }

  const [isValid, messageSuccess] = validatePassword(req.body["password"]);

  if (!isValid) {
    return res
      .status(422)
      .render("register.ejs", { success: false, error: messageSuccess });
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
    return res
      .status(400)
      .render("register.ejs", { success: false, error: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });
    res.cookie('userId', data.user.id,  {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/calendar");
  }
});

router.post("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.redirect("/login");
});

router.get("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.clearCookie("refreshToken");
  res.clearCookie("expiresAt");
  res.clearCookie("userId");
  res.redirect("/login");
});

/**
 * GET /profile
 * Render the profile/settings page with the user's account info and preferences.
 */
router.get('/profile', authRequire, async (req, res) => {
  const userId = req.cookies.userId;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username, email, created_at, email_digest_enabled')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    return res.status(500).render('login.ejs', { success: false, message: 'Could not load profile.' });
  }

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Unknown';

  return res.render('profile.ejs', {
    username: profile.username || '',
    email: profile.email || '',
    memberSince,
    emailDigestEnabled: profile.email_digest_enabled !== false, // default true
    currentPage: 'profile',
  });
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

export default router