"use client";

import { createContext, useContext, useState } from "react";
import type { Role } from "./types";

// Role now comes from the authenticated profile. Owners can "preview as" other
// roles (in-memory, for support/QA); everyone else is locked to their role.
type RoleCtx = {
  role: Role;
  setRole: (r: Role) => void;
  asArtistId: string;
  setAsArtistId: (id: string) => void;
  email: string;
  fullName: string | null;
  realRole: Role;
  canPreview: boolean;
};

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({
  realRole,
  realArtistId,
  email,
  fullName,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  children: React.ReactNode;
}) {
  const canPreview = realRole === "owner";
  const [role, setRoleState] = useState<Role>(realRole);
  const [asArtistId, setAsArtistIdState] = useState<string>(realArtistId ?? "jd");

  const setRole = (r: Role) => {
    if (canPreview) setRoleState(r);
  };
  const setAsArtistId = (id: string) => {
    if (canPreview) setAsArtistIdState(id);
  };

  return (
    <Ctx.Provider
      value={{ role, setRole, asArtistId, setAsArtistId, email, fullName, realRole, canPreview }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRole(): RoleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole must be used within RoleProvider");
  return c;
}

// The new process: two roles. Admin runs the shop, Artist runs their chair.
// (bookkeeper/frontdesk are legacy values that now read as Admin; the stored
// admin value stays 'owner' so policies and gates never had to change.)
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin",
  bookkeeper: "Admin",
  artist: "Artist",
  frontdesk: "Admin",
};

/** The two roles anyone can actually be assigned or previewed as. */
export const ASSIGNABLE_ROLES: Role[] = ["owner", "artist"];
