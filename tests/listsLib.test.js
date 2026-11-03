import { describe, it, expect } from "vitest";
import { splitPasted, isSafeLink, splitDone } from "../client/src/lib/lists.ts";

describe("splitPasted", () => {
  it("splits shopping on newlines and commas, stripping markers", () => {
    expect(splitPasted("milk\n\n- eggs\n• bread\n1. jam\n* rice, pasta", "shopping"))
      .toEqual(["milk", "eggs", "bread", "jam", "rice", "pasta"]);
  });
  it("drops pieces that are only a bullet or number marker", () => {
    expect(splitPasted("milk\n•\n- \n3.\neggs", "shopping")).toEqual(["milk", "eggs"]);
  });
  it("handles CRLF line endings", () => {
    expect(splitPasted("a\r\nb", "shopping")).toEqual(["a", "b"]);
  });
  it("keeps commas for wishlists", () => {
    expect(splitPasted("Lego, the big one\nBook", "wishlist")).toEqual(["Lego, the big one", "Book"]);
  });
  it("returns [] for blank", () => {
    expect(splitPasted("   ", "shopping")).toEqual([]);
  });
});

describe("isSafeLink", () => {
  it("allows only http(s)", () => {
    expect(isSafeLink("https://x.be")).toBe(true);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("ftp://x")).toBe(false);
  });
});

describe("splitDone", () => {
  it("partitions keeping order", () => {
    const r = splitDone([{ id: 1, isDone: true }, { id: 2, isDone: false }, { id: 3, isDone: true }]);
    expect(r.open.map((i) => i.id)).toEqual([2]);
    expect(r.done.map((i) => i.id)).toEqual([1, 3]);
  });
});
