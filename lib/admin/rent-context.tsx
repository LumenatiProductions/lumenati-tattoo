"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { todayLocal } from "@/lib/dates";

// Booth rent, straight from the in-house engine (rent_invoices — generated
// monthly, paid via our Stripe links or marked paid cash/check). This used to
// read Square's invoice API, which the shop never used for rent, so the
// Overview panel sat at $0 while real invoices aged in the engine.

export type RentInvoice = {
  id: string;
  name: string;
  title: string;
  amountCents: number;
  status: string;
  dueDate: string | null;
  paid: boolean;
  overdue: boolean;
  period: string;
};

type RentCtx = {
  invoices: RentInvoice[];
  loading: boolean;
  outstandingCents: number;
  collectedCents: number;
  overdue: RentInvoice[];
  refresh: () => void;
};

const Ctx = createContext<RentCtx>({
  invoices: [],
  loading: true,
  outstandingCents: 0,
  collectedCents: 0,
  overdue: [],
  refresh: () => {},
});

type Row = {
  id: string;
  artist_id: string;
  period: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
};

const periodLabel = (p: string) =>
  new Date(`${p}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function RentProvider({ children }: { children: React.ReactNode }) {
  const { artists } = useArtists();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/rent/invoices")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setRows(((d.invoices || []) as Row[]).filter((r) => r.status !== "void"));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const today = todayLocal();
  const invoices: RentInvoice[] = rows.map((r) => ({
    id: r.id,
    name: artists.find((a) => a.id === r.artist_id)?.name ?? r.artist_id,
    title: `${periodLabel(r.period)} rent`,
    amountCents: r.amount_cents,
    status: r.status,
    dueDate: r.due_date,
    paid: r.status === "paid",
    overdue: r.status === "pending" && !!r.due_date && r.due_date < today,
    period: r.period,
  }));

  const outstandingCents = invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amountCents, 0);
  // "Collected this cycle" = the current month's paid invoices, not all history.
  const thisPeriod = today.slice(0, 7);
  const collectedCents = invoices
    .filter((i) => i.paid && i.period === thisPeriod)
    .reduce((a, i) => a + i.amountCents, 0);
  const overdue = invoices.filter((i) => i.overdue);

  return (
    <Ctx.Provider
      value={{ invoices, loading, outstandingCents, collectedCents, overdue, refresh: () => setTick((t) => t + 1) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useRent = () => useContext(Ctx);
