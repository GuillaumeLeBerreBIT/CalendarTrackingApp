import { describe, it, expect } from "vitest";
import { resolveTheme, parseThemePref, THEME_KEY } from "../client/src/lib/theme.ts";

describe("resolveTheme", () => {
  it("keeps an explicit choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("follows the device for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("parseThemePref", () => {
  it("falls back to dark for missing or corrupt values", () => {
    expect(parseThemePref(null)).toBe("dark");
    expect(parseThemePref("nonsense")).toBe("dark");
  });
  it("accepts the three valid values", () => {
    expect(parseThemePref("system")).toBe("system");
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
  });
  it("uses the documented storage key", () => {
    expect(THEME_KEY).toBe("eventli-theme");
  });
});
