import express from "express";
import crypto from "crypto";
import multer from "multer";
import ical from "node-ical";
import { supabaseAdmin } from "../db/supabase.js";
import authRequire from "../utils/utils.js";
import { buildICS } from "../utils/ical.js";
import { icsEventToRow, MAX_IMPORT_EVENTS } from "../utils/icsImport.js";
import { toWallClock } from "../utils/wallClock.js";
import { isValidTimeZone } from "../utils/dailySummary.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

/**
 * POST /api/calendar/import
 * Upload an .ics file and import future events into the current user's calendar.
 * Multipart field name: "ics"
 */
router.post("/calendar/import", authRequire, upload.single("ics"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const userId = req.cookies.userId;

  // Times are stored as naive wall-clock values, so convert into the user's zone.
  const { data: profile } = await req.supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("user_id", userId)
    .single();
  const storedTz = profile?.notification_prefs?.timezone;
  const userTz = isValidTimeZone(storedTz) ? storedTz : "UTC";
  const todayStr = toWallClock(new Date(), userTz).date;

  let parsed;
  try {
    parsed = ical.parseICS(req.file.buffer.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, error: "Could not parse ICS file." });
  }

  const vevents = Object.values(parsed).filter((e) => e.type === "VEVENT");
  if (vevents.length > MAX_IMPORT_EVENTS) {
    return res.status(400).json({ success: false, error: `Files with more than ${MAX_IMPORT_EVENTS} events are not supported.` });
  }

  let imported = 0;
  let skipped = 0;

  for (const vevent of vevents) {
    const row = icsEventToRow(vevent, userTz);
    // Skip unreadable events and one-off events that are already over.
    if (!row || (!row.recurrence_rule && row.end_date < todayStr)) {
      skipped++;
      continue;
    }

    const externalUid = vevent.uid || null;
    if (externalUid) {
      const { data: existing } = await req.supabase
        .from("events")
        .select("event_id")
        .eq("external_uid", externalUid)
        .eq("created_by", userId)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const { data: inserted, error: insertError } = await req.supabase
      .from("events")
      .insert({
        event_title: String(vevent.summary),
        event_description: vevent.description ? String(vevent.description) : "",
        location: vevent.location ? String(vevent.location) : "",
        ...row,
        timezone: userTz,
        created_by: userId,
        external_uid: externalUid,
      })
      .select("event_id")
      .single();

    if (insertError || !inserted) {
      skipped++;
      continue;
    }

    // Query builders have no .catch(): await and inspect the error instead.
    const { error: participantError } = await req.supabase
      .from("profiles_events")
      .insert({ user_id: userId, event_id: inserted.event_id, rsvp_status: "going" });
    if (participantError) {
      console.warn("[ical import] participant insert failed:", participantError.message);
    }

    imported++;
  }

  return res.json({ success: true, imported, skipped });
});

export default router;
