import { describe, it, expect } from "vitest";
import { eventTimeZone, creatorTimeZone } from "../utils/eventTimeZone.js";
import { EVENT_TZ } from "../utils/wallClock.js";
import { googleToEvent } from "../utils/google.js";

const profileDb = (prefs) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prefs === undefined ? null : { notification_prefs: prefs } }) }) }) }),
});

describe("eventTimeZone", () => {
  it("uses the event's own valid zone", () => {
    expect(eventTimeZone({ timezone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
  });
  it("falls back to EVENT_TZ for missing or invalid values", () => {
    expect(eventTimeZone({})).toBe(EVENT_TZ);
    expect(eventTimeZone(null)).toBe(EVENT_TZ);
    expect(eventTimeZone({ timezone: "+02:00" })).toBe(EVENT_TZ);
  });
});

describe("creatorTimeZone", () => {
  it("prefers the zone the client sent", async () => {
    expect(await creatorTimeZone(profileDb({ timezone: "Asia/Tokyo" }), "u", "America/New_York")).toBe("America/New_York");
  });
  it("uses the stored profile zone when the client sent none or junk", async () => {
    expect(await creatorTimeZone(profileDb({ timezone: "Asia/Tokyo" }), "u", undefined)).toBe("Asia/Tokyo");
    expect(await creatorTimeZone(profileDb({ timezone: "Asia/Tokyo" }), "u", "nope")).toBe("Asia/Tokyo");
  });
  it("falls back to EVENT_TZ with no profile zone", async () => {
    expect(await creatorTimeZone(profileDb({}), "u")).toBe(EVENT_TZ);
    expect(await creatorTimeZone(profileDb(undefined), "u")).toBe(EVENT_TZ);
  });
});

describe("googleToEvent", () => {
  it("records the zone it converted the wall clock into", () => {
    const m = googleToEvent({ id: "g1", summary: "x", start: { dateTime: "2026-07-01T16:00:00Z" }, end: { dateTime: "2026-07-01T17:00:00Z" } }, "Europe/Brussels");
    expect(m).toMatchObject({ timezone: "Europe/Brussels", start_date: "2026-07-01", start_time: "18:00:00" });
  });
});
