import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "../db/supabase.js";
import authRequire from "../utils/utils.js";
import { attachTier } from "../utils/tier.js";
import {
  isGoogleConfigured,
  getAuthUrl,
  connectUser,
  disconnectUser,
  listUserCalendars,
  watchCalendar,
  stopChannel,
  pullCalendar,
  removePulledEvents,
  triggerCalendarPull,
} from "../utils/google.js";

const router = express.Router();

// Tighter limit on the public (no-auth) Google webhook than the global /api
// limiter — it's an unauthenticated endpoint, so cap per-IP bursts.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Gate the connect flow behind the Plus tier. Mirrors checkLimit's 403 shape so
// the client's axios interceptor shows the upgrade modal. Must run after attachTier.
function requirePlus(req, res, next) {
  if (req.tier === "plus") return next();
  return res.status(403).json({ success: false, code: "UPGRADE_REQUIRED", feature: "google_calendar" });
}

// Signed OAuth state ties the consent redirect back to the initiating user
// without trusting the (cookie-only) callback. HMAC(userId.timestamp) with a
// server secret, valid for 10 minutes.
const STATE_SECRET = process.env.GOOGLE_STATE_SECRET || process.env.TOKEN_ENC_KEY || process.env.SUPABASE_SECRET_KEY || "dev-state-secret";
const STATE_TTL_MS = 10 * 60 * 1000;

