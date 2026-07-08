"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

// Mirrors the /api/reports payload (all money in integer cents).
export type ReportArtist = {
  id: string;
  name: string;
  color: string;
  payType: "payroll_salary" | "payroll_split" | "booth_rent";
  splitPct: number;
  rentCents: number;
  saleCount: number;
  grossService: number;
  grossTips: number;
  shopCut: number;
  artistEarnings: number; // renters: 1099 basis; splits: Gusto wages
  passThrough: number;
  gustoWages: number;
};

export type ReportData = {
  range: { from: string; to: string };
  real: boolean;
  shop: {
    grossSales: number;
    serviceRevenue: number;
    tips: number;
    splitRevenue: number;
    rentCollected: number;
    rentOutstanding: number;
    shopRevenue: number;
    cardTotal: number;
    cashTotal: number;
    renterPassThrough: number;
    gustoWages: number;
  };
  artists: ReportArtist[];
  deposits: { held: number; applied: number; forfeited: number; count: number };
  expenses: { supplyValueCents: number; supplyItems: number };
  rentConfigured: boolean;
};

// ── Date-range presets ──────────────────────────────────────────────────────
export type RangePreset = "this_month" | "this_quarter" | "ytd" | "year";
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Resolve a preset (optionally for a specific calendar year, used by the 1099
// view) to a concrete {from,to}. "year" needs `year`; the others are relative
// to today.
export function resolveRange(preset: RangePreset, year?: number): { from: string; to: string } {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  if (preset === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (preset === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to: iso(now) };
  if (preset === "this_month") {
    const m = now.getUTCMonth();
    return {
      from: iso(new Date(Date.UTC(now.getUTCFullYear(), m, 1))),
      to: iso(now),
    };
  }
  // this_quarter
  const q = Math.floor(now.getUTCMonth() / 3);
  return {
    from: iso(new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))),
    to: iso(now),
  };
}

type ReportsCtx = {
  data: ReportData | null;
  loading: boolean;
  error: string | null;
  preset: RangePreset;
  year: number;
  setPreset: (p: RangePreset) => void;
  setYear: (y: number) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ReportsCtx>({
  data: null,
  loading: true,
  error: null,
  preset: "ytd",
  year: new Date().getUTCFullYear(),
  setPreset: () => {},
  setYear: () => {},
  refresh: async () => {},
});

export function ReportsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>("ytd");
  const [year, setYear] = useState(new Date().getUTCFullYear());

  const range = useMemo(() => resolveRange(preset, year), [preset, year]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reports?from=${range.from}&to=${range.to}`);
      const d = await r.json();
      if (r.ok) {
        setData(d);
        setError(null);
      } else {
        // Artists / non-staff get a 403 — surface it plainly, don't crash.
        setError(r.status === 403 ? "Reports are for owners and bookkeepers." : d.error || "Could not load reports.");
        setData(null);
      }
    } catch {
      setError("Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ data, loading, error, preset, year, setPreset, setYear, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useReports = () => useContext(Ctx);
