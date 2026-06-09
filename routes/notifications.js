import express from "express";
import authRequire from "../utils/utils.js";

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

  const { error } = await req.supabase
    .from("profiles")
    .update({ notification_prefs: merged })
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, prefs: merged });
});

export default router;
