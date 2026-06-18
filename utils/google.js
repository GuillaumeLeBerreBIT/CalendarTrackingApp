import crypto from "crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "../db/supabase.js";

// ── Config ───────────────────────────────────────────────────────────────
// Google Cloud OAuth client (consent screen + Calendar API enabled). Least-
// privilege scopes: calendar.app.created lets us create + manage ONLY the
// dedicated "Eventli" calendar (never the user's other calendars), and
// calendar.events lets us write events into it. No read access to anything else.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.events",
  // Phase B (pull): enumerate the user's calendars so they can choose which to import.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

// Pull tuning.
const PULL_HISTORY_DAYS = 365;          // initial import window (1 year back)
const MAX_EVENTS_PER_PULL = 2000;        // storage-abuse guard per calendar per run
const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EVENTLI_CALENDAR_NAME = "Eventli";
// Timed events have no per-event timezone in our schema; Google needs one for
// dateTime values, so fall back to a configurable default.
const DEFAULT_TZ = process.env.GOOGLE_DEFAULT_TZ || "Europe/Brussels";

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

// ── Token at-rest encryption (AES-256-GCM) ─────────────────────────────────
// Refresh tokens are long-lived credentials. When TOKEN_ENC_KEY is set we
// encrypt them before storing; otherwise we fall back to plaintext (documented
// debt) so local/dev works without the key. Encrypted values carry an "enc:"
// marker so decrypt() can tell the two apart.
function encKey() {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest(); // 32 bytes from any string
}

