import express from "express";
import crypto from "crypto";
import { supabaseAdmin } from "../db/supabase.js";
import authRequire from "../utils/utils.js";
import { buildICS } from "../utils/ical.js";

const router = express.Router();

// Build the subscribe URLs from APP_URL (preferred) or the incoming request host.
function buildUrls(req, token) {
  const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/api/calendar/${token}.ics`;
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  return { url, webcal };
}

/**
 * PUBLIC — GET /calendar/:token.ics
 * No auth: the secret token IS the credential. Uses the singleton client.
 */
router.get("/calendar/:token.ics", async (req, res) => {
  try {
    const token = String(req.params.token || "").replace(/\.ics$/i, "");
    if (!token) return res.status(404).send("Not found");

    // Public token-authenticated endpoint (no JWT) → use the service-role client so
    // RLS (which keys off auth.uid()) doesn't strip every membership/event row. The
    // feed is manually scoped to the token's owner below.
    const db = supabaseAdmin;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("user_id")
      .eq("ical_token", token)
      .single();

    if (profileError || !profile) return res.status(404).send("Not found");

    const userId = profile.user_id;

    // Accepted group memberships → group events
    const { data: memberships } = await db
      .from("profiles_groups")
      .select("groups_id")
      .eq("user_id", userId)
      .eq("invite_status", "accepted");

    const groupIds = (memberships || []).map((m) => m.groups_id);

    let groupEvents = [];
    if (groupIds.length > 0) {
      const { data } = await db
        .from("events")
        .select("*")
        .in("groups_id", groupIds);
      groupEvents = data || [];
    }

    // Personal events: the user's profiles_events rows joined to events with no group
    const { data: personalRows } = await db
      .from("events")
      .select("*, profiles_events!inner(user_id)")
      .eq("profiles_events.user_id", userId)
      .is("groups_id", null);

    const personalEvents = (personalRows || []).map(({ profiles_events, ...e }) => e);

    // De-dupe by event_id (a personal event could also surface elsewhere)
    const byId = new Map();
    for (const e of [...groupEvents, ...personalEvents]) {
      byId.set(e.event_id, e);
    }
    const events = Array.from(byId.values());

    // Overrides for recurring events (used for EXDATE lines)
    const recurringIds = events.filter((e) => e.recurrence_rule).map((e) => e.event_id);
    const overridesByEvent = {};
    if (recurringIds.length > 0) {
      const { data: overrides } = await db
        .from("event_overrides")
        .select("*")
        .in("event_id", recurringIds);
      (overrides || []).forEach((o) => {
        (overridesByEvent[o.event_id] ||= []).push(o);
      });
    }

    const ics = buildICS(events, overridesByEvent);
    res.set("Content-Type", "text/calendar; charset=utf-8");
    return res.send(ics);
  } catch (error) {
    console.error("GET /calendar/:token.ics error:", error);
    return res.status(500).send("Could not build calendar feed.");
  }
});

// GET /calendar/token → existing token + subscribe URL (or null)
router.get("/calendar/token", authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from("profiles")
    .select("ical_token")
    .eq("user_id", req.cookies.userId)
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  const token = data?.ical_token || null;
  if (!token) return res.json({ success: true, token: null, url: null, webcal: null });

  const { url, webcal } = buildUrls(req, token);
  return res.json({ success: true, token, url, webcal });
});

// POST /calendar/token → generate + save a new token, return subscribe URLs
router.post("/calendar/token", authRequire, async (req, res) => {
  const token = crypto.randomUUID();

  const { error } = await req.supabase
    .from("profiles")
    .update({ ical_token: token })
    .eq("user_id", req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });

  const { url, webcal } = buildUrls(req, token);
  return res.json({ success: true, token, url, webcal });
});

export default router;
