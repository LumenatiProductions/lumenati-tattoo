import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Roles match the web (lib/admin/role-context). The app is role-routed: artists
// land on their money home, owner/bookkeeper on the cockpit.
export type Role = "owner" | "bookkeeper" | "artist" | "frontdesk";

type AuthState = {
  loading: boolean;
  session: Session | null;
  role: Role | null;
  email: string | null;
  /** profiles.full_name — the human greeting; null when unset. */
  fullName: string | null;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  session: null,
  role: null,
  email: null,
  fullName: null,
  signOut: async () => {},
});

// Resolve the signed-in user's role + name from `profiles` (same lookup as the
// web, just client-side under RLS). Falls back to "artist" if it can't be read.
async function fetchProfile(email: string | null): Promise<{ role: Role; fullName: string | null }> {
  if (!email) return { role: "artist", fullName: null };
  const { data } = await supabase.from("profiles").select("role, full_name").eq("email", email).maybeSingle();
  return {
    role: (data?.role as Role | undefined) ?? "artist",
    fullName: (data?.full_name as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = async (s: Session | null) => {
      setSession(s);
      if (s) {
        const p = await fetchProfile(s.user.email ?? null);
        setRole(p.role);
        setFullName(p.fullName);
      } else {
        setRole(null);
        setFullName(null);
      }
    };
    (async () => {
      const { data } = await supabase.auth.getSession();
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