export function encryptToken(plain) {
  const key = encKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptToken(stored) {
  if (!stored || !stored.startsWith("enc:")) return stored; // plaintext fallback
  const key = encKey();
  if (!key) throw new Error("TOKEN_ENC_KEY missing but a stored token is encrypted.");
  const [, ivB64, tagB64, ctB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

// ── OAuth ──────────────────────────────────────────────────────────────────
export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state) {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",   // → returns a refresh_token
    prompt: "consent",        // force refresh_token even on re-auth
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

// Persist a token set for a user (encrypting secrets). refresh_token may be
// absent on re-auth — keep the existing one in that case.
async function persistTokens(userId, tokens, extra = {}) {
  const row = {
    user_id: userId,
    access_token: encryptToken(tokens.access_token),
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  if (tokens.refresh_token) row.refresh_token = encryptToken(tokens.refresh_token);
  await supabaseAdmin.from("google_calendar_tokens").upsert(row, { onConflict: "user_id" });
}

// Build an authed client for a user, or null if they aren't connected. Auto-
// refreshes and persists rotated access tokens via the 'tokens' event.
export async function getClientForUser(userId) {
  const { data: row } = await supabaseAdmin
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("sync_status", "active")
    .maybeSingle();
  if (!row) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  });
  client.on("tokens", (t) => {
    // Fire-and-forget: keep the stored access token fresh after a refresh.
    persistTokens(userId, t).catch((e) => console.error("[google] token persist failed:", e.message));
  });
  return { client, calendarId: row.google_calendar_id };
}

// Ensure the user has a dedicated "Eventli" calendar; create it if missing.
async function ensureCalendar(authClient, existingId) {
  const cal = google.calendar({ version: "v3", auth: authClient });
  if (existingId) {
    try {
      await cal.calendars.get({ calendarId: existingId });
      return existingId;
    } catch {
      /* deleted on Google's side — recreate below */
    }
  }
  const { data } = await cal.calendars.insert({
    requestBody: { summary: EVENTLI_CALENDAR_NAME, timeZone: DEFAULT_TZ },
  });
  return data.id;
}

// ── Connect / disconnect ─────────────────────────────────────────────────
// Exchange the OAuth code, create the Eventli calendar, store tokens, backfill.
export async function connectUser(userId, code) {
  const tokens = await exchangeCode(code);
  if (!tokens.refresh_token) {
    // No refresh token → we can't keep syncing. Happens if the user previously
    // granted without prompt=consent; surfaced to the caller to re-prompt.
    throw new Error("Google did not return a refresh token. Please try connecting again.");
  }
  const client = getOAuthClient();
  client.setCredentials(tokens);
  // Reuse the existing Eventli calendar on reconnect — never create a duplicate.
  const { data: prior } = await supabaseAdmin
    .from("google_calendar_tokens")
    .select("google_calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  const calendarId = await ensureCalendar(client, prior?.google_calendar_id || null);

  await persistTokens(userId, tokens, {
    google_calendar_id: calendarId,
    sync_status: "active",
    created_at: new Date().toISOString(),
  });

  // Backfill in the background so the OAuth callback can redirect immediately —
  // pushing every existing event inline can take many seconds. Any events that
  // fail here are picked up by the hourly reconcile cron.
  backfillUser(userId).catch((e) => console.error("[google] backfill failed:", e.message));
  return { calendarId };
}

export async function disconnectUser(userId) {
  // Stop webhook channels first (needs valid creds — do this before revoking).
  const { data: cals } = await supabaseAdmin
    .from("google_synced_calendars")
    .select("*")
    .eq("user_id", userId);
  for (const c of cals || []) await stopChannel(userId, c).catch(() => {});

  const conn = await getClientForUser(userId);
  if (conn) {
    try { await conn.client.revokeCredentials(); } catch { /* token may already be invalid */ }
  }

  // Remove Google-origin mirror events from Eventli (native events untouched),
  // then drop all sync state. The Eventli Google calendar is left in place so the
  // user keeps their pushed copy.
  await removePulledEvents(userId);
  await supabaseAdmin.from("google_synced_calendars").delete().eq("user_id", userId);
  await supabaseAdmin.from("google_event_links").delete().eq("user_id", userId);
  await supabaseAdmin.from("google_calendar_tokens").delete().eq("user_id", userId);
}

// ── Event mapping ──────────────────────────────────────────────────────────
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Map an Eventli events row → a Google Calendar event resource.
export function eventToGoogle(event) {
  const body = {
    summary: event.event_title || "(untitled)",
    description: event.event_description || undefined,
    location: event.location || undefined,
  };

  const hasTime = !event.all_day && event.start_time;
  if (!hasTime) {
    // All-day: Google's end date is exclusive, so add a day.
    const start = event.start_date;
    const end = event.end_date || event.start_date;
    body.start = { date: start };
    body.end = { date: addDays(end, 1) };
  } else {
    const startTime = event.start_time.slice(0, 8).padEnd(8, ":00").slice(0, 8);
    const startDateTime = `${event.start_date}T${startTime.length === 5 ? startTime + ":00" : startTime}`;
    let endDate = event.end_date || event.start_date;
    let endTime = event.end_time ? event.end_time.slice(0, 8) : null;
    if (!endTime) {
      // No explicit end → default to one hour after start.
      const d = new Date(`${event.start_date}T${event.start_time.slice(0, 5)}:00`);
      d.setHours(d.getHours() + 1);
      endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      endTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
    }
    body.start = { dateTime: startDateTime, timeZone: DEFAULT_TZ };
    body.end = { dateTime: `${endDate}T${endTime.length === 5 ? endTime + ":00" : endTime}`, timeZone: DEFAULT_TZ };
  }

  if (event.recurrence_rule) {
    const rule = event.recurrence_rule.replace(/^RRULE:/i, "");
    body.recurrence = [`RRULE:${rule}`];
  }
  // Tag mirrored events so the pull side can recognise our own pushes and never
  // re-import them (one of three loop guards).
  if (event.event_id != null) {
    body.extendedProperties = { private: { eventliEventId: String(event.event_id) } };
  }
  return body;
}

// ── Sync one event to all connected participants ─────────────────────────
// action: 'upsert' (create/update) | 'delete'
export async function syncEventToGoogle(eventId, action = "upsert") {
  if (!isGoogleConfigured()) return;
  try {
    // On delete, the event row may be gone — drive off the existing links.
    if (action === "delete") {
      const { data: links } = await supabaseAdmin
        .from("google_event_links")
        .select("user_id, google_event_id")
        .eq("event_id", eventId);
      for (const link of links || []) {
        await deleteForUser(link.user_id, eventId, link.google_event_id);
      }
      return;
    }

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("event_id", eventId)
      .single();
    if (!event) return;

    // Tentative (date-voting) and failed events have no real date to mirror.
    if (event.status === "tentative" || event.status === "failed" || !event.start_date) return;
    // Never push an event we pulled FROM Google back into the Eventli calendar
    // (would create a duplicate of the user's own Google event). Loop guard.
    if (event.external_source === "google") return;

    const { data: parts } = await supabaseAdmin
      .from("profiles_events")
      .select("user_id")
      .eq("event_id", eventId);
    const participantIds = (parts || []).map((p) => p.user_id);
    if (participantIds.length === 0) return;

    const { data: connected } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("user_id")
      .eq("sync_status", "active")
      .in("user_id", participantIds);

    for (const { user_id } of connected || []) {
      await upsertForUser(user_id, event).catch((e) =>
        console.error(`[google] sync event ${eventId} for ${user_id} failed:`, e.message)
      );
    }
  } catch (err) {
    console.error(`[google] syncEventToGoogle(${eventId}, ${action}) failed:`, err.message);
  }
}

async function upsertForUser(userId, event) {
  const conn = await getClientForUser(userId);
  if (!conn) return;
  const cal = google.calendar({ version: "v3", auth: conn.client });
  const calendarId = conn.calendarId || (await ensureCalendar(conn.client, null));
  const body = eventToGoogle(event);

  const { data: link } = await supabaseAdmin
    .from("google_event_links")
    .select("google_event_id")
    .eq("user_id", userId)
    .eq("event_id", event.event_id)
    .maybeSingle();

  if (link?.google_event_id) {
    await cal.events.update({ calendarId, eventId: link.google_event_id, requestBody: body });
  } else {
    const { data: created } = await cal.events.insert({ calendarId, requestBody: body });
    await supabaseAdmin
      .from("google_event_links")
      .upsert({ user_id: userId, event_id: event.event_id, google_event_id: created.id }, { onConflict: "user_id,event_id" });
  }
  await touchSync(userId);
}

async function deleteForUser(userId, eventId, googleEventId) {
  try {
    const conn = await getClientForUser(userId);
    if (conn) {
      const cal = google.calendar({ version: "v3", auth: conn.client });
      const calendarId = conn.calendarId;
      if (calendarId) await cal.events.delete({ calendarId, eventId: googleEventId });
    }
  } catch (e) {
    if (e?.code !== 404 && e?.code !== 410) console.error("[google] delete failed:", e.message);
  } finally {
    await supabaseAdmin.from("google_event_links").delete().eq("user_id", userId).eq("event_id", eventId);
  }
}

async function touchSync(userId) {
  await supabaseAdmin
    .from("google_calendar_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId);
}

// Safety net (run on a cron): for every active connection, push any upcoming
// events the user participates in that don't yet have a Google link — i.e. ones
// whose inline push failed or that were created while Google was unreachable.
export async function reconcileGoogleSync() {
  if (!isGoogleConfigured()) return;
  try {
    const { data: conns } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("user_id")
      .eq("sync_status", "active");
    const today = new Date().toISOString().slice(0, 10);

    for (const { user_id } of conns || []) {
      const { data: mine } = await supabaseAdmin
        .from("profiles_events")
        .select("event_id")
        .eq("user_id", user_id);
      const myEventIds = (mine || []).map((m) => m.event_id);
      if (myEventIds.length === 0) continue;

      const { data: events } = await supabaseAdmin
        .from("events")
        .select("event_id, status, start_date")
        .in("event_id", myEventIds)
        .gte("start_date", today);

      const { data: links } = await supabaseAdmin
        .from("google_event_links")
        .select("event_id")
        .eq("user_id", user_id);
      const linked = new Set((links || []).map((l) => l.event_id));

      for (const ev of events || []) {
        if (linked.has(ev.event_id)) continue;
        if (ev.status === "tentative" || ev.status === "failed") continue;
        await syncEventToGoogle(ev.event_id, "upsert");
      }
    }
  } catch (err) {
    console.error("[google] reconcile sweep failed:", err.message);
  }
}

// Push all of a user's existing events into their freshly-connected calendar.
export async function backfillUser(userId) {
  const conn = await getClientForUser(userId);
  if (!conn) return;
  const { data: rows } = await supabaseAdmin
    .from("events")
    .select("event_id")
    .order("event_id");
  // Restrict to events the user participates in.
  const { data: mine } = await supabaseAdmin
    .from("profiles_events")
    .select("event_id")
    .eq("user_id", userId);
  const myEventIds = new Set((mine || []).map((m) => m.event_id));
  for (const r of rows || []) {
    if (!myEventIds.has(r.event_id)) continue;
    const { data: event } = await supabaseAdmin.from("events").select("*").eq("event_id", r.event_id).single();
    if (event) await upsertForUser(userId, event).catch((e) => console.error("[google] backfill event failed:", e.message));
  }
}

// ===========================================================================
// Phase B — Pull (Google → Eventli)
// ===========================================================================

// Retry helper for Google API calls: backs off on rate-limit / 5xx.
async function withBackoff(fn, label) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const code = e?.code || e?.response?.status;
      const reason = e?.errors?.[0]?.reason || e?.response?.data?.error?.errors?.[0]?.reason || "";
      const retriable =
        code === 429 ||
        (code >= 500 && code < 600) ||
        (code === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(reason));
      if (!retriable || attempt >= 4) throw e;
      const delay = Math.min(2000 * 2 ** attempt, 30000) + Math.random() * 500;
      console.warn(`[google] ${label} retry ${attempt + 1} (code ${code}) in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

// Convert a tz-aware instant (Date) to naive wall-clock in `tz`. Eventli stores
// naive date + time, so we render the instant in the user's configured timezone.
function toWallClock(instant, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour; // some ICU builds emit "24"
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}:${p.second}` };
}

// Map a Google Calendar event resource → Eventli event fields (inverse of
// eventToGoogle). Returns null for events we can't/shouldn't import.
export function googleToEvent(gEvent, tz = DEFAULT_TZ) {
  const trunc = (s, n) => (s == null ? null : String(s).slice(0, n));
  const recurringEventId = gEvent.recurringEventId || null;
  const originalStartDate = gEvent.originalStartTime
    ? (gEvent.originalStartTime.date
        || (gEvent.originalStartTime.dateTime ? toWallClock(new Date(gEvent.originalStartTime.dateTime), tz).date : null))
    : null;

  if (gEvent.status === "cancelled") {
    return { cancelled: true, externalUid: gEvent.id, recurringEventId, originalStartDate };
  }
  if (!gEvent.summary || !gEvent.start) return null;

  const out = {
    cancelled: false,
    externalUid: gEvent.id,
    recurringEventId,
    originalStartDate,
    googleUpdatedAt: gEvent.updated || null,
    event_title: trunc(gEvent.summary, 255),
    event_description: trunc(gEvent.description, 5000) || "",
    location: trunc(gEvent.location, 500) || "",
  };

  if (gEvent.start.date) {
    out.all_day = true;
    out.start_date = gEvent.start.date;
    out.end_date = gEvent.end?.date ? addDays(gEvent.end.date, -1) : gEvent.start.date; // Google end is exclusive
    out.start_time = null;
    out.end_time = null;
  } else {
    out.all_day = false;
    const s = toWallClock(new Date(gEvent.start.dateTime), tz);
    out.start_date = s.date;
    out.start_time = s.time;
    if (gEvent.end?.dateTime) {
      const e = toWallClock(new Date(gEvent.end.dateTime), tz);
      out.end_date = e.date;
      out.end_time = e.time;
    } else {
      out.end_date = s.date;
      out.end_time = s.time;
    }
  }

  if (Array.isArray(gEvent.recurrence)) {
    const rrule = gEvent.recurrence.find((r) => /^RRULE:/i.test(r));
    if (rrule) out.recurrence_rule = rrule.replace(/^RRULE:/i, "");
  }
  return out;
}

// List the user's Google calendars (minus our own app-created Eventli one).
export async function listUserCalendars(userId) {
  const conn = await getClientForUser(userId);
  if (!conn) return [];
  const cal = google.calendar({ version: "v3", auth: conn.client });
  const items = [];
  let pageToken;
  do {
    const { data } = await withBackoff(
      () => cal.calendarList.list({ pageToken, maxResults: 250 }),
      "calendarList.list"
    );
    for (const c of data.items || []) items.push(c);
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Hide our own app-created "Eventli" calendar(s) — by id, and by name as a
  // belt-and-suspenders guard against any duplicates created before this fix.
  return items
    .filter((c) => c.id !== conn.calendarId && (c.summaryOverride || c.summary) !== EVENTLI_CALENDAR_NAME)
    .map((c) => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: !!c.primary, accessRole: c.accessRole }));
}

// Apply one pulled Google event to Eventli: insert/update/delete, mapping
// recurring masters, exception instances (→ event_overrides), and cancellations.
async function applyPulledEvent(userId, calendarId, gEvent) {
  const m = googleToEvent(gEvent);
  if (!m) return;

  // Cancellation
  if (m.cancelled) {
    if (m.recurringEventId && m.originalStartDate) {
      const { data: parent } = await supabaseAdmin
        .from("events").select("event_id")
        .eq("external_uid", m.recurringEventId).eq("created_by", userId).eq("external_source", "google")
        .maybeSingle();
      if (parent) {
        await supabaseAdmin.from("event_overrides").upsert(
          { event_id: parent.event_id, occurrence_date: m.originalStartDate, is_cancelled: true },
          { onConflict: "event_id,occurrence_date" }
        );
      }
    } else {
      const { data: existing } = await supabaseAdmin
        .from("events").select("event_id")
        .eq("external_uid", m.externalUid).eq("created_by", userId).eq("external_source", "google")
        .maybeSingle();
      if (existing) {
        await supabaseAdmin.from("profiles_events").delete().eq("event_id", existing.event_id);
        await supabaseAdmin.from("events").delete().eq("event_id", existing.event_id);
      }
    }
    return;
  }

  // Modified instance of a recurring series → per-occurrence override
  if (m.recurringEventId && m.originalStartDate) {
    const { data: parent } = await supabaseAdmin
      .from("events").select("event_id")
      .eq("external_uid", m.recurringEventId).eq("created_by", userId).eq("external_source", "google")
      .maybeSingle();
    if (parent) {
      await supabaseAdmin.from("event_overrides").upsert(
        {
          event_id: parent.event_id, occurrence_date: m.originalStartDate, is_cancelled: false,
          event_title: m.event_title, event_description: m.event_description,
          start_date: m.start_date, end_date: m.end_date,
          start_time: m.start_time, end_time: m.end_time, all_day: m.all_day,
        },
        { onConflict: "event_id,occurrence_date" }
      );
    }
    return;
  }

  // Master / single event
  const { data: existing } = await supabaseAdmin
    .from("events").select("event_id, google_updated_at")
    .eq("external_uid", m.externalUid).eq("created_by", userId).eq("external_source", "google")
    .maybeSingle();

  // Skip if unchanged since last pull
  if (existing && existing.google_updated_at && m.googleUpdatedAt &&
      new Date(m.googleUpdatedAt) <= new Date(existing.google_updated_at)) {
    return;
  }

  const row = {
    event_title: m.event_title,
    event_description: m.event_description,
    location: m.location,
    all_day: m.all_day,
    start_date: m.start_date,
    end_date: m.end_date,
    start_time: m.start_time,
    end_time: m.end_time,
    recurrence_rule: m.recurrence_rule || null,
    created_by: userId,
    groups_id: null,
    status: "confirmed",
    external_uid: m.externalUid,
    external_source: "google",
    google_calendar_id: calendarId,
    google_updated_at: m.googleUpdatedAt,
  };

  if (existing) {
    await supabaseAdmin.from("events").update(row).eq("event_id", existing.event_id);
  } else {
    const { data: inserted } = await supabaseAdmin.from("events").insert(row).select("event_id").single();
    if (inserted) {
      await supabaseAdmin.from("profiles_events").upsert(
        { user_id: userId, event_id: inserted.event_id, rsvp_status: "going" },
        { onConflict: "user_id,event_id" }
      );
    }
  }
}

// Incremental pull of one calendar. Uses a stored sync token; on 410 it resets
// to a full resync over the configured history window.
export async function pullCalendar(userId, calRow) {
  const conn = await getClientForUser(userId);
  if (!conn) return;
  const cal = google.calendar({ version: "v3", auth: conn.client });
  const calendarId = calRow.google_calendar_id;

  let syncToken = calRow.sync_token || null;
  let pageToken;
  let newSyncToken = null;
  let processed = 0;
  const base = { calendarId, singleEvents: false, showDeleted: true, maxResults: 250 };

  for (;;) {
    const params = { ...base, pageToken };
    if (syncToken) params.syncToken = syncToken;
    else params.timeMin = new Date(Date.now() - PULL_HISTORY_DAYS * 864e5).toISOString();

    let data;
    try {
      ({ data } = await withBackoff(() => cal.events.list(params), "events.list"));
    } catch (e) {
      if ((e?.code || e?.response?.status) === 410) {
        // Sync token invalid → full resync from scratch.
        await supabaseAdmin.from("google_synced_calendars")
          .update({ sync_token: null }).eq("user_id", userId).eq("google_calendar_id", calendarId);
        syncToken = null; pageToken = undefined; newSyncToken = null; processed = 0;
        continue;
      }
      throw e;
    }

    for (const g of data.items || []) {
      if (processed >= MAX_EVENTS_PER_PULL) break;
      if (g.extendedProperties?.private?.eventliEventId) continue; // our own pushed event — skip
      await applyPulledEvent(userId, calendarId, g).catch((e) =>
        console.error("[google] applyPulledEvent failed:", e.message)
      );
      processed++;
    }

    newSyncToken = data.nextSyncToken || newSyncToken;
    pageToken = data.nextPageToken;
    if (!pageToken || processed >= MAX_EVENTS_PER_PULL) break;
  }

  const update = { last_pulled_at: new Date().toISOString() };
  if (newSyncToken) update.sync_token = newSyncToken;
  await supabaseAdmin.from("google_synced_calendars")
    .update(update).eq("user_id", userId).eq("google_calendar_id", calendarId);
}

// Polling baseline: pull every enabled calendar for every active connection.
export async function pullAllUsers() {
  if (!isGoogleConfigured()) return;
  try {
    const { data: cals } = await supabaseAdmin
      .from("google_synced_calendars")
      .select("user_id, google_calendar_id, sync_token")
      .eq("enabled", true);
    for (const calRow of cals || []) {
      await pullCalendar(calRow.user_id, calRow).catch((e) =>
        console.error(`[google] pull ${calRow.google_calendar_id} failed:`, e.message)
      );
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300)); // jitter to spread API load
    }
  } catch (err) {
    console.error("[google] pullAllUsers failed:", err.message);
  }
}

