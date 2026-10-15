import { describe, it, expect } from "vitest";
import { isGroupMember, canAccessEvent } from "../utils/groupAccess.js";

// tables: { tableName: rows[] }. Supports select/eq/limit/maybeSingle over in-memory rows.
function fakeDb(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
        limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      };
      return q;
    },
  };
}

const db = fakeDb({
  profiles_groups: [
    { user_id: "member", groups_id: 1, invite_status: "accepted" },
    { user_id: "invited", groups_id: 1, invite_status: "pending" },
  ],
  events: [
    { event_id: 10, created_by: "owner", groups_id: 1 },
    { event_id: 11, created_by: "owner", groups_id: null },
  ],
  profiles_events: [{ event_id: 11, user_id: "guest" }],
});

describe("isGroupMember", () => {
  it("accepted member only", async () => {
    expect(await isGroupMember(db, "member", 1)).toBe(true);
    expect(await isGroupMember(db, "invited", 1)).toBe(false);
    expect(await isGroupMember(db, "stranger", 1)).toBe(false);
    expect(await isGroupMember(db, "member", null)).toBe(false);
  });
});

describe("canAccessEvent", () => {
  it("creator, group member, or participant", async () => {
    expect(await canAccessEvent(db, "owner", 10)).toMatchObject({ event_id: 10 });
    expect(await canAccessEvent(db, "member", 10)).toMatchObject({ event_id: 10 });
    expect(await canAccessEvent(db, "guest", 11)).toMatchObject({ event_id: 11 });
  });
  it("nobody else, and unknown events", async () => {
    expect(await canAccessEvent(db, "invited", 10)).toBeNull();
    expect(await canAccessEvent(db, "stranger", 11)).toBeNull();
    expect(await canAccessEvent(db, "owner", 999)).toBeNull();
  });
});
