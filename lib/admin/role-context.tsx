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
  /** profiles.shop_id — scope every roster/public-table read to this. */
  shopId: string | null;
};

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({
  realRole,
  realArtistId,
  email,
  fullName,
  shopId,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  shopId: string | null;
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
      value={{ role, setRole, asArtistId, setAsArtistId, email, fullName, realRole, canPreview, shopId }}
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

// Two roles. Admin runs the shop, Artist runs their chair. (The stored admin
// value stays 'owner' so policies and gates never had to change.)
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin",
  artist: "Artist",
};

/** The two roles anyone can actually be assigned or previewed as. */
export const ASSIGNABLE_ROLES: Role[] = ["owner", "artist"];
