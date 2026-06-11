import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Bearer-token auth for the app (POS-STARTER-6). The web admin uses cookie auth
// (@supabase/ssr); the React Native app instead sends its Supabase access token
// as `Authorization: Bearer <jwt>`. This validates the token, resolves the role
// from `profiles`, and (for per-artist actions) the caller's own `artist_id`
// (the same `profiles.artist_id` that `my_artist()` reads). Server only.

export type AppUser = {
  userId: string;
  email: string | null;
  role: string | null;
  artistId: string | null;
};

// Cookie-or-Bearer gate for routes the app shares with the web admin. Cookie
// sessions keep their RLS-scoped client; a Bearer caller gets the service-role
// client AFTER the role check, so handlers must scope artist reads explicitly
// (mirror the RLS policy in a .eq() — see /api/settlements).
export type StaffCtx = {
  db: SupabaseClient;
  email: string | null;
  role: string;
  artistId: string | null;
};

export async function resolveStaff(req: Request): Promise<StaffCtx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, artist_id")
      .eq("email", user.email!)
      .maybeSingle();
    if (!profile?.role) return null;
    return {
      db: supabase,
      email: user.email ?? null,
      role: profile.role,
      artistId: (profile.artist_id as string | null) ?? null,
    };
  }
  const me = await userFromBearer(req);
  if (!me?.role) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  return { db: admin, email: me.email, role: me.role, artistId: me.artistId };
}

export async function userFromBearer(req: Request): Promise<AppUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const email = data.user.email ?? null;
  const { data: profile } = email
    ? await admin.from("profiles").select("role, artist_id").eq("email", email).maybeSingle()
    : { data: null };

  // The profiles row IS the allowlist. A valid Supabase session whose email has
  // been removed from profiles (off-boarded staff) gets no API access at all.
  if (!profile?.role) return null;

  return {
    userId: data.user.id,
    email,
    role: profile.role,
    artistId: (profile.artist_id as string | null) ?? null,
  };
}
