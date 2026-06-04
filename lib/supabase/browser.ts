import { createBrowserClient } from "@supabase/ssr";

// Auth-aware client for client components (login, logout). Cookie-backed
// session via @supabase/ssr.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
