import express from "express";
import supabase from "../db/supabase.js";
import { validatePassword } from "../utils/utils.js";

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
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/groups");
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
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('refreshToken', data.session.refresh_token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.cookie('expiresAt', data.session.expires_at, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.redirect("/groups");
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

export default router