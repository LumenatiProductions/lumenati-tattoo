import type { ReactNode } from "react";
import Link from "next/link";
import { Card, SectionTitle, Badge, Dot, StatCard } from "@/components/admin/ui";
import { fmt, payTypeLabel, type ArtistStatement } from "@/lib/admin/calc";
import type { RentInvoice } from "@/lib/admin/rent-context";

// Shared chrome for the role homes (POS-STARTER-3). Each role gets its own home
// component in this folder; page.tsx is just the router.

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-white/65">{sub}</p>
    </div>
  );
}

export function WeekTile({
  label,
  value,
  strong,
  delta,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Fractional change vs the prior week (0.12 = +12%); null/undefined hides it. */
  delta?: number | null;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className={`tnum ${strong ? "text-base font-bold text-brand" : "text-sm font-semibold"}`}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-white/55">{label}</div>
      {delta != null && (
        <div className={`tnum text-[11px] font-medium ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(Math.round(delta * 100))}% vs last wk
        </div>
      )}
    </div>
  );
}

// Time-of-day greeting, used by the personal (artist) home.
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// "3:30 PM" from an ISO timestamp.
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Local YYYY-MM-DD for "today" comparisons (matches the rest of the app).
export const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
export const isToday = (iso: string) => (iso || "").slice(0, 10) === todayLocal();

// Local YYYY-MM-DD for N days ago — same local anchoring as todayLocal so week
// windows don't slip a day for evening use in Denver (UTC-6/7).
export const daysAgoLocal = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-white/55">{children}</div>;
}

// Per-artist statement table. Shared by the owner + bookkeeper homes (both want
// the cross-artist money view; artists never see it). Renters show the card
// money the shop is holding for them; split artists show the wages waiting to
// go into Gusto. The salaried owner is already filtered out upstream.
export function StatementsTable({ statements }: { statements: ArtistStatement[] }) {
  return (
    <>
      <SectionTitle
        action={
          <Link href="/admin/payouts" className="text-xs font-medium text-brand">
            Handle pay →
          </Link>
        }
      >
        Artist statements
      </SectionTitle>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/55">
              <th className="px-4 py-2.5 font-medium">Artist</th>
              <th className="px-4 py-2.5 font-medium">Arrangement</th>
              <th className="px-4 py-2.5 text-right font-medium">Service</th>
              <th className="px-4 py-2.5 text-right font-medium">Shop keeps</th>
              <th className="px-4 py-2.5 text-right font-medium">Next step</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((st) => (
              <tr key={st.artist.id} className="border-b border-white/8 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Dot color={st.artist.color} />
                    <span className="font-medium">{st.artist.name}</span>
                    {st.artist.guest && <Badge>guest</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-white/70">{payTypeLabel(st.artist)}</td>
                <td className="tnum px-4 py-2.5 text-right">{fmt(st.grossService)}</td>
                <td className="tnum px-4 py-2.5 text-right text-white/70">{fmt(st.shopCut)}</td>
                <td className="tnum px-4 py-2.5 text-right font-semibold">
                  {st.net === 0 ? (
                    <span className="text-white/45">—</span>
                  ) : st.artist.pay.type === "booth_rent" ? (
                    <span className="text-amber-400">{fmt(st.passThroughOwed)} to hand over</span>
                  ) : (
                    <span className="text-sky-300">{fmt(st.gustoWages)} into Gusto</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 px-1 text-xs text-white/55">
        <span className="text-amber-400">Amber</span> = renter money the shop is holding (theirs,
        100%) · <span className="text-sky-300">blue</span> = wages to type into Gusto. Rent is
        billed on its own, never taken out of sales.
      </p>
    </>
  );
}

// Booth-rent panel. Shared by the owner + bookkeeper homes.
export function RentPanel({
  rent,
  outstanding,
  overdueCount,
}: {
  rent: RentInvoice[];
  outstanding: number;
  overdueCount: number;
}) {
  return (
    <>
      <SectionTitle
        action={
          <Link href="/admin/rent" className="text-xs font-medium text-brand">
            All rent →
          </Link>
        }
      >
        Booth rent
      </SectionTitle>
      <Card className="mb-4">
        <div className="divide-y divide-white/8">
          {rent.length === 0 && <Empty>No rent invoices.</Empty>}
          {rent.slice(0, 8).map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="truncate text-sm" title={r.title}>
                {r.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="tnum text-sm">{fmt(r.amountCents)}</span>
                {r.paid ? (
                  <Badge tone="good">paid</Badge>
                ) : r.overdue ? (
                  <Badge tone="bad">overdue</Badge>
                ) : (
                  <Badge tone="warn">due</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <StatCard
        label="Rent outstanding"
        value={fmt(outstanding)}
        tone={outstanding ? "warn" : "good"}
        sub={overdueCount ? `${overdueCount} overdue` : undefined}
      />
    </>
  );
}
