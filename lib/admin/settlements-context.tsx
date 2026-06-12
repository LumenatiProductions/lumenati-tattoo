"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSales } from "./sales-context";
import { useArtists } from "./artists-context";
import { useRent } from "./rent-context";
import { statementFor, type ArtistStatement } from "./calc";
import type { RentCharge } from "./types";

// Settlement-aware statements — the single source of truth for "who owes whom".
// Sales count only AFTER each artist's settled_through, and unpaid rent invoices
// (matched to artists by payer name) ride along. The Payouts page and the
// owner/bookkeeper/artist homes all read from here so the home never claims a
// different number than Settle Up.

const norm = (s: string) => s.trim().toLowerCase();

export function useSettledStatements() {
  const { sales } = useSales();
  const { artists } = useArtists();
  const { invoices } = useRent();

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

  // Rent invoices -> per-artist unpaid rent, matched by payer name (best effort
  // while Square is still the rent system of record).
  const rentCharges = useMemo<RentCharge[]>(() => {
    const out: RentCharge[] = [];
    for (const inv of invoices) {
      const payer = norm(inv.name || "");
      if (!payer) continue;
      const artist = artists.find(
        (a) => payer === norm(a.name) || payer.includes(norm(a.name)) || norm(a.name).includes(payer),
      );
      if (!artist) continue;
      out.push({
        id: inv.id,
        artistId: artist.id,
        periodLabel: inv.title,
        amountCents: inv.amountCents,
        dueDate: inv.dueDate ?? "",
        paid: inv.paid,
      });
    }
    return out;
  }, [invoices, artists]);

  const statements = useMemo<ArtistStatement[]>(
    () =>
      artists.map((a) => {
        const since = settledThrough[a.id];
        const mine = since ? sales.filter((s) => s.artistId !== a.id || s.date > since) : sales;
        return statementFor(a, mine, rentCharges);
      }),
    [artists, sales, rentCharges, settledThrough],
  );

  // Headline sums: positive nets = shop pays artists, negative = shop collects.
  const payoutsOwed = useMemo(
    () => statements.filter((s) => s.net > 0).reduce((a, s) => a + s.net, 0),
    [statements],
  );
  const collectFromArtists = useMemo(
    () => statements.filter((s) => s.net < 0).reduce((a, s) => a - s.net, 0),
    [statements],
  );

  return { statements, payoutsOwed, collectFromArtists, settledThrough, configured, refresh };
}
