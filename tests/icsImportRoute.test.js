import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

const log = [];
let fake, server, base;

// Next year: always in the future (the import skips past one-off events), and
// within the range where node-ical's and ICU's DST tables agree.
const Y = new Date().getFullYear() + 1;

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//EN",
  "BEGIN:VEVENT", "UID:v1", "SUMMARY:One", `DTSTART;VALUE=DATE:${Y}1010`, `DTEND;VALUE=DATE:${Y}1011`, "END:VEVENT",
  "BEGIN:VEVENT", "UID:v2", "SUMMARY:Two", `DTSTART;VALUE=DATE:${Y}1012`, `DTEND;VALUE=DATE:${Y}1013`, "END:VEVENT",
  "BEGIN:VEVENT", "UID:v3", "SUMMARY:Three", `DTSTART;TZID=Europe/Brussels:${Y}1014T140000`, `DTEND;TZID=Europe/Brussels:${Y}1014T150000`, "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.split("?")[0];
      log.push({ line: `${req.method} ${path}`, body });
      res.setHeader("content-type", "application/json");
      const one = String(req.headers.accept || "").includes("vnd.pgrst.object");
      if (path === "/auth/v1/user") return res.end(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", aud: "authenticated" }));
      if (req.method === "GET" && path === "/rest/v1/profiles") {
        const row = { notification_prefs: { timezone: "Europe/Brussels" } };
        return res.end(JSON.stringify(one ? row : [row]));
      }
      if (req.method === "POST" && path === "/rest/v1/events") {
        res.statusCode = 201;
        const row = { event_id: log.filter((l) => l.line === "POST /rest/v1/events").length };
        return res.end(JSON.stringify(one ? row : [row]));
      }
      if (req.method === "POST") { res.statusCode = 201; return res.end("[]"); }
      res.end("[]");
    });
  }).listen(0, "127.0.0.1");
  await new Promise((r) => fake.on("listening", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const icalRouter = (await import("../routes/ical.js")).default;
  const app = express();
  app.use(cookieParser());
  app.use("/api", icalRouter);
  app.use((err, req, res, next) => res.status(500).json({ success: false, error: err.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

it("imports every event, adds the importer as participant, and stores wall-clock times", async () => {
  const fd = new FormData();
  fd.append("ics", new Blob([ICS], { type: "text/calendar" }), "t.ics");
  const r = await fetch(`${base}/api/calendar/import`, {
    method: "POST",
    body: fd,
    headers: { cookie: "authCookie=t; refreshToken=r; expiresAt=9999999999" },
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ success: true, imported: 3, skipped: 0 });

  const inserts = log.filter((l) => l.line === "POST /rest/v1/events").map((l) => JSON.parse(l.body));
  expect(inserts).toHaveLength(3);
  expect(inserts[0]).toMatchObject({ start_date: `${Y}-10-10`, end_date: `${Y}-10-10`, all_day: true });
  expect(inserts[2]).toMatchObject({ start_date: `${Y}-10-14`, start_time: "14:00", end_time: "15:00", all_day: false });
  expect(log.filter((l) => l.line === "POST /rest/v1/profiles_events")).toHaveLength(3);
});
