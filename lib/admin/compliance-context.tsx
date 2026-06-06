"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Mirrors the DB row (snake_case) so the page reads it directly.
export type ComplianceStatus = "active" | "expiring" | "expired" | "na";
export type ComplianceItem = {
  id: string;
  scope: "artist" | "shop";
  artist_id: string | null;
  kind: string;
  label: string | null;
  issued_on: string | null;
  expires_on: string | null;
  document_url: string | null;
  status: ComplianceStatus;
  notes: string;
  created_at: string;
};

export type ComplianceInput = {
  scope: "artist" | "shop";
  artistId?: string | null;
  kind: string;
  label?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  documentUrl?: string | null;
  notes?: string;
};

type ComplianceCtx = {
  items: ComplianceItem[];
  loading: boolean;
  error: string | null;
  // The Overview aggregate (BUILD-PLAN integration pass reads this): everything
  // expiring within 30 days or already expired, soonest first.
  expiringSoon: ComplianceItem[];
  refresh: () => Promise<void>;
  addItem: (input: ComplianceInput) => Promise<{ ok: boolean; error?: string }>;
  updateItem: (
    id: string,
    patch: Partial<ComplianceInput>,
  ) => Promise<{ ok: boolean; error?: string }>;
  removeItem: (id: string) => Promise<void>;
};

const noop = async () => ({ ok: false });
const Ctx = createContext<ComplianceCtx>({
  items: [],
  loading: true,
  error: null,
  expiringSoon: [],
  refresh: async () => {},
  addItem: noop,
  updateItem: noop,
  removeItem: async () => {},
});

export function ComplianceProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/compliance");
      const d = await r.json();
      if (r.ok) {
        setItems(d.items || []);
        setError(null);
      } else {
        // Non-owners get a 403 — that's expected, not a page error.
        setError(r.status === 403 ? null : d.error || "Could not load compliance.");
        setItems([]);
      }
    } catch {
      setError("Could not load compliance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem: ComplianceCtx["addItem"] = useCallback(
    async (input) => {
      const r = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not add that item." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const updateItem: ComplianceCtx["updateItem"] = useCallback(
    async (id, patch) => {
      const r = await fetch("/api/compliance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not save that change." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const removeItem: ComplianceCtx["removeItem"] = useCallback(
    async (id) => {
      setItems((p) => p.filter((x) => x.id !== id)); // optimistic
      await fetch(`/api/compliance?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const expiringSoon = useMemo(
    () =>
      items
        .filter((i) => i.status === "expiring" || i.status === "expired")
        .sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? "")),
    [items],
  );

  return (
    <Ctx.Provider
      value={{ items, loading, error, expiringSoon, refresh, addItem, updateItem, removeItem }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCompliance = () => useContext(Ctx);
