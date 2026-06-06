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
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  session: null,
  role: null,
  email: null,
  signOut: async () => {},
});

// Resolve the signed-in user's role from `profiles` (same lookup as the web,
// just client-side under RLS). Falls back to "artist" if it can't be read.
async function fetchRole(email: string | null): Promise<Role> {
  if (!email) return "artist";
  const { data } = await supabase.from("profiles").select("role").eq("email", email).maybeSingle();
  const r = data?.role as Role | undefined;
  return r ?? "artist";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      setRole(data.session ? await fetchRole(data.session.user.email ?? null) : null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      setRole(s ? await fetchRole(s.user.email ?? null) : null);
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
