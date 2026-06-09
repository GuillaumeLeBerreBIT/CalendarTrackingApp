import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export function createUserClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    }
  )
}

// Service-role client — bypasses RLS. ONLY for trusted server-side jobs that must
// read/write across all users (e.g. the reminder cron sweep, the public iCal feed
// whose secret token is the credential). Never expose to a request-scoped handler.
// Falls back to the anon client if no service key is configured.
export const supabaseAdmin = process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabase;

export default supabase;