"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "./types";

// Demo-only role switching backed by localStorage. When Supabase auth lands,
// the role comes from the authenticated session (server-side) and this provider
// just reflects it. For now it lets us preview every role's view.
type RoleCtx = {
  role: Role;
  setRole: (r: Role) => void;
  /** For the artist role: which artist we're previewing as. */
  asArtistId: string;
  setAsArtistId: (id: string) => void;
};

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("owner");
  const [asArtistId, setAsArtistIdState] = useState<string>("jd");

  useEffect(() => {
    const r = localStorage.getItem("lum-role") as Role | null;
    const a = localStorage.getItem("lum-artist");
    if (r) setRoleState(r);
    if (a) setAsArtistIdState(a);
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    localStorage.setItem("lum-role", r);
  };
  const setAsArtistId = (id: string) => {
    setAsArtistIdState(id);
    localStorage.setItem("lum-artist", id);
  };

  return (
    <Ctx.Provider value={{ role, setRole, asArtistId, setAsArtistId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRole(): RoleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole must be used within RoleProvider");
  return c;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Co-owner",
  bookkeeper: "Bookkeeper",
  artist: "Artist",
  frontdesk: "Front desk",
};
