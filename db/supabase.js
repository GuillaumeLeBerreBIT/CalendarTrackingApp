import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Auth state lives in the user's cookies, never on a server-side client.
// persistSession/autoRefreshToken must stay off: with them on, supabase-js
// stores whichever session was used last on this shared client and rotates
// its refresh token in the background — invalidating the token the browser
// still holds and force-logging the user out (~hourly, at JWT expiry).
const serverAuthConfig = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: serverAuthConfig }
);

export function createUserClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: serverAuthConfig,
    }
  )
}

// Service-role client — bypasses RLS. ONLY for trusted server-side jobs that must
// read/write across all users (e.g. the reminder cron sweep, the public iCal feed
// whose secret token is the credential). Never expose to a request-scoped handler.
// Reads SUPABASE_SECRET_KEY (sb_secret_…); SUPABASE_KEY is the legacy var name
// kept as a fallback for deployments that still use it. Falls back to the anon
// client if neither is configured.
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;

if (!secretKey) {
  // Without a secret key, supabaseAdmin would silently be the anon client:
  // every cross-user job (reminder/countdown/habit crons, notifyUsers, the
  // public iCal feed) then runs as `anon` and is blocked by RLS — a total,
  // invisible failure. Fail loudly in production; allow the fallback only in dev.
  const msg =
    "supabaseAdmin: neither SUPABASE_SECRET_KEY nor legacy SUPABASE_KEY is set.";
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${msg} Cross-user server jobs cannot bypass RLS — refusing to boot.`);
  }
  console.warn(`[supabase] ${msg} Falling back to the anon client (dev only).`);
}

export const supabaseAdmin = secretKey
  ? createClient(process.env.SUPABASE_URL, secretKey, {
      auth: serverAuthConfig,
    })
  : supabase;

export default supabase;
