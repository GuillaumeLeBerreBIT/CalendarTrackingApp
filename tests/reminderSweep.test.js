import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Chainable, awaitable stand-in for a supabase query builder.
function table(rows) {
  const q = { then: (res) => res({ data: rows, error: null }) };
  for (const m of ["select", "not", "eq", "in", "gte", "lte", "upsert"]) q[m] = () => q;
  return q;
}

const tables = {};
const notify = vi.fn(async () => {});

vi.mock("../db/supabase.js", () => ({
  default: {},
  supabaseAdmin: { from: (name) => table(tables[name] ?? []) },
}));
vi.mock("../utils/notifications.js", () => ({ notifyUsers: (...a) => notify(...a) }));
vi.mock("../utils/reminderDedupe.js", () => ({ alreadySent: async () => false }));
vi.mock("../routes/email.js", () => ({ sendDigestForUser: async () => ({}) }));
vi.mock("../utils/google.js", () => ({
  reconcileGoogleSync: () => {}, isGoogleConfigured: () => false, pullAllUsers: () => {}, renewExpiringChannels: () => {},
}));
vi.mock("../utils/dailySummarySweep.js", () => ({ runDailySummarySweep: () => {} }));

const { runReminderSweep } = await import("../utils/scheduler.js");

// 18:00 in Brussels on 1 Jul 2026 (UTC+2) is 16:00 UTC; "30 min before" is 15:30 UTC.
const evening = { event_id: "e1", event_title: "Swim", start_date: "2026-07-01", start_time: "18:00:00", all_day: false, recurrence_rule: null, reminder_minutes: 30 };

async function sweepAt(iso) {
  vi.setSystemTime(new Date(iso));
  notify.mockClear();
  await runReminderSweep();
  return notify.mock.calls.length;
}

describe("runReminderSweep reads event times in EVENT_TZ, not the host zone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tables.events = [evening];
    tables.profiles_events = [{ user_id: "u1" }];
    tables.event_overrides = [];
  });
  afterEach(() => vi.useRealTimers());

  it("fires inside the 30-minute window before the real start", async () => {
    expect(await sweepAt("2026-07-01T15:32:00Z")).toBe(1);
  });

  it("does not fire early", async () => {
    expect(await sweepAt("2026-07-01T15:10:00Z")).toBe(0);
  });

  it("does not fire once the event has started", async () => {
    expect(await sweepAt("2026-07-01T16:05:00Z")).toBe(0);
  });

  it("does not fire two hours late (what a UTC-read 18:00 would do)", async () => {
    expect(await sweepAt("2026-07-01T17:40:00Z")).toBe(0);
  });

  it("uses the winter offset in January", async () => {
    tables.events = [{ ...evening, start_date: "2026-01-15" }];
    expect(await sweepAt("2026-01-15T16:35:00Z")).toBe(1); // 17:35 Brussels, start 18:00
  });

  it("fires for a weekly recurring event on the right occurrence", async () => {
    // Wednesdays at 18:00 from 1 Jul 2026; 8 Jul 15:35 UTC is 17:35 Brussels.
    tables.events = [{ ...evening, recurrence_rule: "FREQ=WEEKLY;BYDAY=WE" }];
    expect(await sweepAt("2026-07-08T15:35:00Z")).toBe(1);
    expect(await sweepAt("2026-07-08T17:40:00Z")).toBe(0);
  });
});
