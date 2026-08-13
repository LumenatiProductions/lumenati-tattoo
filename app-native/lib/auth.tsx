import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Roles match the web (lib/admin/role-context). The app is role-routed: artists
// land on their money home, admins on the cockpit. Two roles, period —
// retired values (bookkeeper/frontdesk) normalize to admin ('owner') here.
export type Role = "owner" | "artist";

const normalizeRole = (raw: string | null | undefined): Role | null =>
  raw == null ? null : raw === "artist" ? "artist" : "owner";

type AuthState = {
  loading: boolean;
  session: Session | null;
  role: Role | null;
  email: string | null;
  /** profiles.full_name — the human greeting; null when unset. */
  fullName: string | null;
  /** profiles.shop_id — every roster/public-table read MUST scope to this
   * (artists/room_content are public-read for the website, so RLS alone
   * won't wall them between shops). */
  shopId: string | null;
  signOut: () => Promise<void>;
  /** Re-resolve the current session's profile (used by the unresolved-account
   * retry screen when the first read timed out). */
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  session: null,
  role: null,
  email: null,
  fullName: null,
  shopId: null,
  signOut: async () => {},
  refresh: async () => {},
});

// Cold launches must never hang on the network: every bootstrap call races a
// deadline, and losing the race falls back rather than blocking first paint.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Resolve the signed-in user's role + name from `profiles` (same lookup as the
// web, just client-side under RLS). Matches by email, or by phone for phone-OTP
// users whose JWT carries no email. Returns role=null when it genuinely can't
// resolve — we NEVER fabricate a role. A missing email or an unknown user used
// to be silently forced to "artist" with shopId null, which impersonated an
// artist and hung every shop-scoped screen.
async function fetchProfile(
  user: { email?: string | null; phone?: string | null } | null,
): Promise<{ role: Role | null; fullName: string | null; shopId: string | null }> {
  const email = user?.email ?? null;
  const phone = user?.phone ?? null;
  const unresolved = { role: null as Role | null, fullName: null, shopId: null };
  if (!email && !phone) return unresolved;

  let q = supabase.from("profiles").select("role, full_name, shop_id");
  if (email) {
    q = q.eq("email", email);
  } else {
    // profiles.phone may be stored as +E.164 or as bare digits — match either.
    const bare = phone!.replace(/\D/g, "");
    q = q.or(`phone.eq.${phone},phone.eq.${bare},phone.eq.+${bare}`);
  }
  const { data } = await q.maybeSingle();
  if (!data) return unresolved;
  return {
    role: normalizeRole(data.role as string | undefined),
    fullName: (data.full_name as string | null) ?? null,
    shopId: (data.shop_id as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setRole(null);
      setFullName(null);
      setShopId(null);
      return;
    }
    // Resolve the profile, retrying ONLY on timeout. A resolved "no row" is a
    // terminal answer (role stays null -> the layout shows a retry screen); we
    // never retry it into, or default it to, an impersonated role.
    let resolved: Awaited<ReturnType<typeof fetchProfile>> | undefined;
    for (let attempt = 0; attempt < 3 && resolved === undefined; attempt++) {
      resolved = await withTimeout(fetchProfile(s.user), 6000, undefined);
    }
    const p = resolved ?? { role: null, fullName: null, shopId: null };
    setRole(p.role);
    setFullName(p.fullName);
    setShopId(p.shopId);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      6000,
      { data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
    );
    await apply(data.session);
  }, [apply]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // A hung session restore (expired token + flaky refresh call) was the
      // "spins until you force quit" launch bug — never wait more than 6s.
      // If the real session lands later, onAuthStateChange applies it.
      const { data } = await withTimeout(
        supabase.auth.getSession(),
        6000,
        { data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      );
      if (!alive) return;
      await apply(data.session);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      await apply(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [apply]);

  return (
    <Ctx.Provider
      value={{
        loading,
        session,
        role,
        email: session?.user.email ?? null,
        fullName,
        shopId,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
