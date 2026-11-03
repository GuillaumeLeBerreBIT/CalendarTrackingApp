import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";

// Real lists router against a local Supabase stand-in (no network).
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

let tables;
let denyWrites; // when true, any non-GET returns 403 / 42501
const resetTables = () => {
  tables = {
    profiles: [
      { user_id: ME, username: "me" },
      { user_id: OTHER, username: "harry" },
    ],
    groups: [{ groups_id: 7, groups_title: "Seven" }],
    lists: [
      { list_id: 1, kind: "shopping", title: "Groceries", created_by: ME, groups_id: null, created_at: "2026-11-01T10:00:00Z" },
      { list_id: 2, kind: "shopping", title: "Party", created_by: OTHER, groups_id: 7, created_at: "2026-11-02T10:00:00Z" },
    ],
    list_items: [
      { item_id: 10, list_id: 1, title: "milk", link: null, note: null, is_done: false, created_at: "2026-11-01T11:00:00Z" },
    ],
  };
  denyWrites = false;
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
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      log.push({ method: req.method, table, search: url.search, authorization: req.headers.authorization, body: raw });
      if (req.method !== "GET" && denyWrites) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ code: "42501", message: "rls" }));
      }
      let rows = tables[table] ?? [];
      for (const [k, v] of url.searchParams) {
        if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
        if (v.startsWith("in.(")) {
          const vals = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
          rows = rows.filter((r) => vals.includes(String(r[k])));
        }
      }
      if (req.method === "POST") {
        const body = [].concat(raw ? JSON.parse(raw) : []).map((r, i) => ({
          list_id: 50, item_id: 60 + i, created_at: "2026-11-03T10:00:00Z", is_done: false, link: null, note: null, ...r,
        }));
        return res.end(JSON.stringify(String(req.headers.accept).includes("vnd.pgrst.object") ? body[0] : body));
      }
      if (req.method === "PATCH") {
        if (rows.length === 0) return res.end("[]");
        const patch = JSON.parse(raw);
        return res.end(JSON.stringify(rows.map((r) => ({ ...r, ...patch }))));
      }
      if (req.method === "DELETE") return res.end(JSON.stringify(rows));
      res.end(JSON.stringify(rows));
    });
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
  app.use("/api", (await import("../routes/lists.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });
beforeEach(() => { resetTables(); log = []; });

const call = (method, path, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `authCookie=${ME}; userId=${ME}; refreshToken=r; expiresAt=9999999999` },
    body: body ? JSON.stringify(body) : undefined,
  });
const writes = (table) => log.filter((r) => r.table === table && r.method !== "GET");

it("GET /lists maps rows to ShoppingList, fills names with the secret key", async () => {
  const r = await call("GET", "/api/lists");
  expect(r.status).toBe(200);
  const { lists } = await r.json();
  expect(log.find((l) => l.table === "lists").search).toContain("order=created_at.desc"); // newest first
  expect(log.find((l) => l.table === "list_items").search).toContain("order=created_at.asc");
  lists.sort((a, b) => Number(b.listId) - Number(a.listId)); // stand-in does not sort
  expect(lists[0]).toMatchObject({ title: "Party", groupId: "7", groupTitle: "Seven", createdBy: OTHER, createdByName: "harry", items: [] });
  expect(lists[1]).toMatchObject({ groupId: null, groupTitle: null, createdByName: "me" });
  expect(lists[1].items[0]).toMatchObject({ itemId: "10", title: "milk", isDone: false });

  const prof = log.filter((l) => l.table === "profiles");
  expect(prof).toHaveLength(1);
  expect(prof[0].authorization).toBe("Bearer test-secret");
  expect(decodeURIComponent(prof[0].search)).toContain("select=user_id,username");
  for (const l of log.filter((l) => l.table === "lists" || l.table === "list_items")) {
    expect(l.authorization).toBe(`Bearer ${ME}`);
  }
});

it("never sends the anon key as a bearer", async () => {
  await call("GET", "/api/lists");
  await call("POST", "/api/lists", { title: "x", groupId: null });
  expect(log.some((l) => l.authorization === "Bearer test-anon")).toBe(false);
});

it("POST /lists rejects a blank title", async () => {
  const r = await call("POST", "/api/lists", { title: "  " });
  expect(r.status).toBe(400);
  expect(writes("lists")).toHaveLength(0);
});

it("POST /lists creates a personal shopping list, created_by from the cookie", async () => {
  const r = await call("POST", "/api/lists", { title: " Hardware ", groupId: null, created_by: OTHER, kind: "wishlist" });
  expect(r.status).toBe(201);
  const body = JSON.parse(writes("lists")[0].body);
  expect(body).toMatchObject({ kind: "shopping", title: "Hardware", groups_id: null, created_by: ME });
  const { list } = await r.json();
  expect(list).toMatchObject({ title: "Hardware", groupId: null, items: [] });
});

it("POST /lists maps an RLS denial to 403", async () => {
  denyWrites = true;
  const r = await call("POST", "/api/lists", { title: "x", groupId: "7" });
  expect(r.status).toBe(403);
});

it("POST /lists/:id/items inserts cleaned titles", async () => {
  const r = await call("POST", "/api/lists/7/items", { titles: [" milk ", "", "eggs"] });
  expect(r.status).toBe(201);
  const rows = JSON.parse(writes("list_items")[0].body);
  expect(rows).toHaveLength(2);
  expect(rows.map((x) => x.title)).toEqual(["milk", "eggs"]);
  expect(rows.every((x) => x.list_id === 7 && x.created_by === ME)).toBe(true);
  expect((await r.json()).items).toHaveLength(2);
});

it("POST /lists/:id/items rejects more than 100 titles", async () => {
  const r = await call("POST", "/api/lists/7/items", { titles: Array.from({ length: 101 }, (_, i) => `i${i}`) });
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe("Max 100 items at once");
});

it("PATCH /lists/items/:id validates and writes snake_case; routes to items, not :listId", async () => {
  expect((await call("PATCH", "/api/lists/items/10", { isDone: "yes" })).status).toBe(400);
  expect((await call("PATCH", "/api/lists/items/10", { link: "javascript:x" })).status).toBe(400);
  const long = await call("PATCH", "/api/lists/items/10", { link: "https://x.co/" + "a".repeat(2000) });
  expect(long.status).toBe(400);
  expect((await long.json()).error).toBe("Link is too long (max 2000 characters)");
  log = [];
  const r = await call("PATCH", "/api/lists/items/10", { isDone: true });
  expect(r.status).toBe(200);
  expect(log.filter((l) => l.table === "lists")).toHaveLength(0);
  const w = writes("list_items");
  expect(JSON.parse(w[0].body)).toEqual({ is_done: true });
  expect((await r.json()).item).toMatchObject({ itemId: "10", isDone: true });
});

it("PATCH /lists/items/:id returns 404 when no row matched", async () => {
  expect((await call("PATCH", "/api/lists/items/999", { isDone: true })).status).toBe(404);
});

it("PATCH and DELETE /lists/:id return 404 on zero rows", async () => {
  expect((await call("PATCH", "/api/lists/999", { title: "x" })).status).toBe(404);
  expect((await call("DELETE", "/api/lists/999")).status).toBe(404);
  expect((await call("PATCH", "/api/lists/1", { title: "New" })).status).toBe(200);
  expect((await call("DELETE", "/api/lists/1")).status).toBe(200);
});

it("DELETE /lists/:id/items/done deletes done items of that list", async () => {
  const r = await call("DELETE", "/api/lists/7/items/done");
  expect(r.status).toBe(200);
  const w = writes("list_items")[0];
  expect(w.method).toBe("DELETE");
  expect(w.search).toContain("list_id=eq.7");
  expect(w.search).toContain("is_done=eq.true");
  expect(typeof (await r.json()).removed).toBe("number");
});

it("DELETE /lists/items/:id deletes the item", async () => {
  const r = await call("DELETE", "/api/lists/items/10");
  expect(r.status).toBe(200);
  expect(writes("list_items")[0].search).toContain("item_id=eq.10");
});
