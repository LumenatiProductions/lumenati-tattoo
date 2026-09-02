"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "./types";

const PREVIEW_KEY = "lum-preview";

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
  /** shops.slug + shops.template: where the shop's public pages live and which look they wear. */
  shopSlug: string | null;
  shopTemplate: string | null;
  /** Lumenati's own site (rooms, arcade, Winamp) — the one shop with the Y2K theme. */
  isY2k: boolean;
};

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({
  realRole,
  realArtistId,
  email,
  fullName,
  shopId,
  shopSlug = null,
  shopTemplate = null,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  shopId: string | null;
  shopSlug?: string | null;
  shopTemplate?: string | null;
  children: React.ReactNode;
}) {
  const canPreview = realRole === "owner";
  const [role, setRoleState] = useState<Role>(realRole);
  const [asArtistId, setAsArtistIdState] = useState<string>(realArtistId ?? "jd");

  // "View as artist" lived only in memory, so any full reload or direct URL
  // navigation snapped back to Admin while in-app link clicks kept it — the
  // inconsistency in lum-018. Persist the owner's preview choice to the tab
  // (sessionStorage) and rehydrate after mount (a useEffect, not the initial
  // state, so server and first client render still agree).
  useEffect(() => {
    if (!canPreview) return;
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { role?: Role; asArtistId?: string };
      if (p.role) setRoleState(p.role);
      if (p.asArtistId) setAsArtistIdState(p.asArtistId);
    } catch {
      /* ignore */
    }
  }, [canPreview]);

  const persist = (r: Role, id: string) => {
    try {
      if (r === realRole) sessionStorage.removeItem(PREVIEW_KEY);
      else sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ role: r, asArtistId: id }));
    } catch {
      /* ignore */
    }
  };

  const setRole = (r: Role) => {
    if (!canPreview) return;
    setRoleState(r);
    persist(r, asArtistId);
  };
  const setAsArtistId = (id: string) => {
    if (!canPreview) return;
    setAsArtistIdState(id);
    persist(role, id);
  };

  return (
    <Ctx.Provider
      value={{ role, setRole, asArtistId, setAsArtistId, email, fullName, realRole, canPreview, shopId, shopSlug, shopTemplate, isY2k: shopTemplate === "y2k" }}
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
