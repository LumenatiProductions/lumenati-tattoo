import { createContext, useContext, useEffect, useState } from "react";
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
};

const Ctx = createContext<AuthState>({
  loading: true,
  session: null,
  role: null,
  email: null,
  fullName: null,
  shopId: null,
  signOut: async () => {},
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
// web, just client-side under RLS). Falls back to "artist" if it can't be read.
async function fetchProfile(
  email: string | null,
): Promise<{ role: Role; fullName: string | null; shopId: string | null }> {
  if (!email) return { role: "artist", fullName: null, shopId: null };
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name, shop_id")
    .eq("email", email)
    .maybeSingle();
  return {
    role: normalizeRole(data?.role as string | undefined) ?? "artist",
    fullName: (data?.full_name as string | null) ?? null,
    shopId: (data?.shop_id as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = async (s: Session | null) => {
      setSession(s);
      if (s) {
        const p = await withTimeout(
          fetchProfile(s.user.email ?? null),
          6000,
          { role: "artist" as Role, fullName: null, shopId: null },
        );
        setRole(p.role);
        setFullName(p.fullName);
        setShopId(p.shopId);
      } else {
        setRole(null);
        setFullName(null);
        setShopId(null);
      }
    };
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
  }, []);

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
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
