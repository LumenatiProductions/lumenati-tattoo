"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, StatCard } from "@/components/admin/ui";

// Review velocity (Reports). Are review asks turning into stars? Left side:
// the shop's current Google standing and what changed. Bars: per week, asks
// the follow-up engine sent vs reviews actually gained (deltas between
// snapshots). Snapshots come from the daily Places job once the key exists;
// until then the desk logs the count by hand right here.

type Snap = { captured_on: string; rating: number | null; review_count: number; source: string };
type Payload = {
  snapshots: Snap[];
  askDates: string[];
  placesConfigured: boolean;
  reviewLinkConfigured: boolean;
};

const WEEKS = 8;
const dayMs = 86_400_000;

// Monday of the week containing d, as a comparable yyyy-mm-dd.
function weekKey(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
const weekLabel = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ReviewVelocity() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [count, setCount] = useState("");
  const [rating, setRating] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reviews");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load");
      setData((await r.json()) as Payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const logNow = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: Number(count), rating: rating ? Number(rating) : null }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? "Could not save.");
      return;
    }
    setLogging(false);
    setCount("");
    setRating("");
    load();
  };

  const view = useMemo(() => {
    if (!data) return null;
    const snaps = data.snapshots;
    const latest = snaps[snaps.length - 1] ?? null;

    // Reviews gained per week = last snapshot in the week minus the last
    // snapshot before it. Sparse manual logging leaves honest gaps (null).
    const weeks: { key: string; asks: number; gained: number | null }[] = [];
    const now = new Date();
    for (let i = WEEKS - 1; i >= 0; i--) {
      weeks.push({ key: weekKey(new Date(now.getTime() - i * 7 * dayMs)), asks: 0, gained: null });
    }
    for (const a of data.askDates) {
      const k = weekKey(new Date(a));
      const w = weeks.find((x) => x.key === k);
      if (w) w.asks++;
    }
    for (const w of weeks) {
      const end = new Date(new Date(`${w.key}T00:00:00`).getTime() + 7 * dayMs).toISOString().slice(0, 10);
      const inOrBefore = snaps.filter((s) => s.captured_on < end);
      const before = snaps.filter((s) => s.captured_on < w.key);
      if (inOrBefore.length && before.length) {
        const a = inOrBefore[inOrBefore.length - 1];
        const b = before[before.length - 1];
        if (a.captured_on !== b.captured_on) w.gained = Math.max(0, a.review_count - b.review_count);
        else w.gained = null; // no fresh snapshot that week — unknown, not zero
      }
    }

    const monthAgo = new Date(now.getTime() - 30 * dayMs).toISOString().slice(0, 10);
    const baseline = [...snaps].reverse().find((s) => s.captured_on <= monthAgo) ?? snaps[0] ?? null;
    const gained30 = latest && baseline && latest.captured_on !== baseline.captured_on
      ? Math.max(0, latest.review_count - baseline.review_count)
      : null;
    const asks30 = data.askDates.filter((a) => new Date(a).getTime() > now.getTime() - 30 * dayMs).length;
    const maxBar = Math.max(1, ...weeks.map((w) => Math.max(w.asks, w.gained ?? 0)));
    return { latest, weeks, gained30, asks30, maxBar };
  }, [data]);

  return (
    <>
      <SectionTitle
        action={
          !data?.placesConfigured ? (
            <button
              onClick={() => setLogging((v) => !v)}
              className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6"
            >
              {logging ? "Never mind" : "Log today's count"}
            </button>
          ) : undefined
        }
      >
        Review velocity
      </SectionTitle>
      <Card className="mb-6 p-4">
        {err && <div className="mb-3 text-sm text-rose-400">{err}</div>}
        {!data || !view ? (
          <div className="text-sm text-white/55">Loading…</div>
        ) : (
          <>
            {logging && (
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/4 p-3">
                <label className="text-xs text-white/65">
                  Google review count
                  <input
                    value={count}
                    onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 212"
                    className="mt-1 block w-32 rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/65">
                  Star rating (optional)
                  <input
                    value={rating}
                    onChange={(e) => setRating(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="4.9"
                    className="mt-1 block w-24 rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm text-white"
                  />
                </label>
                <button
                  onClick={logNow}
                  disabled={busy || !count}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <span className="text-xs text-white/45">Straight off the shop&apos;s Google listing.</span>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Google rating"
                value={view.latest?.rating ? `${Number(view.latest.rating).toFixed(1)} ★`.replace(" ★", "") : "·"}
                sub={view.latest ? `as of ${view.latest.captured_on}` : "no snapshot yet"}
                accent
              />
              <StatCard label="Total reviews" value={view.latest ? String(view.latest.review_count) : "·"} />
              <StatCard
                label="New in 30 days"
                value={view.gained30 === null ? "·" : `+${view.gained30}`}
                tone="good"
                sub={view.gained30 === null ? "needs two snapshots" : undefined}
              />
              <StatCard label="Asks sent, 30 days" value={String(view.asks30)} />
            </div>

            {/* Asks vs gained, per week. Honest gaps: a week with no fresh
                snapshot shows no green bar rather than a fake zero. */}
            <div className="flex items-end gap-2">
              {view.weeks.map((w) => (
                <div key={w.key} className="flex-1">
                  <div className="flex h-24 items-end justify-center gap-1">
                    <div
                      title={`${w.asks} asks`}
                      className="rounded-t"
                      style={{ width: 12, height: `${(w.asks / view.maxBar) * 100}%`, background: "rgba(255,255,255,0.25)" }}
                    />
                    <div
                      title={w.gained === null ? "no snapshot" : `+${w.gained} reviews`}
                      className="rounded-t"
                      // All inline on purpose: this scoped Tailwind build does
                      // not reliably compile utilities that first appear in a
                      // new file (w-3 / bg-emerald-400 both came out empty).
                      style={{
                        width: 12,
                        height: w.gained === null ? "4px" : `${(w.gained / view.maxBar) * 100}%`,
                        background: w.gained === null ? "rgba(255,255,255,0.06)" : "#34d399",
                      }}
                    />
                  </div>
                  <div className="mt-1 text-center text-[10px] text-white/45">{weekLabel(w.key)}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-white/55">
              <span className="flex items-center gap-1.5">
                <span className="inline-block rounded-sm" style={{ width: 8, height: 8, background: "rgba(255,255,255,0.25)" }} /> review asks sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block rounded-sm" style={{ width: 8, height: 8, background: "#34d399" }} /> reviews gained
              </span>
            </div>

            <div className="mt-4 space-y-1 text-xs text-white/45">
              {!data.reviewLinkConfigured && (
                <div>
                  Review-request emails have no Google link yet. Set GOOGLE_REVIEW_URL (owner checklist) and the asks
                  start pointing somewhere.
                </div>
              )}
              {!data.placesConfigured && (
                <div>
                  Tracking is manual for now. Add GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID and the count updates itself
                  every morning.
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
