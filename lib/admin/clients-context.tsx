"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type Client = {
  id: string;
  square_customer_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  birthdate: string | null;
  notes: string;
  preferred_artist_id: string | null;
  total_spent_cents: number;
  /** Square historical baseline + ledger-attributed spend (money source of truth). */
  lifetime_cents?: number;
  first_seen: string | null;
  last_seen: string | null;
  source: "manual" | "square";
  created_at: string;
  synced_at: string;
};

export type NewClient = {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  birthdate?: string;
  notes?: string;
  preferredArtistId?: string | null;
};

export type ClientPatch = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  birthdate?: string | null;
  notes?: string;
  preferredArtistId?: string | null;
};

type ClientsCtx = {
  clients: Client[];
  loading: boolean;
  error: string | null;
  // Overview aggregates surfaced for the integration pass.
  total: number;
  newThisMonth: number;
  refresh: () => Promise<void>;
  addClient: (input: NewClient) => Promise<{ ok: boolean; error?: string; client?: Client }>;
  updateClient: (id: string, patch: ClientPatch) => Promise<{ ok: boolean; error?: string }>;
  syncFromSquare: () => Promise<{ ok: boolean; error?: string; updated?: number }>;
};

const Ctx = createContext<ClientsCtx>({
  clients: [],
  loading: true,
  error: null,
  total: 0,
  newThisMonth: 0,
  refresh: async () => {},
  addClient: async () => ({ ok: false }),
  updateClient: async () => ({ ok: false }),
  syncFromSquare: async () => ({ ok: false }),
});

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/clients");
      const d = await r.json();
      if (r.ok) {
        setClients(d.clients || []);
        setError(null);
      } else {
        setError(d.error || "Could not load clients.");
      }
    } catch {
      setError("Could not load clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addClient: ClientsCtx["addClient"] = useCallback(
    async (input) => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not add that client." };
      await refresh();
      return { ok: true, client: d.client };
    },
    [refresh],
  );

  const updateClient: ClientsCtx["updateClient"] = useCallback(
    async (id, patch) => {
      // optimistic — reflect the edit locally, then reconcile with the server.
      setClients((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(patch.firstName !== undefined ? { first_name: patch.firstName } : {}),
                ...(patch.lastName !== undefined ? { last_name: patch.lastName } : {}),
                ...(patch.email !== undefined ? { email: patch.email || null } : {}),
                ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
                ...(patch.instagram !== undefined ? { instagram: patch.instagram || null } : {}),
                ...(patch.birthdate !== undefined ? { birthdate: patch.birthdate || null } : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
                ...(patch.preferredArtistId !== undefined
                  ? { preferred_artist_id: patch.preferredArtistId || null }
                  : {}),
              }
            : c,
        ),
      );
      const r = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok) return { ok: false, error: d.error || "Could not save." };
      return { ok: true };
    },
    [refresh],
  );

  const syncFromSquare: ClientsCtx["syncFromSquare"] = useCallback(async () => {
    const r = await fetch("/api/clients/sync", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) {
      return { ok: false, error: d.error || "Sync failed." };
    }
    await refresh();
    return { ok: true, updated: d.updated };
  }, [refresh]);

  const { total, newThisMonth } = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    return {
      total: clients.length,
      newThisMonth: clients.filter((c) => (c.first_seen ?? "").startsWith(month)).length,
    };
  }, [clients]);

  return (
    <Ctx.Provider
      value={{
        clients,
        loading,
        error,
        total,
        newThisMonth,
        refresh,
        addClient,
        updateClient,
        syncFromSquare,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useClients = () => useContext(Ctx);
