"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSales } from "./sales-context";
import { useArtists } from "./artists-context";
import { statementFor, type ArtistStatement } from "./calc";

// Settlement-aware statements — the single source of truth for the two money
// jobs the app tracks: card sales held for booth renters (passed through 100%)
// and Gusto payroll-prep wages for split artists. Sales count only AFTER each
// artist's settled_through; a settle = "passed it through" for a renter or
// "entered it into Gusto" for a payroll artist. Rent NEVER appears here — it's
// billed on its own and never netted. The salaried owner has no statement.

export function useSettledStatements() {
  const { sales } = useSales();
  const { artists } = useArtists();

  const [settledThrough, setSettledThrough] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/settlements");
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSettledThrough(d.settledThrough || {});
        setConfigured(d.configured === true);
      }
    } catch {
      /* keep the unsettled view; buttons stay hidden */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const statements = useMemo<ArtistStatement[]>(
    () =>
      artists
        .filter((a) => a.pay.type !== "payroll_salary")
        .map((a) => {
          const since = settledThrough[a.id];
          const mine = since ? sales.filter((s) => s.artistId !== a.id || s.date > since) : sales;
          return statementFor(a, mine);
        }),
    [artists, sales, settledThrough],
  );

  // Headline sums: renters' card money the shop is holding, and the wages
  // waiting to be typed into Gusto.
  const holdingForRenters = useMemo(
    () => statements.reduce((a, s) => a + s.passThroughOwed, 0),
    [statements],
  );
  const gustoWagesDue = useMemo(
    () => statements.reduce((a, s) => a + s.gustoWages, 0),
    [statements],
  );

  return { statements, holdingForRenters, gustoWagesDue, settledThrough, configured, refresh };
}
