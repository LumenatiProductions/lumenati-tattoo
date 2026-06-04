import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Auth-aware client for server components and route handlers. Reads/writes the
// session cookie. (Next 15: cookies() is async.)
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes the session,
            // so this can be safely ignored.
          }
        },
      },
    },
  );
}
