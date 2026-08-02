"use client";

import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useSales } from "@/lib/admin/sales-context";
import { createClient } from "@/lib/supabase/browser";
import { statementFor, fmt } from "@/lib/admin/calc";
import { Card, SectionTitle } from "@/components/admin/ui";
import { PageHead } from "@/components/admin/home/shared";

// Artist income goals — the phone app's Goals screen, on desktop. Set a weekly
// and monthly target plus the tax set-aside %, and watch progress fill against
// your own real sales. Saved to artist_goals (keyed to the signed-in user), the
// same row the app reads.

type TaxStatus = "1099" | "w2";
type Goals = {
  weekly_cents: number;
  monthly_cents: number;
  tax_setaside_pct: number;
  tax_status: TaxStatus;
};
const DEFAULTS: Goals = { weekly_cents: 0, monthly_cents: 0, tax_setaside_pct: 0.3, tax_status: "1099" };

const weekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().slice(0, 10);
};
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";

export default function GoalsPage() {
  const { asArtistId } = useRole();
  const { artists } = useArtists();
  const { sales } = useSales();
  const artist = artists.find((a) => a.id === asArtistId);

  const [goals, setGoals] = useState<Goals>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let alive = true;
    createClient()
      .from("artist_goals")
      .select("weekly_cents, monthly_cents, tax_setaside_pct, tax_status")
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data) setGoals({ ...DEFAULTS, ...(data as Partial<Goals>) });
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Earned this week / month, from the artist's own sales. Renters keep it all,
  // split artists keep their basis; salaried see gross service (they don't keep
  // a split, but the target is still their production).
  const earned = useMemo(() => {
    if (!artist) return { week: 0, month: 0 };
    const mine = sales.filter((s) => s.artistId === asArtistId);
    const wk = weekStart();
    const mo = monthStart();
    const at = (since: string) => {
      const rows = mine.filter((s) => s.date >= since);
      const st = statementFor(artist, rows);
      return artist.pay.type === "payroll_salary" ? st.grossService + st.grossTips : st.artistEarnings;
    };
    return { week: at(wk), month: at(mo) };
  }, [artist, sales, asArtistId]);

  if (!artist) return null;

  const save = async () => {
    setSaveState("saving");
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) {
      setSaveState("error");
      return;
    }
    const { error } = await sb.from("artist_goals").upsert({
      user_id: u.user.id,
      ...goals,
      updated_at: new Date().toISOString(),
    });
    setSaveState(error ? "error" : "saved");
    if (!error) setTimeout(() => setSaveState("idle"), 1800);
  };

  const setDollars = (key: "weekly_cents" | "monthly_cents", dollars: string) => {
    const n = Math.round(Number(dollars) * 100);
    setGoals((g) => ({ ...g, [key]: Number.isFinite(n) && n > 0 ? n : 0 }));
  };

  return (
    <div>
      <PageHead title="Goals" sub="Your income targets and tax set-aside" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProgressCard
          label="This week"
          earnedCents={earned.week}
          targetCents={goals.weekly_cents}
          value={goals.weekly_cents ? String(Math.round(goals.weekly_cents / 100)) : ""}
          onChange={(v) => setDollars("weekly_cents", v)}
        />
        <ProgressCard
          label="This month"
          earnedCents={earned.month}
          targetCents={goals.monthly_cents}
          value={goals.monthly_cents ? String(Math.round(goals.monthly_cents / 100)) : ""}
          onChange={(v) => setDollars("monthly_cents", v)}
        />
      </div>

      <div className="mt-4">
        <SectionTitle>Tax set-aside</SectionTitle>
        <Card>
          <div className="p-4">
            <p className="mb-3 text-sm text-white/65">
              What to hold back from each ticket for taxes. Renters (1099) usually keep ~30%;
              payroll artists (W-2) have tax withheld already, so a small cushion covers cash tips.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.round(goals.tax_setaside_pct * 100)}
                onChange={(e) =>
                  setGoals((g) => ({ ...g, tax_setaside_pct: Number(e.target.value) / 100 }))
                }
                className="flex-1 accent-brand"
              />
              <div className="tnum w-14 text-right text-2xl font-bold">
                {Math.round(goals.tax_setaside_pct * 100)}%
              </div>
            </div>
            <div className="mt-3 text-sm text-white/70">
              Set aside{" "}
              <span className="font-semibold text-white">
                {fmt(Math.round(earned.month * goals.tax_setaside_pct))}
              </span>{" "}
              from this month so far.
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!loaded || saveState === "saving"}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saveState === "saving" ? "Saving…" : "Save goals"}
        </button>
        {saveState === "saved" && <span className="text-sm font-medium text-emerald-400">Saved</span>}
        {saveState === "error" && (
          <span className="text-sm font-medium text-rose-400">Couldn&apos;t save, try again.</span>
        )}
      </div>
    </div>
  );
}

function ProgressCard({
  label,
  earnedCents,
  targetCents,
  value,
  onChange,
}: {
  label: string;
  earnedCents: number;
  targetCents: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const pct = targetCents > 0 ? Math.min(100, Math.round((earnedCents / targetCents) * 100)) : 0;
  const hit = targetCents > 0 && earnedCents >= targetCents;
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-white/60">{label}</div>
          <div className="text-xs text-white/55">{targetCents > 0 ? `${pct}%` : "no target set"}</div>
        </div>
        <div className="tnum mt-1 text-2xl font-bold">
          {fmt(earnedCents)}
          {targetCents > 0 && <span className="text-base font-medium text-white/45"> / {fmt(targetCents)}</span>}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${hit ? "bg-emerald-400" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-white/65">Target ($)</span>
          <div className="flex items-center rounded-lg border border-white/12 bg-white/6">
            <span className="pl-3 text-white/55">$</span>
            <input
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
              inputMode="numeric"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="0"
            />
          </div>
        </label>
      </div>
    </Card>
  );
}
