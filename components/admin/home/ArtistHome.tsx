"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useBookings } from "@/lib/admin/bookings-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { statementFor, fmt, payTypeLabel } from "@/lib/admin/calc";
import { StatCard, Card, SectionTitle, Badge, MockBanner } from "@/components/admin/ui";
import { PageHead, Empty, clock, greeting } from "./shared";

// Artist: only their own numbers and work. No shop-wide anything (RLS scopes
// their reads too). Compliance is owner-only, so it isn't shown here.
export default function ArtistHome({ artistId }: { artistId: string }) {
  const { sales, real, loading } = useSales();
  const { artists } = useArtists();
  const { bookings } = useBookings();
  const { statements: settled } = useSettledStatements();

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
  // Earnings/tips/tickets = period to date; the live balance comes from the
  // settlement-aware statement so it matches the Pay page (and clears there).
  const st = statementFor(artist, sales);
  const balance = settled.find((s) => s.artist.id === artistId) ?? st;
  const payType = artist.pay.type;

  return (
    <div>
      <PageHead title={`${greeting()}, ${artist.name.split(" ")[0]}`} sub={payTypeLabel(artist)} />
      {!real && !loading && <MockBanner source="Square" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {payType === "payroll_salary" ? (
          <StatCard
            label="Your sales"
            value={fmt(st.grossService + st.grossTips)}
            sub="shop revenue · you're paid a salary via Gusto"
            accent
          />
        ) : (
          <StatCard label="You earned" value={fmt(st.artistEarnings)} sub="service kept + tips" accent />
        )}
        <StatCard label="Tips" value={fmt(st.grossTips)} />
        {payType === "booth_rent" ? (
          <StatCard
            label="Shop is holding"
            value={fmt(balance.passThroughOwed)}
            tone="good"
            sub="your card sales, passed through 100%"
          />
        ) : payType === "payroll_split" ? (
          <StatCard
            label="Next Gusto run"
            value={fmt(balance.gustoWages)}
            sub="wages headed to payroll"
          />
        ) : (
          <StatCard label="How you're paid" value="Salary" sub="via Gusto payroll" />
        )}
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
            <div className="divide-y divide-white/8">
              {upcoming.length === 0 && <Empty>No upcoming appointments.</Empty>}
              {upcoming.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <div className="text-sm font-medium">
                    {b.starts_at.slice(5, 10)} · {clock(b.starts_at)}
                  </div>
                  <div className="text-xs text-white/60">
                    {b.service_desc || "Session"}
                    {b.deposit_status === "held" ? " · deposit held" : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <SectionTitle
            action={<Link href="/admin/payouts" className="text-xs font-medium text-brand">My statement →</Link>}
          >
            Recent work
          </SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/55">
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
                {mine.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-b border-white/8 last:border-0">
                    <td className="px-4 py-2.5 text-white/70">{s.date}</td>
                    <td className="px-4 py-2.5">{s.description}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={s.method === "cash" ? "warn" : "neutral"}>{s.method}</Badge>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">{fmt(s.serviceCents)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-white/70">{fmt(s.tipCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mine.length > 10 && (
              <div className="border-t border-white/8 px-4 py-2 text-center text-xs text-white/55">
                Last 10 of {mine.length} tickets
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
