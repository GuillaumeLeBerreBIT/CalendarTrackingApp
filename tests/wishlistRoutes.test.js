import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";

// Real lists router against a local Supabase stand-in (no network).
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const THIRD = "00000000-0000-4000-8000-0000000000cc";

let tables;
let injectError; // "METHOD table" -> { status, code }
let denyWrites; // when true, any non-GET returns 403 / 42501
const resetTables = () => {
  tables = {
    task_list: [{ task_list_id: 10, groups_id: 7 }],
    profiles_groups: [{ user_id: ME, groups_id: 7, invite_status: 'accepted' }],
    profiles: [
      { user_id: ME, username: "me" },
      { user_id: OTHER, username: "harry" },
    ],
    groups: [{ groups_id: 7, groups_title: "Seven" }],
    lists: [
      { list_id: 3, kind: "wishlist", title: "Wishlist", event_id: 5, created_by: OTHER, groups_id: null, created_at: "2026-11-02T10:00:00Z" },
    ],
    list_items: [
      { item_id: 1, list_id: 3, title: "a", link: null, note: null, is_done: false, created_at: "2026-11-01T11:00:00Z" },
      { item_id: 2, list_id: 3, title: "b", link: null, note: null, is_done: false, created_at: "2026-11-01T12:00:00Z" },
      { item_id: 3, list_id: 3, title: "c", link: null, note: null, is_done: false, created_at: "2026-11-01T13:00:00Z" },
    ],
    list_item_claims: [
      { item_id: 1, claimed_by: ME },
      { item_id: 2, claimed_by: THIRD },
    ],
  };
  denyWrites = false;
  injectError = {};
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
      const inj = injectError[`${req.method} ${table}`];
      if (inj) {
        res.statusCode = inj.status;
        return res.end(JSON.stringify({ code: inj.code, message: "injected" }));
      }
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
      if (table === 'rpc/create_task_with_wishlist') {
        return res.end(JSON.stringify({ task_id: 42, task_title: 'Christmas', task_list_id: 10 }));
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
  app.use("/api", (await import("../routes/todo.js")).default);
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
const asOwner = () => { tables.lists[0].created_by = ME; };

it("owner GET: no taken/claimedByMe keys and no claims request", async () => {
  asOwner();
  const r = await call("GET", "/api/events/5/wishlist");
  expect(r.status).toBe(200);
  const { wishlist } = await r.json();
  expect(wishlist).toMatchObject({ listId: "3", isOwner: true, ownerId: ME, ownerName: "me" });
  expect(wishlist.items).toHaveLength(3);
  for (const i of wishlist.items) {
    expect("taken" in i).toBe(false);
    expect("claimedByMe" in i).toBe(false);
  }
  expect(log.filter((l) => l.table === "list_item_claims")).toHaveLength(0);
  expect(log.find((l) => l.table === "profiles").authorization).toBe("Bearer test-secret");
});

it("guest GET: taken/claimedByMe, never leaks claimed_by or other guests", async () => {
  const r = await call("GET", "/api/events/5/wishlist");
  const text = await r.text();
  const { wishlist } = JSON.parse(text);
  expect(wishlist.isOwner).toBe(false);
  const by = Object.fromEntries(wishlist.items.map((i) => [i.itemId, i]));
  expect(by["1"]).toMatchObject({ taken: true, claimedByMe: true });
  expect(by["2"]).toMatchObject({ taken: true, claimedByMe: false });
  expect(by["3"]).toMatchObject({ taken: false, claimedByMe: false });
  expect(text).not.toContain(THIRD);
  expect(text).not.toContain("claimed_by");
  const claims = log.filter((l) => l.table === "list_item_claims");
  expect(claims).toHaveLength(1);
  expect(decodeURIComponent(claims[0].search)).toContain("select=item_id,claimed_by");
  expect(claims[0].search).toContain("item_id=in.");
});

it("GET on an event without a wishlist returns null", async () => {
  tables.lists = [];
  const r = await call("GET", "/api/events/5/wishlist");
  expect(await r.json()).toEqual({ success: true, wishlist: null });
});

it("POST wishlist inserts with the cookie user; 23505 re-reads and returns 200", async () => {
  tables.lists = [];
  const r1 = await call("POST", "/api/events/5/wishlist", { created_by: OTHER });
  expect(r1.status).toBe(201);
  expect(JSON.parse(writes("lists")[0].body)).toMatchObject({ kind: "wishlist", title: "Wishlist", event_id: 5, created_by: ME });
  expect((await r1.json()).wishlist).toMatchObject({ isOwner: true });

  resetTables();
  log = [];
  injectError["POST lists"] = { status: 409, code: "23505" };
  const r2 = await call("POST", "/api/events/5/wishlist");
  expect(r2.status).toBe(200);
  expect((await r2.json()).wishlist.listId).toBe("3");
});

it("POST wishlist maps an RLS denial to 403", async () => {
  injectError["POST lists"] = { status: 403, code: "42501" };
  expect((await call("POST", "/api/events/5/wishlist")).status).toBe(403);
});

it("claim: 201, 23505 -> 409 taken, 42501 -> 403", async () => {
  const ok = await call("POST", "/api/lists/items/3/claim");
  expect(ok.status).toBe(201);
  expect(JSON.parse(writes("list_item_claims")[0].body)).toMatchObject({ item_id: 3, claimed_by: ME });
  injectError["POST list_item_claims"] = { status: 409, code: "23505" };
  const dup = await call("POST", "/api/lists/items/3/claim");
  expect(dup.status).toBe(409);
  expect(await dup.json()).toEqual({ success: false, error: "taken" });
  injectError["POST list_item_claims"] = { status: 403, code: "42501" };
  expect((await call("POST", "/api/lists/items/3/claim")).status).toBe(403);
});

it("unclaim filters by item and by me; 0 rows -> 404", async () => {
  const r = await call("DELETE", "/api/lists/items/1/claim");
  expect(r.status).toBe(200);
  const w = writes("list_item_claims")[0];
  expect(w.search).toContain("item_id=eq.1");
  expect(w.search).toContain(`claimed_by=eq.${ME}`);
  tables.list_item_claims = [];
  expect((await call("DELETE", "/api/lists/items/1/claim")).status).toBe(404);
});

it("malformed ids return 400, not 500", async () => {
  expect((await call("DELETE", "/api/lists/items")).status).toBe(400);
  expect((await call("PATCH", "/api/lists/abc", { title: "x" })).status).toBe(400);
  expect((await call("GET", "/api/events/abc/wishlist")).status).toBe(400);
  expect((await call("POST", "/api/lists/items/x/claim")).status).toBe(400);
  expect((await call("PATCH", "/api/lists/items/x", { isDone: true })).status).toBe(400);
  const r = await call("POST", "/api/lists/abc/items", { titles: ["a"] });
  expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ success: false, error: "Invalid id" });
});


