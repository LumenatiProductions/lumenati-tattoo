"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useBookings } from "@/lib/admin/bookings-context";
import { statementFor, fmt, payTypeLabel } from "@/lib/admin/calc";
import { StatCard, Card, SectionTitle, Badge, MockBanner } from "@/components/admin/ui";
import { PageHead, Empty, clock, greeting } from "./shared";

// Artist: only their own numbers and work. No shop-wide anything (RLS scopes
// their reads too). Compliance is owner-only, so it isn't shown here.
export default function ArtistHome({ artistId }: { artistId: string }) {
  const { sales, real } = useSales();
  const { artists } = useArtists();
  const { bookings } = useBookings();

  const artist = artists.find((a) => a.id === artistId);

  const mine = useMemo(() => sales.filter((s) => s.artistId === artistId), [sales, artistId]);
  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return bookings
      .filter((b) => b.artist_id === artistId && b.status === "scheduled" && b.starts_at >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 6);
  }, [bookings, artistId]);

  if (!artist) return null;
  const st = statementFor(artist, sales, []);

  return (
    <div>
      <PageHead title={`${greeting()}, ${artist.name.split(" ")[0]}`} sub={payTypeLabel(artist)} />
      {!real && <MockBanner source="Square" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="You earned" value={fmt(st.artistEarnings)} sub="service kept + tips" accent />
        <StatCard label="Tips" value={fmt(st.grossTips)} />
        <StatCard
          label={st.net >= 0 ? "Shop owes you" : "You owe shop"}
          value={fmt(Math.abs(st.net))}
          tone={st.net >= 0 ? "good" : "warn"}
          sub={st.net >= 0 ? "from card sales" : "cash cut + rent"}
        />
        <StatCard label="Tickets" value={String(st.saleCount)} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <SectionTitle
            action={<Link href="/admin/bookings" className="text-xs font-medium text-brand">My bookings →</Link>}
          >
            Coming up
          </SectionTitle>
          <Card>
            <div className="divide-y divide-black/5">
              {upcoming.length === 0 && <Empty>No upcoming appointments.</Empty>}
              {upcoming.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <div className="text-sm font-medium">
                    {b.starts_at.slice(5, 10)} · {clock(b.starts_at)}
                  </div>
                  <div className="text-xs text-black/45">
                    {b.service_desc || "Session"}
                    {b.deposit_status === "held" ? " · deposit held" : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <SectionTitle>Recent work</SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/40">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Service</th>
                  <th className="px-4 py-2.5 font-medium">Pay</th>
                  <th className="px-4 py-2.5 text-right font-medium">Service</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tip</th>
                </tr>
              </thead>
              <tbody>
                {mine.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <Empty>No tickets yet.</Empty>
                    </td>
                  </tr>
                )}
                {mine.map((s) => (
                  <tr key={s.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5 text-black/55">{s.date}</td>
                    <td className="px-4 py-2.5">{s.description}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={s.method === "cash" ? "warn" : "neutral"}>{s.method}</Badge>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">{fmt(s.serviceCents)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-black/55">{fmt(s.tipCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
