import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted by Vitest so this runs before any import below resolves.
// The middleware imports supabase as a default export, so the factory must
// expose a `default` property. We attach the spy functions to the mock object
// directly so individual tests can override return values with mockResolvedValueOnce.
vi.mock("../db/supabase.js", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      refreshSession: vi.fn(),
    },
  };
  return { default: mockSupabase };
});

// Import the mock so tests can configure per-call behaviour.
import supabase from "../db/supabase.js";

// Import the middleware under test AFTER the mock is registered.
import authRequire from "../utils/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal fake `req` object. */
function makeReq({ authCookie, refreshToken } = {}) {
  return {
    cookies: {
      ...(authCookie !== undefined && { authCookie }),
      ...(refreshToken !== undefined && { refreshToken }),
    },
    user: undefined,
  };
}

/** Builds a minimal fake `res` object with vi.fn() spies. */
function makeRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
}

/** A successful Supabase refreshSession payload. */
const REFRESH_SUCCESS = {
  data: {
    refreshSes: null, // not used directly
    session: {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_at: 9999999999,
    },
    user: { id: "user-123", email: "test@example.com" },
  },
  error: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authRequire middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: no authCookie, no refreshToken → clear expiresAt, redirect /login
  // -------------------------------------------------------------------------
  it("redirects to /login and clears expiresAt when both cookies are absent", async () => {
    const req = makeReq(); // no authCookie, no refreshToken
    const res = makeRes();
    const next = vi.fn();

    await authRequire(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith("expiresAt");
    expect(res.redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 2: no authCookie, has refreshToken, refresh succeeds → next(), cookies set, req.user set
  // -------------------------------------------------------------------------
  it("calls next() and sets all 4 cookies when authCookie is absent but refresh succeeds", async () => {
    const req = makeReq({ refreshToken: "valid-refresh-token" });
    const res = makeRes();
    const next = vi.fn();

    supabase.auth.refreshSession.mockResolvedValueOnce(REFRESH_SUCCESS);

    await authRequire(req, res, next);

    // Middleware should proceed.
    expect(next).toHaveBeenCalledOnce();
    expect(res.redirect).not.toHaveBeenCalled();

    // req.user should be the user object returned by refreshSession.
    expect(req.user).toEqual(REFRESH_SUCCESS.data.user);

    // All 4 cookies must be written.
    const cookieNames = res.cookie.mock.calls.map((call) => call[0]);
    expect(cookieNames).toContain("authCookie");
    expect(cookieNames).toContain("refreshToken");
    expect(cookieNames).toContain("expiresAt");
    expect(cookieNames).toContain("userId");
  });

  // -------------------------------------------------------------------------
  // Case 3: no authCookie, has refreshToken, refresh fails → clear cookies, redirect /login
  // -------------------------------------------------------------------------
  it("clears all cookies and redirects to /login when authCookie is absent and refresh fails", async () => {
    const req = makeReq({ refreshToken: "expired-refresh-token" });
    const res = makeRes();
    const next = vi.fn();

    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: null,
      error: new Error("refresh failed"),
    });

    await authRequire(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/login");

    const clearedCookies = res.clearCookie.mock.calls.map((call) => call[0]);
    expect(clearedCookies).toContain("authCookie");
    expect(clearedCookies).toContain("userId");
    expect(clearedCookies).toContain("refreshToken");
    expect(clearedCookies).toContain("expiresAt");
  });

  // -------------------------------------------------------------------------
  // Case 4: has authCookie, getUser succeeds → next(), req.user set
  // -------------------------------------------------------------------------
  it("calls next() and sets req.user when authCookie is present and getUser succeeds", async () => {
    const mockUser = { id: "user-456", email: "valid@example.com" };
    const req = makeReq({ authCookie: "valid-token" });
    const res = makeRes();
    const next = vi.fn();

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    await authRequire(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(mockUser);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 5: has authCookie, getUser fails with error, refresh succeeds → next(), req.user set
  // -------------------------------------------------------------------------
  it("falls back to refresh and calls next() when getUser returns an error but refresh succeeds", async () => {
    const req = makeReq({
      authCookie: "expired-access-token",
      refreshToken: "valid-refresh-token",
    });
    const res = makeRes();
    const next = vi.fn();

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("token expired"),
    });

    supabase.auth.refreshSession.mockResolvedValueOnce(REFRESH_SUCCESS);

    await authRequire(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(REFRESH_SUCCESS.data.user);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 6: has authCookie, getUser fails, refresh also fails → clear cookies, redirect /login
  // -------------------------------------------------------------------------
  it("clears all cookies and redirects to /login when getUser fails and refresh also fails", async () => {
    const req = makeReq({
      authCookie: "expired-access-token",
      refreshToken: "also-expired-refresh-token",
    });
    const res = makeRes();
    const next = vi.fn();

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("token expired"),
    });

    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: null,
      error: new Error("refresh also failed"),
    });

    await authRequire(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/login");

    const clearedCookies = res.clearCookie.mock.calls.map((call) => call[0]);
    expect(clearedCookies).toContain("authCookie");
    expect(clearedCookies).toContain("userId");
    expect(clearedCookies).toContain("refreshToken");
    expect(clearedCookies).toContain("expiresAt");
  });
});
