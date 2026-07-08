"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SALES as MOCK_SALES } from "./mock-data";
import type { Sale } from "./types";

// Sales come from the Supabase `sales` table: Square's mirror PLUS native
// Stripe charges (Tap to Pay + pay-link tickets, written by settlePayment). Until
// there are any rows the user can see, we fall back to the mock dataset so the
// dashboard is never empty during setup. RLS scopes rows per role (owners see
// all, an artist sees only their own).
type SalesCtx = { sales: Sale[]; real: boolean; loading: boolean };
const Ctx = createContext<SalesCtx>({ sales: MOCK_SALES, real: false, loading: true });

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>(MOCK_SALES);
  const [real, setReal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        // Canonical ledger (as sales-shaped rows) — the money source of truth.
        // PostgREST clamps every response at 1000 rows no matter the limit, so
        // page through — the shop already has 2000+ sales (20k safety stop).
        type Row = {
          id: string;
          created_at: string | null;
          service_cents: number | null;
          tip_cents: number | null;
          method: string | null;
          artist_id: string | null;
        };
        const data: Row[] = [];
        for (let start = 0; start < 20000; start += 1000) {
          const { data: page } = await sb
            .from("ledger_sales")
            .select("id, created_at, service_cents, tip_cents, method, artist_id")
            .order("created_at", { ascending: false })
            .range(start, start + 999);
          data.push(...(((page ?? []) as Row[])));
          if (!page || page.length < 1000) break;
        }
        if (!alive) return;
        if (data.length) {
          setSales(
            data.map((r) => ({
              id: r.id,
              artistId: r.artist_id ?? "",
              date: (r.created_at || "").slice(0, 10),
              serviceCents: r.service_cents ?? 0,
              tipCents: r.tip_cents ?? 0,
              method: r.method === "cash" ? "cash" : "card",
              squarePaymentId: r.id,
              // The Square mirror carries no line-item text — say what we know.
              description: r.method === "cash" ? "Cash sale" : "Card sale",
            })),
          );
          setReal(true);
        }
      } catch {
        /* keep mock */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={{ sales, real, loading }}>{children}</Ctx.Provider>;
}

export const useSales = () => useContext(Ctx);
