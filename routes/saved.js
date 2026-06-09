import express from "express";
import authRequire from "../utils/utils.js";

const router = express.Router();

// GET /saved → the user's saved discovery events, newest first
router.get("/saved", authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from("saved_events")
    .select("discovery_id, snapshot, created_at")
    .eq("user_id", req.cookies.userId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, saved: data || [] });
});

// POST /saved  body = a discovery event object (must have .id)
router.post("/saved", authRequire, async (req, res) => {
  const event = req.body;
  if (!event || !event.id) {
    return res.status(400).json({ success: false, error: "A discovery event with an id is required." });
  }

  const { error } = await req.supabase
    .from("saved_events")
    .upsert(
      { user_id: req.cookies.userId, discovery_id: String(event.id), snapshot: event },
      { onConflict: "user_id,discovery_id", ignoreDuplicates: true }
    );

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

// DELETE /saved/:discoveryId → remove a saved discovery event
router.delete("/saved/:discoveryId", authRequire, async (req, res) => {
  const { error } = await req.supabase
    .from("saved_events")
    .delete()
    .eq("user_id", req.cookies.userId)
    .eq("discovery_id", req.params.discoveryId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true });
});

export default router;
