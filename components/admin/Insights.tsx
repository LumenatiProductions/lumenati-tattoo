"use client";

import { useEffect, useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle, StatCard, Dot, StatRow } from "@/components/admin/ui";

// Insights block at the bottom of Reports: the patterns hiding in the data the
// shop already has. 90-day window, computed server-side (/api/insights).

type Data = {
  windowDays: number;
  rebooking: { visited: number; rebooked: number; pct: number };
  noShowByArtist: { artistId: string; settled: number; noShowPct: number }[];
  hours: number[];
  topClients: { id: string; name: string; spentCents: number; lastSeen: string | null }[];
};

export default function Insights() {
  const { artists } = useArtists();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/insights");
        if (r.ok) setData(await r.json());
      } catch {
        /* section stays hidden */
      }
    })();
  }, []);

  if (!data) return null;

  const artistName = (id: string) => artists.find((a) => a.id === id)?.name ?? id;
  const artistColor = (id: string) => artists.find((a) => a.id === id)?.color ?? "#999";
  const maxHour = Math.max(1, ...data.hours);
  // Show the working span only (8a-10p) so the bars aren't drowned in night zeros.
  const span = data.hours.map((n, h) => ({ h, n })).slice(8, 22);
  const hourLabel = (h: number) => (h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`);

  return (
    <div className="mt-6">
      <SectionTitle>
        Insights <span className="font-normal text-white/50">· last {data.windowDays} days</span>
      </SectionTitle>

      <StatRow compact>
        <StatCard
          label="Rebooking rate"
          value={`${data.rebooking.pct}%`}
          sub={`${data.rebooking.rebooked} of ${data.rebooking.visited} clients came back`}
          tone={data.rebooking.pct >= 30 ? "good" : "neutral"}
          accent
        />
        <StatCard
          label="Clients seen"
          value={String(data.rebooking.visited)}
          sub="with a completed visit"
        />
        <StatCard
          label="Peak hour"
          value={hourLabel(span.reduce((best, x) => (x.n > best.n ? x : best), span[0]).h)}
          sub="most booked start time"
        />
        <StatCard
          label="Top client"
          value={data.topClients[0] ? fmt(data.topClients[0].spentCents) : "·"}
          sub={data.topClients[0]?.name ?? "no spend data yet"}
        />
      </StatRow>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Busiest hours */}
        <Card>
          <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-white/60">Busiest hours</div>
          <div className="flex items-end gap-1 px-4 pb-4 pt-3" style={{ height: 120 }}>
            {span.map(({ h, n }) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${hourLabel(h)} · ${n} booking${n === 1 ? "" : "s"}`}>
                <div
                  className="w-full rounded-t bg-brand/70"
                  style={{ height: `${Math.round((n / maxHour) * 80)}px`, minHeight: n ? 3 : 2, opacity: n ? 1 : 0.3 }}
                />
                <span className="text-[10px] text-white/60">{hourLabel(h)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* No-show by artist */}
        <Card>
          <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-white/60">No-show rate by artist</div>
          <div className="divide-y divide-white/8 pb-1">
            {data.noShowByArtist.length === 0 && (
              <div className="px-4 py-5 text-center text-sm text-white/55">Not enough settled bookings yet.</div>
            )}
            {data.noShowByArtist.map((r) => (
              <div key={r.artistId} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Dot color={artistColor(r.artistId)} />
                  {artistName(r.artistId)}
                  <span className="text-[11px] text-white/50">({r.settled} settled)</span>
                </span>
                <span className={`tnum font-semibold ${r.noShowPct >= 15 ? "text-amber-400" : "text-emerald-400"}`}>
                  {r.noShowPct}%
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Top clients */}
        <Card>
          <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-white/60">Top clients · lifetime</div>
          <div className="divide-y divide-white/8 pb-1">
            {data.topClients.length === 0 && (
              <div className="px-4 py-5 text-center text-sm text-white/55">No spend recorded yet.</div>
            )}
            {data.topClients.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="truncate">{c.name}</span>
                <span className="tnum shrink-0 font-semibold">{fmt(c.spentCents)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
