import express from "express";
import crypto from "crypto";
import multer from "multer";
import ical from "node-ical";
import { supabaseAdmin } from "../db/supabase.js";
import authRequire from "../utils/utils.js";
import { buildICS } from "../utils/ical.js";

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let parsed;
  try {
    parsed = ical.parseICS(req.file.buffer.toString("utf8"));
  } catch (parseErr) {
    return res.status(400).json({ success: false, error: "Could not parse ICS file." });
  }

  const vevents = Object.values(parsed).filter((e) => e.type === "VEVENT");

  let imported = 0;
  let skipped = 0;

  for (const event of vevents) {
    // Skip events with no title or no start date
    if (!event.summary || !event.start) {
      skipped++;
      continue;
    }

    // Resolve start as a JS Date
    const startDate = event.start instanceof Date ? event.start : new Date(event.start);
    if (isNaN(startDate.getTime()) || startDate < today) {
      skipped++;
      continue;
    }

    const isAllDay = event.datetype === "date";

    // Format dates as YYYY-MM-DD
    const toDateStr = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      return dt.toISOString().slice(0, 10);
    };

    const toTimeStr = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      const hh = String(dt.getUTCHours()).padStart(2, "0");
      const mm = String(dt.getUTCMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };

    const startDateStr = toDateStr(startDate);
    const endDate = event.end ? (event.end instanceof Date ? event.end : new Date(event.end)) : startDate;
    const endDateStr = toDateStr(endDate);
    const startTimeStr = isAllDay ? null : toTimeStr(startDate);
    const endTimeStr = isAllDay ? null : (event.end ? toTimeStr(endDate) : null);
    const externalUid = event.uid || null;

    // Skip duplicates: check if this UID already exists for this user
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

    // Insert event
    const { data: inserted, error: insertError } = await req.supabase
      .from("events")
      .insert({
        event_title: String(event.summary),
        event_description: event.description ? String(event.description) : "",
        location: event.location ? String(event.location) : "",
        all_day: isAllDay,
        start_date: startDateStr,
        end_date: endDateStr,
        start_time: startTimeStr,
        end_time: endTimeStr,
        created_by: userId,
        external_uid: externalUid,
      })
      .select("event_id")
      .single();

    if (insertError || !inserted) {
      skipped++;
      continue;
    }

    // Add creator as a participant with rsvp_status 'going'
    await req.supabase
      .from("profiles_events")
      .insert({ user_id: userId, event_id: inserted.event_id, rsvp_status: "going" })
      .catch(() => {}); // non-fatal

    imported++;
  }

  return res.json({ success: true, imported, skipped });
});

export default router;
