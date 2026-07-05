"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type CashEntry = {
  id: string;
  date: string;
  artist_id: string | null;
  amount_cents: number;
  note: string;
  entered_by: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
  created_at: string;
};

export type NewCashEntry = {
  date?: string;
  artistId?: string | null;
  amountCents: number;
  /** Sales tax included in the amount (taxable product sales). */
  taxCents?: number;
  note?: string;
};

type CashCtx = {
  entries: CashEntry[];
  loading: boolean;
  error: string | null;
  configured: boolean;
  // Overview aggregates surfaced for the role homes.
  totalCents: number;
  outstandingCents: number;
  refresh: () => Promise<void>;
  addEntry: (input: NewCashEntry) => Promise<{ ok: boolean; error?: string }>;
  toggleReconciled: (id: string, reconciled: boolean) => Promise<void>;
};

const Ctx = createContext<CashCtx>({
  entries: [],
  loading: true,
  error: null,
  configured: false,
  totalCents: 0,
  outstandingCents: 0,
  refresh: async () => {},
  addEntry: async () => ({ ok: false }),
  toggleReconciled: async () => {},
});

export function CashProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cash");
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setEntries(d.entries || []);
        setConfigured(d.configured !== false);
        setError(null);
      } else if (r.status !== 403) {
        // Artists get a 403 — that's a quiet no-op, not an error banner.
        setError(d.error || "Could not load the cash log.");
      }
    } catch {
      setError("Could not load the cash log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEntry: CashCtx["addEntry"] = useCallback(
    async (input) => {
      try {
        const r = await fetch("/api/cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: d.error || "Could not log that." };
        await refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: "Connection problem — try again." };
      }
    },
    [refresh],
  );

  const toggleReconciled: CashCtx["toggleReconciled"] = useCallback(
    async (id, reconciled) => {
      // Optimistic; the refresh-on-failure pulls the truth back.
      setEntries((p) => p.map((x) => (x.id === id ? { ...x, reconciled } : x)));
      try {
        const r = await fetch("/api/cash", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, reconciled }),
        });
        if (!r.ok) await refresh();
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const { totalCents, outstandingCents } = useMemo(
    () => ({
      totalCents: entries.reduce((a, c) => a + c.amount_cents, 0),
      outstandingCents: entries.filter((c) => !c.reconciled).reduce((a, c) => a + c.amount_cents, 0),
    }),
    [entries],
  );

  return (
    <Ctx.Provider
      value={{
        entries,
        loading,
        error,
        configured,
        totalCents,
        outstandingCents,
        refresh,
        addEntry,
        toggleReconciled,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCash = () => useContext(Ctx);
