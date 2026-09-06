import express from "express";
import authRequire from "../utils/utils.js";
import webpush from "web-push";
import { normalizeTime, isValidTimeZone } from "../utils/dailySummary.js";

webpush.setVapidDetails(
  "mailto:leberreguillaume.glb@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const router = express.Router();

const PREF_KEYS = ["group_invites", "event_invites", "rsvp_replies", "event_changes"];

// GET /notifications → recent notifications + unread count
router.get("/notifications", authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from("notifications")
    .select("*")
    .eq("user_id", req.cookies.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ success: false, error: error.message });

  const unread = (data || []).filter((n) => !n.is_read).length;
  return res.json({ success: true, notifications: data || [], unread });
});

// PATCH /notifications/:id/read → mark one as read
router.patch("/notifications/:id/read", authRequire, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: "Invalid notification id." });

  const { error } = await req.supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", id)
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

// POST /notifications/read-all → mark all as read
router.post("/notifications/read-all", authRequire, async (req, res) => {
  const { error } = await req.supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.cookies.userId)
    .eq("is_read", false);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

// DELETE /notifications/:id → remove a notification
router.delete("/notifications/:id", authRequire, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: "Invalid notification id." });

  const { error } = await req.supabase
    .from("notifications")
    .delete()
    .eq("notification_id", id)
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

// GET /notification-prefs → the user's per-type toggles
router.get("/notification-prefs", authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("user_id", req.cookies.userId)
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, prefs: data?.notification_prefs || {} });
});

// PATCH /notification-prefs  body: { prefs: { group_invites: bool, ... } }
router.patch("/notification-prefs", authRequire, async (req, res) => {
  const incoming = req.body?.prefs;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ success: false, error: "Invalid prefs." });
  }

  const { data: existing } = await req.supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("user_id", req.cookies.userId)
    .single();

  const merged = { ...(existing?.notification_prefs || {}) };
  for (const key of PREF_KEYS) {
    if (key in incoming) merged[key] = !!incoming[key];
  }

  // Daily "events today" summary settings live in the same JSON blob.
  if ("daily_summary_enabled" in incoming) {
    merged.daily_summary_enabled = !!incoming.daily_summary_enabled;
  }
  if ("daily_summary_time" in incoming) {
    const t = normalizeTime(incoming.daily_summary_time);
    if (!t) return res.status(400).json({ success: false, error: "Invalid daily_summary_time." });
    merged.daily_summary_time = t;
  }
  if ("timezone" in incoming) {
    if (!isValidTimeZone(incoming.timezone)) {
      return res.status(400).json({ success: false, error: "Invalid timezone." });
    }
    merged.timezone = incoming.timezone;
  }

  const { error } = await req.supabase
    .from("profiles")
    .update({ notification_prefs: merged })
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, prefs: merged });
});

// POST /push/subscribe — save (or refresh) a push subscription for the current user
router.post("/push/subscribe", authRequire, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ success: false, error: "endpoint, keys.p256dh, and keys.auth are required." });
  }

  const { error } = await req.supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: req.cookies.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "user_id,endpoint" },
    );

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

// DELETE /push/unsubscribe — remove a push subscription
router.delete("/push/unsubscribe", authRequire, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    return res.status(400).json({ success: false, error: "endpoint is required." });
  }

  const { error } = await req.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", req.cookies.userId)
    .eq("endpoint", endpoint);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

export default router;
