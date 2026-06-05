"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type RentInvoice = {
  id: string;
  name: string;
  title: string;
  amountCents: number;
  status: string;
  dueDate: string | null;
  paid: boolean;
  overdue: boolean;
};

type RentCtx = {
  invoices: RentInvoice[];
  loading: boolean;
  outstandingCents: number;
  collectedCents: number;
  overdue: RentInvoice[];
};

const Ctx = createContext<RentCtx>({
  invoices: [],
  loading: true,
  outstandingCents: 0,
  collectedCents: 0,
  overdue: [],
});

export function RentProvider({ children }: { children: React.ReactNode }) {
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/rent")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInvoices(d.invoices || []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const outstandingCents = invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amountCents, 0);
  const collectedCents = invoices.filter((i) => i.paid).reduce((a, i) => a + i.amountCents, 0);
  const overdue = invoices.filter((i) => i.overdue);

  return (
    <Ctx.Provider value={{ invoices, loading, outstandingCents, collectedCents, overdue }}>
      {children}
    </Ctx.Provider>
  );
}

export const useRent = () => useContext(Ctx);
