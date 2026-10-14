import { it, expect } from "vitest";
import { sanitizeOrTerm } from "../utils/postgrestFilter.js";

it("removes every character that can add a condition to an or() filter", () => {
  const out = sanitizeOrTerm("nomatch,and(username.eq.alice,ical_token.like.3f*)");
  expect(out).not.toMatch(/[,()*%]/);
});
it("keeps ordinary usernames and emails intact", () => {
  expect(sanitizeOrTerm("  alice.b@example.com ")).toBe("alice.b@example.com");
  expect(sanitizeOrTerm("Jean-Luc_2")).toBe("Jean-Luc_2");
});
it("handles missing input", () => {
  expect(sanitizeOrTerm(undefined)).toBe("");
  expect(sanitizeOrTerm(42)).toBe("42");
});
