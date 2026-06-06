"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Expense = {
  id: string;
  date: string;
  category: string;
  vendor: string | null;
  amount_cents: number;
  note: string;
  receipt_url: string | null;
  created_at: string;
};

export type ExpenseInput = {
  date?: string;
  category?: string;
  vendor?: string | null;
  amountCents: number;
  note?: string;
  receiptUrl?: string | null;
};

type Ctx = {
  expenses: Expense[];
  loading: boolean;
  error: string | null;
  totalCents: number;
  byCategory: Record<string, number>;
  refresh: () => Promise<void>;
  addExpense: (input: ExpenseInput) => Promise<{ ok: boolean; error?: string }>;
  removeExpense: (id: string) => Promise<void>;
};

const C = createContext<Ctx>({
  expenses: [],
  loading: true,
  error: null,
  totalCents: 0,
  byCategory: {},
  refresh: async () => {},
  addExpense: async () => ({ ok: false }),
  removeExpense: async () => {},
});

export function ExpensesProvider({ children }: { children: React.ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/expenses");
      const d = await r.json();
      if (r.ok) {
        setExpenses(d.expenses || []);
        setError(null);
      } else {
        setError(r.status === 403 ? "Owners & bookkeepers only." : d.error || "Could not load expenses.");
        setExpenses([]);
      }
    } catch {
      setError("Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addExpense: Ctx["addExpense"] = useCallback(
    async (input) => {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not add that expense." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const removeExpense: Ctx["removeExpense"] = useCallback(
    async (id) => {
      setExpenses((p) => p.filter((e) => e.id !== id));
      await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const totalCents = useMemo(() => expenses.reduce((a, e) => a + e.amount_cents, 0), [expenses]);
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) m[e.category] = (m[e.category] ?? 0) + e.amount_cents;
    return m;
  }, [expenses]);

  return (
    <C.Provider value={{ expenses, loading, error, totalCents, byCategory, refresh, addExpense, removeExpense }}>
      {children}
    </C.Provider>
  );
}

export const useExpenses = () => useContext(C);
