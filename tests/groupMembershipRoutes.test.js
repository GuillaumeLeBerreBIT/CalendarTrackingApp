import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";

// Real groups + ical routers against a local Supabase stand-in (no network).
// Records each request's method, table, query string and authorization header
// so tests can assert which key (user JWT or secret) was used.
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const MEMBER = "00000000-0000-4000-8000-0000000000cc";
const PENDING_ADMIN = "00000000-0000-4000-8000-0000000000dd";
const future = new Date(Date.now() + 86400000).toISOString();

let tables;
const resetTables = () => {
  tables = {
    profiles: [
      { user_id: ME, username: "me", email: "me@x.test", ical_token: "tok", searchable: true },
      { user_id: OTHER, username: "harry", email: "harry@x.test", searchable: true },
    ],
    profiles_groups: [
      { user_id: ME, groups_id: 7, role: "admin", invite_status: "accepted" },
      { user_id: MEMBER, groups_id: 8, role: "member", invite_status: "accepted" },
      { user_id: PENDING_ADMIN, groups_id: 7, role: "admin", invite_status: "pending" },
    ],
    groups: [
      { groups_id: 7, groups_title: "Seven" },
      { groups_id: 9, groups_title: "Nine" },
    ],
    group_invite_tokens: [
      { token: "good", groups_id: 9, expires_at: future, max_uses: 5, use_count: 0 },
    ],
    notifications: [],
  };
  overrides = {};
};
// Per-test canned GET responses for embed queries the stand-in cannot evaluate.
let overrides = {};

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
      if (req.method === "GET" && overrides[table]) return res.end(JSON.stringify(overrides[table]));
      let rows = tables[table] ?? [];
      // invite tokens are unreadable to non-members (RLS): only the secret key sees them
      if (table === "group_invite_tokens" && req.method === "GET" && req.headers.authorization !== "Bearer test-secret") rows = [];
      for (const [k, v] of url.searchParams) {
        if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
        if (v.startsWith("in.(")) {
          const vals = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
          rows = rows.filter((r) => vals.includes(String(r[k])));
        }
      }
      if (req.method === "POST" || req.method === "PATCH") {
        // echo the written rows back (as return=representation would)
        let body = raw ? JSON.parse(raw) : [];
        body = [].concat(body).map((r) => (table === "groups" ? { groups_id: 99, ...r } : r));
        return res.end(JSON.stringify(body));
      }
      if (req.method !== "GET") return res.end("[]");
      if (String(req.headers.accept).includes("vnd.pgrst.object")) return res.end(JSON.stringify(rows[0] ?? null));
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
  app.use("/api", (await import("../routes/groups.js")).default);
  app.use("/api", (await import("../routes/ical.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => { server?.close(); fake?.close(); });
beforeEach(() => { resetTables(); log = []; });

const call = (method, path, user, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `authCookie=${user}; userId=${user}; refreshToken=r; expiresAt=9999999999` },
    body: body ? JSON.stringify(body) : undefined,
  });
const writes = (table) => log.filter((r) => r.table === table && r.method !== "GET");
const SECRET = "Bearer test-secret";

it("inviteUsers writes memberships with the secret key after the admin check", async () => {
  const r = await call("POST", "/api/inviteUsers", ME, { groupId: 7, userList: [{ user_id: OTHER }] });
  expect(r.status).toBe(200);
  const w = writes("profiles_groups");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(SECRET);
});

it("inviteUsers by a non-admin is refused and writes nothing", async () => {
  const r = await call("POST", "/api/inviteUsers", MEMBER, { groupId: 8, userList: [{ user_id: OTHER }] });
  expect(r.status).toBe(403);
  expect(writes("profiles_groups")).toHaveLength(0);
});

it("removing a member deletes with the secret key", async () => {
  const r = await call("DELETE", `/api/groups/7/members/${OTHER}`, ME);
  expect(r.status).toBe(200);
  const w = writes("profiles_groups");
  expect(w).toHaveLength(1);
  expect(w[0].method).toBe("DELETE");
  expect(w[0].authorization).toBe(SECRET);
  expect(w[0].search).toContain("groups_id=eq.7");
  expect(w[0].search).toContain(`user_id=eq.${OTHER}`);
});

it("removing a member as a non-admin deletes nothing", async () => {
  const r = await call("DELETE", `/api/groups/8/members/${OTHER}`, MEMBER);
  expect(r.status).toBe(403);
  expect(writes("profiles_groups")).toHaveLength(0);
});

it("createGroup inserts group and creator row with the secret key", async () => {
  const r = await call("POST", "/api/createGroup", ME, {
    "group-title": "New", "group-description": "d", "tag-name": "t",
    usersInvite: [{ user_id: OTHER, username: "harry", email: "h@x.test" }],
  });
  expect(r.status).toBe(200);
  expect(writes("groups")).toHaveLength(1);
  expect(writes("groups")[0].authorization).toBe(SECRET);
  const pg = writes("profiles_groups");
  expect(pg).toHaveLength(2); // creator admin row + one invite
  expect(pg.every((w) => w.authorization === SECRET)).toBe(true);
});

it("joinGroup with a valid token upserts with the secret key", async () => {
  const r = await call("POST", "/api/joinGroup/good", ME);
  expect(r.status).toBe(200);
  const w = writes("profiles_groups");
  expect(w).toHaveLength(1);
  expect(w[0].authorization).toBe(SECRET);
});

it("users/search returns no email field", async () => {
  const r = await call("GET", "/api/users/search?q=ha", ME);
  const { users } = await r.json();
  expect(users.length).toBeGreaterThan(0);
  expect(users.every((u) => !("email" in u))).toBe(true);
  expect(log.filter((l) => l.table === "profiles").every((l) => l.authorization === SECRET)).toBe(true);
});

it("ical token is read and rotated with the secret key, scoped to me", async () => {
  await call("GET", "/api/calendar/token", ME);
  await call("POST", "/api/calendar/token", ME);
  const p = log.filter((l) => l.table === "profiles");
  expect(p).toHaveLength(2);
  for (const l of p) {
    expect(l.authorization).toBe(SECRET);
    expect(l.search).toContain(`user_id=eq.${ME}`);
  }
});

const lastProfileOr = () => log.filter((l) => l.table === "profiles" && l.search.includes("or=")).pop();
const orParam = (l) => new URL("http://x" + l.search).searchParams.get("or");

it("checkUser by username does not return email", async () => {
  const r = await call("POST", "/api/checkUser", ME, { isUser: "harry" });
  const j = await r.json();
  expect(j.match).toBe(true);
  expect("email" in j.user).toBe(false);
});

it("checkUser by exact email returns it", async () => {
  tables.profiles.reverse(); // stand-in ignores or=; put the matching row first
  const r = await call("POST", "/api/checkUser", ME, { isUser: "Harry@x.test" });
  const j = await r.json();
  expect(j.user.email).toBe("harry@x.test");
});

it("checkUser escapes underscore and backslash in the ilike pattern", async () => {
  await call("POST", "/api/checkUser", ME, { isUser: "ha_ry\\x" });
  const or = orParam(lastProfileOr());
  expect(or).toContain("username.ilike.ha\\_ry\\\\x");
  expect(or).toContain("email.ilike.ha\\_ry\\\\x");
});

it("users/search matches email exactly, without wildcards around it", async () => {
  await call("GET", "/api/users/search?q=ha_x", ME);
  const or = orParam(lastProfileOr());
  expect(or).toBe("(username.ilike.*ha\\_x*,email.ilike.ha\\_x)");
});

it("inviteUsers response contains no email", async () => {
  const r = await call("POST", "/api/inviteUsers", ME, { groupId: 7, userList: [{ user_id: OTHER }] });
  const j = await r.json();
  expect(j.invitedUsers.length).toBe(1);
  expect(j.invitedUsers.every((u) => !("email" in u))).toBe(true);
});

// ---- final fix wave ----

it("GET /groups fills a pending member's username, never their email", async () => {
  overrides.groups = [{
    groups_id: 7, groups_title: "Seven", created_at: "2026-01-01T00:00:00Z",
    profiles_groups: [
      { user_id: ME, role: "admin", invite_status: "accepted", profiles: { username: "me", email: "me@x.test" } },
      { user_id: OTHER, role: "member", invite_status: "pending", profiles: null },
    ],
  }];
  const r = await call("GET", "/api/groups", ME);
  expect(r.status).toBe(200);
  const { userGroups } = await r.json();
  const pending = userGroups[0].members.find((m) => m.user_id === OTHER);
  expect(pending.profile.username).toBe("harry");
  expect(pending.profile.email).toBeUndefined();
  const lookup = log.filter((l) => l.table === "profiles");
  expect(lookup).toHaveLength(1);
  expect(lookup[0].authorization).toBe(SECRET);
  expect(new URL("http://x" + lookup[0].search).searchParams.get("select")).toBe("user_id,username");
});

it("createGroup ignores the caller in usersInvite (creator stays admin)", async () => {
  const r = await call("POST", "/api/createGroup", ME, {
    "group-title": "New", "group-description": "d", "tag-name": "t",
    usersInvite: [{ user_id: ME, username: "me" }, { user_id: OTHER, username: "harry" }],
  });
  expect(r.status).toBe(200);
  const pg = writes("profiles_groups").map((w) => [].concat(JSON.parse(w.body)));
  expect(pg).toHaveLength(2); // creator admin row + OTHER's invite
  const mine = pg.flat().filter((row) => row.user_id === ME);
  expect(mine).toEqual([expect.objectContaining({ role: "admin", invite_status: "accepted" })]);
});

it("a pending 'admin' cannot invite, remove members or edit the group", async () => {
  const inv = await call("POST", "/api/inviteUsers", PENDING_ADMIN, { groupId: 7, userList: [{ user_id: OTHER }] });
  expect(inv.status).toBe(403);
  const rm = await call("DELETE", `/api/groups/7/members/${OTHER}`, PENDING_ADMIN);
  expect(rm.status).toBe(403);
  const ed = await call("PATCH", "/api/groups/7", PENDING_ADMIN, { groups_title: "Hijacked" });
  expect(ed.status).toBe(403);
  expect(writes("profiles_groups")).toHaveLength(0);
  expect(writes("groups")).toHaveLength(0);
});

it("users/search skips the group exclusion for a group the caller is not in", async () => {
  await call("GET", "/api/users/search?q=ha&groups_id=55", ME);
  const adminMembershipReads = log.filter((l) => l.table === "profiles_groups" && l.authorization === SECRET);
  expect(adminMembershipReads).toHaveLength(0);
});

it("users/search runs the group exclusion for the caller's own group", async () => {
  await call("GET", "/api/users/search?q=ha&groups_id=7", ME);
  const adminMembershipReads = log.filter((l) => l.table === "profiles_groups" && l.authorization === SECRET);
  expect(adminMembershipReads).toHaveLength(1);
  expect(adminMembershipReads[0].search).toContain("groups_id=eq.7");
});
