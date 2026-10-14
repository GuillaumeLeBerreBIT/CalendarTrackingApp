import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

// Mounts the real events/groups routers against a local Supabase stand-in
// (no network, no real database). GET filters `col=eq.value` are applied to
// in-memory rows; the caller is whoever the authCookie names.
const OWNER = "00000000-0000-4000-8000-0000000000aa";
const MEMBER = "00000000-0000-4000-8000-0000000000bb";
const STRANGER = "00000000-0000-4000-8000-0000000000cc";

const tables = {
  events: [{ event_id: 10, created_by: OWNER, groups_id: 1 }],
  profiles_groups: [
    { user_id: OWNER, groups_id: 1, invite_status: "accepted", role: "admin", profiles: { username: "o", email: "o@x" } },
    { user_id: MEMBER, groups_id: 1, invite_status: "accepted", role: "member", profiles: { username: "m", email: "m@x" } },
  ],
  profiles_events: [],
  event_comments: [],
  groups: [{ groups_id: 1, groups_title: "g" }],
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
    const table = url.pathname.replace("/rest/v1/", "");
    let rows = tables[table] ?? [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    }
    const one = String(req.headers.accept || "").includes("vnd.pgrst.object");
    res.end(JSON.stringify(one ? rows[0] ?? null : rows));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => fake.on("listening", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", (await import("../routes/events.js")).default);
  app.use("/api", (await import("../routes/groups.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

const get = (path, user) =>
  fetch(`${base}/api${path}`, { headers: { cookie: `authCookie=${user}; refreshToken=r; expiresAt=9999999999` } });

it("event comments: group member gets them, a stranger gets 404", async () => {
  expect((await get("/events/10/comments", MEMBER)).status).toBe(200);
  expect((await get("/events/10/comments", STRANGER)).status).toBe(404);
});

it("group members list: member 200, stranger 403", async () => {
  expect((await get("/getGroupMembers/1", MEMBER)).status).toBe(200);
  expect((await get("/getGroupMembers/1", STRANGER)).status).toBe(403);
});
