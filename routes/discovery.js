import express from "express";
import rateLimit from "express-rate-limit";
import authRequire from "../utils/utils.js";

const router = express.Router();

// Stay well under Ticketmaster's free quota (5 req/s, 5000/day): cap callers and
// cache responses so repeated page loads don't each hit the upstream API.
const discoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // key: query string → { ts, events }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£" };

// Our filter category → Ticketmaster classificationName (segment). 'food' has no TM
// segment, so it falls back to a keyword search (handled in the route).
const CATEGORY_TO_CLASSIFICATION = {
  music: "Music",
  sports: "Sports",
  art: "Arts & Theatre",
};

// TM segment name → our DiscoveryEvent.cat enum
function segmentToCat(segmentName) {
  switch (segmentName) {
    case "Music": return "music";
    case "Sports": return "sports";
    case "Arts & Theatre":
    case "Film": return "art";
    default: return "market";
  }
}

// Pick a wide, reasonably-sized cover image from TM's images array.
function pickImage(images) {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const wide = images
    .filter((i) => i.ratio === "16_9" && i.width >= 640)
    .sort((a, b) => a.width - b.width)[0];
  if (wide) return wide.url;
  // Fall back to the widest image of any ratio
  const widest = [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return widest?.url;
}

function formatDate(localDate) {
  if (!localDate) return "";
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) return localDate;
  return `${d} ${MONTHS[m - 1]}`;
}

export function mapTicketmasterEvent(e) {
  const start = e?.dates?.start ?? {};
  const venue = e?._embedded?.venues?.[0] ?? {};
  const segment = e?.classifications?.[0]?.segment?.name;

  // Price: TM frequently omits priceRanges. Unknown price must NOT read as free,
  // so priceVal is null (the 'Free' filter only matches priceVal === 0).
  const pr = Array.isArray(e?.priceRanges) ? e.priceRanges[0] : null;
  let price = "";
  let priceVal = null;
  if (pr && typeof pr.min === "number") {
    priceVal = pr.min;
    const symbol = CURRENCY_SYMBOLS[pr.currency] || `${pr.currency || ""} `;
    price = pr.min === 0 ? "Free" : `${symbol}${Math.round(pr.min)}`;
  }

  return {
    id: `tm_${e.id}`,
    title: e.name || "Untitled event",
    blurb: (e.info || e.pleaseNote || "").trim(),
    cat: segmentToCat(segment),
    source: "ticket",
    date: formatDate(start.localDate),
    time: start.localTime ? start.localTime.slice(0, 5) : "",
    // Local datetime (TM's dateTime is UTC, which would shift the saved time)
    startISO: start.localDate ? `${start.localDate}T${start.localTime || "00:00:00"}` : (start.dateTime || ""),
    venue: venue.name || "",
    area: venue?.city?.name || "",
    price,
    priceVal,
    image: pickImage(e.images),
    url: e.url || undefined,
    going: [],
    attendees: 0,
    organiser: e?.promoter?.name || venue.name || "",
  };
}

// Build ISO datetime range for the `when` filter (today / weekend), in UTC.
function buildDateRange(when) {
  if (when !== "today" && when !== "weekend") return {};
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 19) + "Z";

  if (when === "today") {
    const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(now); end.setUTCHours(23, 59, 59, 0);
    return { startDateTime: iso(start), endDateTime: iso(end) };
  }

  // weekend = upcoming (or current) Saturday 00:00 → Sunday 23:59
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const daysUntilSat = (6 - day + 7) % 7;
  const sat = new Date(now); sat.setUTCDate(now.getUTCDate() + daysUntilSat); sat.setUTCHours(0, 0, 0, 0);
  const sun = new Date(sat); sun.setUTCDate(sat.getUTCDate() + 1); sun.setUTCHours(23, 59, 59, 0);
  return { startDateTime: iso(sat), endDateTime: iso(sun) };
}

/**
 * GET /api/discovery
 * Proxies the Ticketmaster Discovery API and maps results to DiscoveryEvent[].
 * Query: keyword, city, countryCode (default BE), category, when (today|weekend), size
 * Default location: falls back to the caller's saved profile city, else Belgium.
 */
router.get("/discovery", authRequire, discoveryLimiter, async (req, res) => {
  try {
    const apiKey = process.env.TICKET_MASTER_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Discovery is not configured." });
    }

    const { keyword, category, when } = req.query;
    let city = (req.query.city || "").trim();
    const countryCode = (req.query.countryCode || "BE").trim();
    const size = Math.min(parseInt(req.query.size, 10) || 40, 100);

    // No explicit city → default to the user's saved profile city (if any).
    if (!city) {
      const { data: profile } = await req.supabase
        .from("profiles")
        .select("city")
        .eq("user_id", req.cookies.userId)
        .single();
      if (profile?.city) city = profile.city.trim();
    }

    const params = new URLSearchParams();
    params.set("apikey", apiKey);
    params.set("countryCode", countryCode);
    params.set("sort", "date,asc");
    params.set("size", String(size));
    if (city) params.set("city", city);

    // Category → classificationName; 'food' has no TM segment so use it as a keyword.
    const classification = CATEGORY_TO_CLASSIFICATION[category];
    if (classification) params.set("classificationName", classification);
    let kw = (keyword || "").trim();
    if (category === "food" && !kw) kw = "food";
    if (kw) params.set("keyword", kw);

    const range = buildDateRange(when);
    if (range.startDateTime) params.set("startDateTime", range.startDateTime);
    if (range.endDateTime) params.set("endDateTime", range.endDateTime);

    const cacheKey = params.toString().replace(/apikey=[^&]*&?/, "");
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return res.json({ success: true, events: hit.events, cached: true });
    }

    const tmRes = await fetch(`${TM_BASE}?${params.toString()}`);
    if (!tmRes.ok) {
      const body = await tmRes.text().catch(() => "");
      console.error("Ticketmaster API error:", tmRes.status, body.slice(0, 300));
      return res.status(502).json({ success: false, error: "Could not load events right now." });
    }

    const data = await tmRes.json();
    const rawEvents = data?._embedded?.events ?? [];
    // TM returns the same show multiple times (one entry per ticket pool, distinct
    // ids) — dedupe on title+date+venue, keeping the first (earliest, sort=date,asc).
    const seen = new Set();
    const events = rawEvents.map(mapTicketmasterEvent).filter((ev) => {
      const sig = `${ev.title.toLowerCase()}|${ev.date}|${ev.venue.toLowerCase()}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    cache.set(cacheKey, { ts: Date.now(), events });
    return res.json({ success: true, events });
  } catch (error) {
    console.error("GET /discovery error:", error);
    return res.status(500).json({ success: false, error: "Could not load events right now." });
  }
});

export default router;
