import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

// Real routines router against a local Supabase stand-in (no network).
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

const rec = { all_day: false, start_time: "19:00:00", end_time: "20:00:00", timezone: "Europe/Brussels", reminder_minutes: 30, groups_id: null, external_uid: null };
const tables = {
  events: [
    { ...rec, event_id: 1, created_by: ME, event_title: "Swim", start_date: "2026-01-05", end_date: "2026-01-05", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU" },
    { ...rec, event_id: 2, created_by: ME, event_title: "Old class", start_date: "2025-01-06", end_date: "2025-01-06", recurrence_rule: "FREQ=WEEKLY;UNTIL=20250301T235959Z" },
    { ...rec, event_id: 3, created_by: ME, event_title: "One-off", start_date: "2026-01-05", end_date: "2026-01-05", recurrence_rule: null },
    { ...rec, event_id: 4, created_by: ME, event_title: "Group practice", groups_id: 9, start_date: "2026-01-05", end_date: "2026-01-05", recurrence_rule: "FREQ=WEEKLY" },
    { ...rec, event_id: 5, created_by: ME, event_title: "Imported", external_uid: "abc", start_date: "2026-01-05", end_date: "2026-01-05", recurrence_rule: "FREQ=WEEKLY" },
    { ...rec, event_id: 6, created_by: OTHER, event_title: "Not mine", start_date: "2026-01-05", end_date: "2026-01-05", recurrence_rule: "FREQ=WEEKLY" },
  ],
  event_overrides: [],
};

let fake, server, base;

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/auth/v1/user") {
      const token = String(req.headers.authorization || "").replace("Bearer ", "");
      return res.end(JSON.stringify({ id: token, aud: "authenticated" }));
    }
    let rows = tables[url.pathname.replace("/rest/v1/", "")] ?? [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      else if (v === "is.null") rows = rows.filter((r) => r[k] == null);
      else if (v === "not.is.null") rows = rows.filter((r) => r[k] != null);
      else if (v.startsWith("in.(")) { const ids = v.slice(4, -1).split(","); rows = rows.filter((r) => ids.includes(String(r[k]))); }
    }
    res.end(JSON.stringify(rows));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => fake.on("listening", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const app = express();
  app.use(cookieParser());
  app.use("/api", (await import("../routes/routines.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

const get = (user) => fetch(`${base}/api/routines`, { headers: { cookie: `authCookie=${user}; refreshToken=r; expiresAt=9999999999` } });

it("lists only my own personal repeating events, active before finished", async () => {
  const body = await (await get(ME)).json();
  expect(body.success).toBe(true);
  expect(body.routines.map((r) => r.title)).toEqual(["Swim", "Old class"]);
  expect(body.routines[0].ended).toBe(false);
  expect(body.routines[0].next).toMatchObject({ time: "19:00" });
  expect(body.routines[1]).toMatchObject({ ended: true, next: null });
});

it("someone else sees only their own", async () => {
  const body = await (await get(OTHER)).json();
  expect(body.routines.map((r) => r.title)).toEqual(["Not mine"]);
});