// Remove Google-origin mirror events for a user (optionally one calendar).
export async function removePulledEvents(userId, calendarId = null) {
  let q = supabaseAdmin.from("events").select("event_id").eq("created_by", userId).eq("external_source", "google");
  if (calendarId) q = q.eq("google_calendar_id", calendarId);
  const { data: rows } = await q;
  const ids = (rows || []).map((r) => r.event_id);
  if (ids.length === 0) return;
  await supabaseAdmin.from("profiles_events").delete().in("event_id", ids);
  await supabaseAdmin.from("events").delete().in("event_id", ids); // cascades event_overrides
}

// ── Webhook (watch) channels ───────────────────────────────────────────────
// Subscribe to push notifications for a calendar. Requires a public HTTPS
// address; fails gracefully in local dev (polling still covers sync).
export async function watchCalendar(userId, calendarId) {
  if (!process.env.APP_URL?.startsWith("https")) return; // webhooks need public HTTPS
  const conn = await getClientForUser(userId);
  if (!conn) return;
  const cal = google.calendar({ version: "v3", auth: conn.client });
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomBytes(24).toString("base64url");
  const expiration = Date.now() + WATCH_TTL_MS;
  try {
    const { data } = await withBackoff(() => cal.events.watch({
      calendarId,
      requestBody: {
        id: channelId, type: "web_hook",
        address: `${process.env.APP_URL}/api/calendar/google/notifications`,
        token: channelToken, expiration: String(expiration),
      },
    }), "events.watch");
    await supabaseAdmin.from("google_synced_calendars").update({
      channel_id: channelId,
      channel_resource_id: data.resourceId,
      channel_token: channelToken,
      channel_expiration: new Date(Number(data.expiration) || expiration).toISOString(),
    }).eq("user_id", userId).eq("google_calendar_id", calendarId);
  } catch (e) {
    console.warn("[google] events.watch failed (webhook off, polling still active):", e.message);
  }
}

