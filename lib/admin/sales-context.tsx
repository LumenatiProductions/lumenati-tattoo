"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SALES as MOCK_SALES } from "./mock-data";
import type { Sale } from "./types";

// Sales come from the Supabase `sales` mirror (synced from Square). Until there
// are any rows the user can see, we fall back to the mock dataset so the
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
        const { data } = await sb
          .from("sales")
          .select("id, created_at, service_cents, tip_cents, method, artist_id")
          .order("created_at", { ascending: false })
          .limit(3000);
        if (!alive) return;
        if (data && data.length) {
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