it('task wishlist reads its task parent, with the same owner privacy', async () => {
  tables.lists[0].task_id = 10;
  tables.lists[0].event_id = null;
  asOwner();
  const r = await call('GET', '/api/tasks/10/wishlist');
  expect(r.status).toBe(200);
  const { wishlist } = await r.json();
  expect(wishlist.items).toHaveLength(3);
  expect(wishlist.items.every(i => !('taken' in i) && !('claimedByMe' in i))).toBe(true);
  expect(log.some(l => l.table === 'list_item_claims')).toBe(false);
  expect(log.find(l => l.table === 'lists').search).toContain('task_id=eq.10');
});

it('task wishlist guests see reservations without identities', async () => {
  tables.lists[0].task_id = 10;
  const r = await call('GET', '/api/tasks/10/wishlist');
  const text = await r.text();
  expect(JSON.parse(text).wishlist.items[0]).toMatchObject({ taken: true, claimedByMe: true });
  expect(text).not.toContain(THIRD);
});

it('task wishlist creation sets only task_id and uses the requesting user', async () => {
  const r = await call('POST', '/api/tasks/10/wishlist', { created_by: OTHER, event_id: 5 });
  expect(r.status).toBe(201);
  expect(JSON.parse(writes('lists')[0].body)).toEqual({ kind: 'wishlist', title: 'Wishlist', task_id: 10, created_by: ME });
  expect((await call('GET', '/api/tasks/abc/wishlist')).status).toBe(400);
});

const newTask = { task_title: 'Christmas', task_list_id: 10, priority: 'medium', due_date: '2030-12-24', wishlist: [{ title: ' Book ', link: ' https://example.com ', note: ' Hardcover ' }] };

it('createTask with gifts calls the atomic RPC using the user JWT', async () => {
  const r = await call('POST', '/api/createTask', newTask);
  expect(r.status).toBe(200);
  expect((await r.json()).insertTask.task_id).toBe(42);
  const rpc = writes('rpc/create_task_with_wishlist');
  expect(rpc).toHaveLength(1);
  expect(rpc[0].authorization).toBe(`Bearer ${ME}`);
  expect(JSON.parse(rpc[0].body)).toMatchObject({ p_task_list_id: 10, p_title: 'Christmas', p_items: [{ title: 'Book', link: 'https://example.com', note: 'Hardcover' }] });
  expect(writes('task')).toHaveLength(0);
});

it('invalid gifts cause no task creation', async () => {
  for (const wishlist of [[{ title: '' }], [{ title: 'x', link: 'javascript:alert(1)' }], [{ title: 'x', note: 7 }], Array(101).fill({ title: 'x' })]) {
    const r = await call('POST', '/api/createTask', { ...newTask, wishlist });
    expect(r.status).toBe(400);
  }
  expect(writes('rpc/create_task_with_wishlist')).toHaveLength(0);
  expect(writes('task')).toHaveLength(0);
});

it('nonmembers cannot create tasks with wishlists', async () => {
  tables.profiles_groups = [];
  expect((await call('POST', '/api/createTask', newTask)).status).toBe(403);
  expect(writes('rpc/create_task_with_wishlist')).toHaveLength(0);
});

it('RPC failure is returned without retrying task creation', async () => {
  injectError['POST rpc/create_task_with_wishlist'] = { status: 403, code: '42501' };
  const r = await call('POST', '/api/createTask', newTask);
  expect(r.status).toBe(403);
  expect((await r.json()).success).toBe(false);
  expect(writes('task')).toHaveLength(0);
});

it('ordinary task creation still uses the existing path', async () => {
  const { wishlist, ...task } = newTask;
  const r = await call('POST', '/api/createTask', task);
  expect((await r.json()).success).toBe(true);
  expect(writes('task')).toHaveLength(1);
  expect(writes('rpc/create_task_with_wishlist')).toHaveLength(0);
});
