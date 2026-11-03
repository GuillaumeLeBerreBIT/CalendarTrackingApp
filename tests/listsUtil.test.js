import { describe, it, expect } from "vitest";
import { cleanTitles, isHttpLink } from "../utils/lists.js";

describe("cleanTitles", () => {
  it("trims and drops empties", () => {
    expect(cleanTitles([" milk ", "", "eggs"])).toEqual({ ok: true, titles: ["milk", "eggs"] });
  });
  it("rejects non-arrays", () => {
    expect(cleanTitles("milk")).toEqual({ ok: false, error: "titles must be an array" });
  });
  it("rejects more than 100", () => {
    expect(cleanTitles(Array.from({ length: 101 }, (_, i) => `i${i}`))).toEqual({ ok: false, error: "Max 100 items at once" });
  });
  it("rejects long titles", () => {
    expect(cleanTitles(["a".repeat(201)])).toEqual({ ok: false, error: "Item names can be at most 200 characters" });
  });
  it("rejects nothing to add", () => {
    expect(cleanTitles(["  "])).toEqual({ ok: false, error: "Nothing to add" });
  });
});

describe("isHttpLink", () => {
  it("accepts http(s) only", () => {
    expect(isHttpLink("http://a.b")).toBe(true);
    expect(isHttpLink("https://a.b")).toBe(true);
    expect(isHttpLink(null)).toBe(false);
    expect(isHttpLink("data:text/html,x")).toBe(false);
  });
});
