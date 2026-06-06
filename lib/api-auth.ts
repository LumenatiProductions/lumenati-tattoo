import { createAdminClient } from "@/lib/supabase/admin";

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

  return {
    userId: data.user.id,
    email,
    role: profile?.role ?? null,
    artistId: (profile?.artist_id as string | null) ?? null,
  };
}
