import { it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "http";
vi.mock('../utils/notifications.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/google.js', () => ({ syncEventToGoogle: vi.fn() }));

// Real lists router against a local Supabase stand-in (no network).
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const THIRD = "00000000-0000-4000-8000-0000000000cc";

let tables;
let injectError; // "METHOD table" -> { status, code }
let denyWrites; // when true, any non-GET returns 403 / 42501
const resetTables = () => {
  tables = {
    profiles_groups: [
      { user_id: ME, groups_id: 7, invite_status: 'accepted' },
      { user_id: OTHER, groups_id: 7, invite_status: 'accepted' },
      { user_id: THIRD, groups_id: 7, invite_status: 'pending' },
    ],
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
      if (table === 'rpc/create_event_with_wishlist') {
        return res.end(JSON.stringify({ event_id: 42, ...JSON.parse(raw).p_event }));
      }
      if (req.method === "POST") {
        const body = [].concat(raw ? JSON.parse(raw) : []).map((r, i) => ({
          event_id: 42, list_id: 50, item_id: 60 + i, created_at: "2026-11-03T10:00:00Z", is_done: false, link: null, note: null, ...r,
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
  app.use("/api", (await import("../routes/events.js")).default);
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


const newEvent = {
  'calendar-title': 'Christmas', 'calendar-description': 'Family party',
  startDate: '2030-12-24', endDate: '2030-12-24', allDay: true,
  tagNames: 7, event_type: 'social', timezone: 'Europe/Brussels',
  recurrence_rule: 'FREQ=YEARLY', reminder_minutes: 15,
  wishlist: [{ title: ' Book ', link: ' https://example.com/book ', note: ' Hardcover ' }],
};

it('event with wishlist uses atomic creation with normalized gifts and accepted invitees', async () => {
  const r = await call('POST', '/api/parseEvent', newEvent);
  expect(r.status).toBe(200);
  const { eventData, participants } = await r.json();
  expect(eventData[0].event_id).toBe(42);
  expect(participants).toContainEqual({ userId: ME, username: 'me', rsvpStatus: 'going' });
  const rpc = writes('rpc/create_event_with_wishlist');
  expect(rpc).toHaveLength(1);
  expect(rpc[0].authorization).toBe(`Bearer ${ME}`);
  expect(JSON.parse(rpc[0].body)).toMatchObject({
    p_event: { event_title: 'Christmas', created_by: ME, groups_id: 7, recurrence_rule: 'FREQ=YEARLY', timezone: 'Europe/Brussels', reminder_minutes: 15 },
    p_participants: [ME, OTHER], p_options: [],
    p_items: [{ title: 'Book', link: 'https://example.com/book', note: 'Hardcover' }],
  });
  expect(writes('events')).toHaveLength(0);
  expect(writes('profiles_events')).toHaveLength(0);
});

it('tentative wishlist creation passes dates to the transaction without separate writes', async () => {
  const dateOptions = [{ startDate: '2030-12-24' }, { startDate: '2030-12-25' }];
  const r = await call('POST', '/api/parseEvent', { ...newEvent, status: 'tentative', dateOptions });
  expect(r.status).toBe(200);
  expect(JSON.parse(writes('rpc/create_event_with_wishlist')[0].body).p_options).toEqual(dateOptions);
  expect(writes('event_date_options')).toHaveLength(0);
});

it('personal event with an empty wishlist still creates the wishlist', async () => {
  const r = await call('POST', '/api/parseEvent', { ...newEvent, tagNames: null, event_type: 'appointment', wishlist: [] });
  expect(r.status).toBe(200);
  const body = JSON.parse(writes('rpc/create_event_with_wishlist')[0].body);
  expect(body.p_event.groups_id).toBe(null);
  expect(body.p_participants).toEqual([ME]);
  expect(body.p_items).toEqual([]);
});

it('invalid gifts are rejected before creating any event', async () => {
  for (const wishlist of [[{ title: '' }], [{ title: 'x', link: 'javascript:alert(1)' }], [{ title: 'x', note: 7 }], Array(101).fill({ title: 'x' })]) {
    expect((await call('POST', '/api/parseEvent', { ...newEvent, wishlist })).status).toBe(400);
  }
  expect(writes('rpc/create_event_with_wishlist')).toHaveLength(0);
  expect(writes('events')).toHaveLength(0);
});

it('nonmembers cannot create a group event with a wishlist', async () => {
  tables.profiles_groups = [];
  expect((await call('POST', '/api/parseEvent', newEvent)).status).toBe(403);
  expect(writes('rpc/create_event_with_wishlist')).toHaveLength(0);
});

it('failed atomic event creation returns an error and does not retry inserts', async () => {
  injectError['POST rpc/create_event_with_wishlist'] = { status: 403, code: '42501' };
  const r = await call('POST', '/api/parseEvent', newEvent);
  expect(r.status).toBe(403);
  expect((await r.json()).success).toBe(false);
  expect(writes('events')).toHaveLength(0);
});

it('events without a wishlist keep the existing creation path', async () => {
  const { wishlist, ...event } = newEvent;
  const r = await call('POST', '/api/parseEvent', event);
  expect(r.status).toBe(200);
  expect(writes('events')).toHaveLength(1);
  expect(writes('profiles_events')).toHaveLength(1);
  expect(writes('rpc/create_event_with_wishlist')).toHaveLength(0);
});

it('task wishlist endpoints have been removed', async () => {
  expect((await call('GET', '/api/tasks/10/wishlist')).status).toBe(404);
  expect((await call('POST', '/api/tasks/10/wishlist')).status).toBe(404);
});
