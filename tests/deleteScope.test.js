import { it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import http from "http";

// Real groups router against an in-memory PostgREST stand-in (no network, no
// real database). The deletion itself is the delete_group() SQL function,
// tested against Postgres by db/tests/run_delete_group_test.sh; here we check
// what the route does around it: who may call it, and what it sends.
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

let db, log, rpcResult;
const seed = () => ({
  groups: [
    { groups_id: 1, groups_title: "Home", tag_name: "HOME" },
    { groups_id: 2, groups_title: "Weekend Crew", tag_name: "HOME" },
  ],
  profiles_groups: [
    { user_id: ME, groups_id: 1, role: "admin", invite_status: "accepted" },
    { user_id: ME, groups_id: 2, role: "admin", invite_status: "accepted" },
    { user_id: OTHER, groups_id: 2, role: "member", invite_status: "accepted" },
  ],
  task_list: [
    { task_list_id: 10, groups_id: 1, task_list_title: "Afspraken" },
    { task_list_id: 20, groups_id: 2, task_list_title: "Packing" },
    { task_list_id: 21, groups_id: 2, task_list_title: "Food" },
  ],
  task: [
    { task_id: 100, task_list_id: 10, task_title: "Tandarts" },
    { task_id: 200, task_list_id: 20, task_title: "Tent" },
    { task_id: 201, task_list_id: 20, task_title: "Stove" },
  ],
  events: [
    { event_id: 1000, groups_id: 1 },
    { event_id: 2000, groups_id: 2 },
  ],
});

function matches(row, params) {
  for (const [k, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const v = String(row[k]);
    if (raw.startsWith("eq.")) { if (v !== raw.slice(3)) return false; }
    else if (raw.startsWith("in.(")) { if (!raw.slice(4, -1).split(",").includes(v)) return false; }
    else throw new Error(`fake PostgREST: unsupported filter ${k}=${raw}`);
  }
  return true;
}

let fake, server, base;

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      log.push({ method: req.method, path: url.pathname, body, auth: req.headers.authorization });
      res.setHeader("content-type", "application/json");
      if (url.pathname === "/auth/v1/user") {
        const token = String(req.headers.authorization || "").replace("Bearer ", "");
        return res.end(JSON.stringify({ id: token, aud: "authenticated" }));
      }
      if (url.pathname === "/rest/v1/rpc/delete_group") {
        res.statusCode = rpcResult.status;
        return res.end(JSON.stringify(rpcResult.body));
      }
      const rows = db[url.pathname.replace("/rest/v1/", "")] ?? [];
      const hit = rows.filter((r) => matches(r, url.searchParams));
      if (String(req.headers.prefer || "").includes("count=exact")) res.setHeader("content-range", `*/${hit.length}`);
      const one = String(req.headers.accept || "").includes("vnd.pgrst.object");
      res.end(JSON.stringify(one ? hit[0] ?? null : hit));
    });
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
  app.use("/api", (await import("../routes/groups.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  db = seed();
  log = [];
  rpcResult = { status: 200, body: { task_lists: 2, tasks: 2, events: 1 } };
});
afterAll(() => { server?.close(); fake?.close(); });

const call = (method, path, user = ME) =>
  fetch(`${base}/api${path}`, { method, headers: { cookie: `authCookie=${user}; refreshToken=r; expiresAt=9999999999` } });
const rpcCalls = () => log.filter((l) => l.path === "/rest/v1/rpc/delete_group");
const tableDeletes = () => log.filter((l) => l.method === "DELETE");

it("an admin's delete goes through delete_group() for that group only, as the service role", async () => {
  const r = await call("DELETE", "/groups/2");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ success: true, deleted: { task_lists: 2, tasks: 2, events: 1 } });
  expect(rpcCalls()).toHaveLength(1);
  expect(JSON.parse(rpcCalls()[0].body)).toEqual({ p_group_id: 2 });
  expect(rpcCalls()[0].auth).toBe("Bearer test-secret");
  expect(tableDeletes()).toEqual([]); // no piecemeal deletes left in the route
});

it("a non-admin cannot delete, and nothing is sent to the database", async () => {
  const r = await call("DELETE", "/groups/2", OTHER);
  expect(r.status).toBe(403);
  expect(rpcCalls()).toEqual([]);
});

it("a failed delete reports that nothing was deleted", async () => {
  rpcResult = { status: 409, body: { code: "23503", message: "violates foreign key constraint" } };
  const r = await call("DELETE", "/groups/2");
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ success: false, error: "Could not delete the group. Nothing was deleted." });
});

it("says the migration is missing when delete_group() does not exist yet", async () => {
  rpcResult = { status: 404, body: { code: "PGRST202", message: "Could not find the function public.delete_group" } };
  const r = await call("DELETE", "/groups/2");
  expect(r.status).toBe(503);
  expect((await r.json()).error).toMatch(/database update/i);
});

it("an unknown group is a 404", async () => {
  rpcResult = { status: 200, body: null };
  const r = await call("DELETE", "/groups/2");
  expect(r.status).toBe(404);
});

it("invalid group ids are rejected before any query", async () => {
  const r = await call("DELETE", "/groups/abc");
  expect(r.status).toBe(400);
  expect(rpcCalls()).toEqual([]);
});

it("delete preview lists exactly what would be removed, for that group only", async () => {
  const r = await call("GET", "/groups/2/delete-preview");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    success: true,
    groupTitle: "Weekend Crew",
    taskLists: [{ title: "Packing", tasks: 2 }, { title: "Food", tasks: 0 }],
    events: 1,
  });
});

it("delete preview is for group admins only", async () => {
  expect((await call("GET", "/groups/2/delete-preview", OTHER)).status).toBe(403);
});