function signState(userId) {
  const ts = Date.now();
  const payload = `${userId}.${ts}`;
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyState(state) {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [userId, ts, sig] = decoded.split(".");
    const expected = crypto.createHmac("sha256", STATE_SECRET).update(`${userId}.${ts}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    if (Date.now() - Number(ts) > STATE_TTL_MS) return null;
    return userId;
  } catch {
    return null;
  }
}

// GET /api/calendar/google/auth → { url } to send the browser to Google consent.
router.get("/calendar/google/auth", authRequire, attachTier, requirePlus, (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json({ success: false, error: "Google Calendar sync is not configured." });
  }
  const url = getAuthUrl(signState(req.cookies.userId));
  return res.json({ success: true, url });
});

// GET /api/calendar/google/callback → exchange code, connect, redirect to Profile.
router.get("/calendar/google/callback", async (req, res) => {
  const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const fail = (reason) => res.redirect(`${base}/profile?gcal=error&reason=${encodeURIComponent(reason)}`);

  const { code, state, error } = req.query;
  if (error) return fail("denied");
  if (!code || !state) return fail("missing");

  const userId = verifyState(String(state));
  if (!userId) return fail("invalid_state");

  try {
    await connectUser(userId, String(code));
    return res.redirect(`${base}/profile?gcal=connected`);
  } catch (err) {
    console.error("[google] connect failed:", err.message);
    return fail("connect_failed");
  }
});

// GET /api/calendar/google/status → connection state for the Profile UI.
router.get("/calendar/google/status", authRequire, async (req, res) => {
  const { data } = await supabaseAdmin
    .from("google_calendar_tokens")
    .select("sync_status, last_sync_at")
    .eq("user_id", req.cookies.userId)
    .maybeSingle();
  return res.json({
    success: true,
    configured: isGoogleConfigured(),
    connected: !!data && data.sync_status === "active",
    lastSyncAt: data?.last_sync_at || null,
  });
});

// DELETE /api/calendar/google → revoke + remove the connection.
router.delete("/calendar/google", authRequire, async (req, res) => {
  try {
    await disconnectUser(req.cookies.userId);
    return res.json({ success: true });
  } catch (err) {
    console.error("[google] disconnect failed:", err.message);
    return res.status(500).json({ success: false, error: "Could not disconnect." });
  }
});

// ── Phase B: pull (Google → Eventli) ──────────────────────────────────────

// GET /api/calendar/google/calendars → the user's calendars + which are enabled
// for import. Requires the calendarlist scope (granted on (re)connect).
router.get("/calendar/google/calendars", authRequire, attachTier, requirePlus, async (req, res) => {
  try {
    const [calendars, { data: synced }] = await Promise.all([
      listUserCalendars(req.cookies.userId),
      supabaseAdmin
        .from("google_synced_calendars")
        .select("google_calendar_id, enabled, last_pulled_at")
        .eq("user_id", req.cookies.userId),
    ]);
    const byId = Object.fromEntries((synced || []).map((s) => [s.google_calendar_id, s]));
    const list = calendars.map((c) => ({
      ...c,
      enabled: !!byId[c.id]?.enabled,
      lastPulledAt: byId[c.id]?.last_pulled_at || null,
    }));
    return res.json({ success: true, calendars: list });
  } catch (err) {
    // A 403/insufficient scope means the user connected before the pull feature
    // existed → tell the client to prompt a reconnect.
    const code = err?.code || err?.response?.status;
    if (code === 403) return res.status(403).json({ success: false, code: "RECONNECT_REQUIRED" });
    console.error("[google] list calendars failed:", err.message);
    return res.status(500).json({ success: false, error: "Could not list calendars." });
  }
});

// POST /api/calendar/google/calendars/:calendarId  body { enabled }
// Enable → subscribe + initial pull. Disable → stop channel + remove its events.
router.post("/calendar/google/calendars/:calendarId", authRequire, attachTier, requirePlus, async (req, res) => {
  const userId = req.cookies.userId;
  const calendarId = req.params.calendarId;
  const enabled = req.body?.enabled === true || req.body?.enabled === "true";

  try {
    if (enabled) {
      // Validate the calendar belongs to the user before subscribing.
      const calendars = await listUserCalendars(userId);
      const cal = calendars.find((c) => c.id === calendarId);
      if (!cal) return res.status(404).json({ success: false, error: "Calendar not found." });

      await supabaseAdmin.from("google_synced_calendars").upsert(
        { user_id: userId, google_calendar_id: calendarId, summary: cal.summary, enabled: true },
        { onConflict: "user_id,google_calendar_id" }
      );
      // Subscribe to webhooks (no-op in local dev) + kick an initial pull async.
      watchCalendar(userId, calendarId).catch((e) => console.error("[google] watch failed:", e.message));
      supabaseAdmin
        .from("google_synced_calendars")
        .select("user_id, google_calendar_id, sync_token")
        .eq("user_id", userId).eq("google_calendar_id", calendarId).maybeSingle()
        .then(({ data }) => { if (data) return pullCalendar(data.user_id, data); })
        .catch((e) => console.error("[google] initial pull failed:", e.message));
      return res.json({ success: true, enabled: true });
    }

    // Disable: stop channel, remove imported events, drop the row.
    const { data: row } = await supabaseAdmin
      .from("google_synced_calendars").select("*")
      .eq("user_id", userId).eq("google_calendar_id", calendarId).maybeSingle();
    if (row) await stopChannel(userId, row).catch(() => {});
    await removePulledEvents(userId, calendarId);
    await supabaseAdmin.from("google_synced_calendars")
      .delete().eq("user_id", userId).eq("google_calendar_id", calendarId);
    return res.json({ success: true, enabled: false });
  } catch (err) {
    console.error("[google] toggle calendar failed:", err.message);
    return res.status(500).json({ success: false, error: "Could not update calendar." });
  }
});

// POST /api/calendar/google/notifications  (PUBLIC — Google webhook)
// The notification carries no event data; it's a "something changed" trigger.
// We verify the per-channel secret, then pull with our own stored credentials.
router.post("/calendar/google/notifications", webhookLimiter, async (req, res) => {
  const channelId = req.get("X-Goog-Channel-ID");
  const channelToken = req.get("X-Goog-Channel-Token");
  const resourceState = req.get("X-Goog-Resource-State");

  if (!channelId || !channelToken) return res.sendStatus(404);

  const { data: row } = await supabaseAdmin
    .from("google_synced_calendars")
    .select("user_id, google_calendar_id, channel_token")
    .eq("channel_id", channelId)
    .maybeSingle();

  // Unknown channel or token mismatch → reject without detail.
  if (!row || !row.channel_token) return res.sendStatus(404);
  const a = Buffer.from(channelToken);
  const b = Buffer.from(row.channel_token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(404);

  // 'sync' is the initial handshake — acknowledge, do nothing.
  if (resourceState && resourceState !== "sync") {
    triggerCalendarPull(row.user_id, row.google_calendar_id);
  }
  return res.sendStatus(200);
});

export default router;
