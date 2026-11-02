import { it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

// Real auth + email routers against a local Supabase stand-in (no network).
// Records each request's method, table and authorization header so tests can
// assert which key (user JWT, anon, secret) was used.
const ME = "00000000-0000-4000-8000-0000000000aa";

const tables = {
  profiles: [{ user_id: ME, username: "me", email: "me@x.test", email_digest_enabled: true }],
  events: [],
  profiles_groups: [],
  task_list: [],
  task: [],
};

let fake, server, base;
let log = [];

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/auth/v1/user") {
      const token = String(req.headers.authorization || "").replace("Bearer ", "");
      return res.end(JSON.stringify({ id: token, aud: "authenticated" }));
    }
    const table = url.pathname.replace("/rest/v1/", "");
    log.push({ method: req.method, table, authorization: req.headers.authorization });
    let rows = tables[table] ?? [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    }
    if (req.method !== "GET") return res.end("[]");
    // .single() asks for one object
    if (String(req.headers.accept).includes("vnd.pgrst.object")) return res.end(JSON.stringify(rows[0] ?? null));
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
  app.use(express.json());
  app.use("/api", (await import("../routes/auth.js")).default);
  app.use("/api", (await import("../routes/email.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });

const patch = (path, body, user, method = "PATCH") =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `authCookie=${user}; refreshToken=r; expiresAt=9999999999` },
    body: JSON.stringify(body),
  });
const writes = (table) => log.filter((r) => r.table === table && r.method !== "GET");
const reads = (table) => log.filter((r) => r.table === table && r.method === "GET");

it("PATCH /profile/city writes profiles as the logged-in user", async () => {
  log = [];
  await patch("/api/profile/city", { city: "Gent" }, ME);
  const w = writes("profiles");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(`Bearer ${ME}`);
});

it("PATCH /profile writes as the user", async () => {
  log = [];
  await patch("/api/profile", { searchable: true }, ME);
  const w = writes("profiles");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(`Bearer ${ME}`);
});

it("PATCH /profile/username writes as the user", async () => {
  log = [];
  await patch("/api/profile/username", { username: "newname" }, ME);
  const w = writes("profiles");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(`Bearer ${ME}`);
});

it("POST /email-preferences writes as the user", async () => {
  log = [];
  await patch("/api/email-preferences", { emailDigestEnabled: false }, ME, "POST");
  const w = writes("profiles");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(`Bearer ${ME}`);
});

it("fetchDigestData reads with the secret key", async () => {
  log = [];
  const { fetchDigestData } = await import("../routes/email.js");
  await fetchDigestData(ME);
  expect(reads("events").length).toBeGreaterThan(0);
  expect(log.every((r) => r.authorization === "Bearer test-secret")).toBe(true);
});
