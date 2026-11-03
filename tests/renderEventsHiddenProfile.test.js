import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

// renderEvents against a local Supabase stand-in (no network). Under the access rules,
// RLS returns `profiles: null` for a participant the viewer shares no accepted group with.
// The route must not crash, and must fill the username (only) through the admin client.
const ME = "00000000-0000-4000-8000-0000000000aa";
const HIDDEN = "00000000-0000-4000-8000-0000000000bb";

const personal = {
  event_id: 7, event_title: "Dinner", event_description: "", all_day: false,
  start_date: "2026-11-10", end_date: "2026-11-10", start_time: "19:00:00", end_time: "21:00:00",
  groups_id: null, created_by: ME, recurrence_rule: null, status: "confirmed", pact_id: null,
  timezone: "Europe/Brussels",
  mine: [{ user_id: ME }],
  profiles_events: [
    { user_id: ME, rsvp_status: "going", profiles: { username: "me" } },
    { user_id: HIDDEN, rsvp_status: "pending", profiles: null },
  ],
};

let fake, server, base;
const log = [];

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/auth/v1/user") {
      const token = String(req.headers.authorization || "").replace("Bearer ", "");
      return res.end(JSON.stringify({ id: token, aud: "authenticated" }));
    }
    const table = url.pathname.replace("/rest/v1/", "");
    log.push({ table, authorization: req.headers.authorization, query: url.search });
    if (table === "events" && url.searchParams.get("groups_id") === "is.null") {
      return res.end(JSON.stringify([structuredClone(personal)]));
    }
    if (table === "profiles") {
      return res.end(JSON.stringify([{ user_id: HIDDEN, username: "hanne" }]));
    }
    res.end("[]");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => fake.on("listening", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const app = express();
  app.use(cookieParser());
  app.use("/api", (await import("../routes/events.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

it("a participant with a hidden profile neither crashes renderEvents nor loses their name", async () => {
  const r = await fetch(`${base}/api/renderEvents?from=2026-11-01&to=2026-11-30`, {
    headers: { cookie: `authCookie=${ME}; refreshToken=r; expiresAt=9999999999; userId=${ME}` },
  });
  expect(r.status).toBe(200);
  const body = await r.json();
  const text = JSON.stringify(body);
  expect(text).toContain("hanne");

  const lookup = log.filter((l) => l.table === "profiles");
  expect(lookup).toHaveLength(1);
  expect(lookup[0].authorization).toBe("Bearer test-secret");
  expect(decodeURIComponent(lookup[0].query)).toContain("select=user_id,username");
  expect(decodeURIComponent(lookup[0].query)).toContain(HIDDEN);
  expect(text).not.toContain("@");
});
