import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. SERVER ONLY, never import into client code.
// Used by cron routes that have no user session (e.g. the auto-sync).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