export async function stopChannel(userId, calRow) {
  if (!calRow?.channel_id || !calRow?.channel_resource_id) return;
  const conn = await getClientForUser(userId);
  if (!conn) return;
  const cal = google.calendar({ version: "v3", auth: conn.client });
  try {
    await cal.channels.stop({ requestBody: { id: calRow.channel_id, resourceId: calRow.channel_resource_id } });
  } catch (e) {
    console.warn("[google] channels.stop failed:", e.message);
  }
}

export async function renewExpiringChannels() {
  if (!isGoogleConfigured() || !process.env.APP_URL?.startsWith("https")) return;
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from("google_synced_calendars")
    .select("*").eq("enabled", true).not("channel_id", "is", null).lt("channel_expiration", soon);
  for (const row of rows || []) {
    await stopChannel(row.user_id, row).catch(() => {});
    await watchCalendar(row.user_id, row.google_calendar_id).catch((e) =>
      console.error("[google] channel renew failed:", e.message)
    );
  }
}

// Webhook trigger: debounced per-calendar pull (the notification carries no data,
// it's just a "something changed" signal).
const lastWebhookPull = new Map();
export function triggerCalendarPull(userId, calendarId) {
  const key = `${userId}:${calendarId}`;
  const now = Date.now();
  if (now - (lastWebhookPull.get(key) || 0) < 30000) return; // debounce
  lastWebhookPull.set(key, now);
  supabaseAdmin
    .from("google_synced_calendars")
    .select("user_id, google_calendar_id, sync_token")
    .eq("user_id", userId).eq("google_calendar_id", calendarId).maybeSingle()
    .then(({ data }) => { if (data) return pullCalendar(data.user_id, data); })
    .catch((e) => console.error("[google] webhook pull failed:", e.message));
}
