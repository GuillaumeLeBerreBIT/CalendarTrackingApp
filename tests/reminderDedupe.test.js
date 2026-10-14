import { describe, it, expect } from "vitest";
import { alreadySent } from "../utils/reminderDedupe.js";

// Chainable stand-in for a Supabase client that records filters.
function fakeDb(rows, error = null) {
  const calls = [];
  const q = {
    select: (...a) => (calls.push(["select", ...a]), q),
    eq: (c, v) => (calls.push(["eq", c, v]), q),
    limit: (n) => (calls.push(["limit", n]), Promise.resolve({ data: error ? null : rows, error })),
  };
  return { calls, from: (t) => (calls.push(["from", t]), q) };
}
const key = { eventId: 7, occurrenceDate: "2027-03-10", reminderType: "reminder" };

describe("alreadySent", () => {
  it("filters on all three key columns", async () => {
    const db = fakeDb([]);
    await alreadySent(db, key);
    expect(db.calls).toContainEqual(["from", "event_reminders_sent"]);
    expect(db.calls).toContainEqual(["eq", "event_id", 7]);
    expect(db.calls).toContainEqual(["eq", "occurrence_date", "2027-03-10"]);
    expect(db.calls).toContainEqual(["eq", "reminder_type", "reminder"]);
  });
  it("false when nothing was sent", async () => {
    expect(await alreadySent(fakeDb([]), key)).toBe(false);
  });
  it("true when a row exists, however many", async () => {
    expect(await alreadySent(fakeDb([{ event_id: 7 }]), key)).toBe(true);
    expect(await alreadySent(fakeDb([{ event_id: 7 }, { event_id: 7 }]), key)).toBe(true);
  });
  it("throws when the query fails, so callers can skip instead of re-sending", async () => {
    await expect(alreadySent(fakeDb(null, { message: "boom" }), key)).rejects.toThrow("boom");
  });
});
