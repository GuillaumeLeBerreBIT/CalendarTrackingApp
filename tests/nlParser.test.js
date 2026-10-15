import { it, expect, vi, afterEach } from "vitest";
import { parseNL } from "../client/src/lib/nlParser.ts";

afterEach(() => vi.useRealTimers());

it("weekday just after local midnight resolves to the right local date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 0, 30)); // Wed 14 Oct 2026, 00:30 local
  expect(parseNL("Lunch friday 1pm").date).toBe("2026-10-16");
});
