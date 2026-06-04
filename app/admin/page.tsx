"use client";

import { useRole, ROLE_LABELS } from "@/lib/admin/role-context";
import { ARTISTS, SALES, RENT_CHARGES, CASH_LOG } from "@/lib/admin/mock-data";
import {
  shopSummary,
  statementFor,
  fmt,
  payTypeLabel,
} from "@/lib/admin/calc";
import {
  StatCard,
  Card,
  SectionTitle,
  Badge,
  Dot,
  MockBanner,
} from "@/components/admin/ui";
import Link from "next/link";

export default function Overview() {
  const { role, asArtistId } = useRole();

  if (role === "artist") return <ArtistOverview artistId={asArtistId} />;
  if (role === "frontdesk") return <FrontDeskOverview />;
  return <OwnerOverview bookkeeper={role === "bookkeeper"} />;
}

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-black/50">{sub}</p>
    </div>
  );
}

// ── Owner / Bookkeeper: the whole shop ──
function OwnerOverview({ bookkeeper }: { bookkeeper: boolean }) {
  const s = shopSummary(ARTISTS, SALES, RENT_CHARGES);
  const statements = ARTISTS.map((a) => statementFor(a, SALES, RENT_CHARGES)).sort(
    (x, y) => y.grossService - x.grossService,
  );
  const cashOutstanding = CASH_LOG.filter((c) => !c.reconciled).reduce(
    (a, c) => a + c.amountCents,
    0,
  );
  const rentOutstanding = RENT_CHARGES.filter((r) => !r.paid).reduce(
    (a, r) => a + r.amountCents,
    0,
  );

  return (
    <div>
      <PageHead
        title={bookkeeper ? "Books — May/Jun 2026" : "Shop Overview"}
        sub="Period to date · all figures are preview data"
      />
      <MockBanner source="Square & QuickBooks" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross sales" value={fmt(s.grossSales)} sub="service + tips" />
        <StatCard
          label="Shop revenue"
          value={fmt(s.shopRevenue)}
          sub={`${fmt(s.splitRevenue)} splits + ${fmt(s.rentRevenue)} rent`}
          accent
        />
        <StatCard
          label="Payouts owed"
          value={fmt(s.payoutsOwed)}
          sub="shop → artists"
          tone="warn"
        />
        <StatCard
          label="Cash to reconcile"
          value={fmt(cashOutstanding)}
          sub="in the drawer"
          tone={cashOutstanding > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle action={<Link href="/admin/payouts" className="text-xs font-medium text-brand">Settle up →</Link>}>
            Artist statements
          </SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/40">
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5 font-medium">Arrangement</th>
                  <th className="px-4 py-2.5 text-right font-medium">Service</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shop cut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((st) => (
                  <tr key={st.artist.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Dot color={st.artist.color} />
                        <span className="font-medium">{st.artist.name}</span>
                        {st.artist.guest && <Badge>guest</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-black/55">{payTypeLabel(st.artist)}</td>
                    <td className="tnum px-4 py-2.5 text-right">{fmt(st.grossService)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-black/55">{fmt(st.shopCut + st.rentOwed)}</td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold">
                      {st.net >= 0 ? (
                        <span className="text-emerald-600">{fmt(st.net)}</span>
                      ) : (
                        <span className="text-rose-600">({fmt(-st.net)})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 px-1 text-xs text-black/40">
            Net: <span className="text-emerald-600">green</span> = shop pays the artist ·{" "}
            <span className="text-rose-600">(red)</span> = artist owes the shop (cash cut + rent).
          </p>
        </div>

        <div>
          <SectionTitle>Rent status · Jun</SectionTitle>
          <Card className="mb-4">
            <div className="divide-y divide-black/5">
              {RENT_CHARGES.map((r) => {
                const a = ARTISTS.find((x) => x.id === r.artistId)!;
                return (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Dot color={a.color} />
                      <span className="text-sm">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-sm">{fmt(r.amountCents)}</span>
                      {r.paid ? <Badge tone="good">paid</Badge> : <Badge tone="warn">due</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <StatCard label="Rent outstanding" value={fmt(rentOutstanding)} tone={rentOutstanding ? "warn" : "good"} />
        </div>
      </div>
    </div>
  );
}

// ── Single artist: just their numbers ──
function ArtistOverview({ artistId }: { artistId: string }) {
  const artist = ARTISTS.find((a) => a.id === artistId)!;
  const st = statementFor(artist, SALES, RENT_CHARGES);
  const mine = SALES.filter((s) => s.artistId === artistId);

  return (
    <div>
      <PageHead title={`Hey, ${artist.name.split(" ")[0]}`} sub={payTypeLabel(artist)} />
      <MockBanner source="Square" />
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

      <div className="mt-5">
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
  );
}

// ── Front desk: daily ops, cash entry ──
function FrontDeskOverview() {
  const outstanding = CASH_LOG.filter((c) => !c.reconciled);
  return (
    <div>
      <PageHead title="Front Desk" sub="Today at the shop" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash unreconciled" value={fmt(outstanding.reduce((a, c) => a + c.amountCents, 0))} tone="warn" />
        <StatCard label="Entries today" value={String(CASH_LOG.filter((c) => c.date >= "2026-06-03").length)} />
        <StatCard label="Artists in" value={String(ARTISTS.filter((a) => a.active).length)} />
        <StatCard label="Walk-ins" value="open" sub="door's always open" />
      </div>
      <div className="mt-5">
        <SectionTitle action={<Link href="/admin/cash" className="text-xs font-medium text-brand">Open cash log →</Link>}>
          Needs reconciling
        </SectionTitle>
        <Card>
          <div className="divide-y divide-black/5">
            {outstanding.map((c) => {
              const a = ARTISTS.find((x) => x.id === c.artistId);
              return (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{c.note}</div>
                    <div className="text-xs text-black/45">
                      {c.date} · {a?.name ?? "Shop"} · {c.enteredBy}
                    </div>
                  </div>
                  <span className="tnum text-sm font-semibold">{fmt(c.amountCents)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
