"use client";

import { useRole, ROLE_LABELS } from "@/lib/admin/role-context";
import { CASH_LOG } from "@/lib/admin/mock-data";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRent } from "@/lib/admin/rent-context";
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
  const { sales, real } = useSales();
  const { artists } = useArtists();
  // Rent is its own thing (Square invoices), separate from the per-artist split.
  const { invoices: rent, outstandingCents: rentOutstanding, collectedCents: rentCollected, overdue } = useRent();
  const s = shopSummary(artists, sales, []);
  const statements = artists.map((a) => statementFor(a, sales, [])).sort(
    (x, y) => y.grossService - x.grossService,
  );
  const cashOutstanding = CASH_LOG.filter((c) => !c.reconciled).reduce(
    (a, c) => a + c.amountCents,
    0,
  );
  // Last 7 days — the same numbers as the Monday email digest.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const wk = sales.filter((s2) => s2.date >= weekAgo);
  const wkService = wk.reduce((a, s2) => a + s2.serviceCents, 0);
  const wkTips = wk.reduce((a, s2) => a + s2.tipCents, 0);
  const wkCard = wk.filter((s2) => s2.method !== "cash").reduce((a, s2) => a + s2.serviceCents + s2.tipCents, 0);
  const wkCash = wk.filter((s2) => s2.method === "cash").reduce((a, s2) => a + s2.serviceCents + s2.tipCents, 0);

  return (
    <div>
      <PageHead
        title={bookkeeper ? "Books" : "Shop Overview"}
        sub={real ? "Live from Square" : "Period to date · all figures are preview data"}
      />
      {!real && <MockBanner source="Square & QuickBooks" />}

      <SectionTitle>This week <span className="font-normal text-black/35">· last 7 days, same as your Monday email</span></SectionTitle>
      <Card className="mb-5">
        <div className="grid grid-cols-3 divide-x divide-y divide-black/5 sm:grid-cols-6 sm:divide-y-0">
          <WeekTile label="Gross" value={fmt(wkService + wkTips)} strong />
          <WeekTile label="Service" value={fmt(wkService)} />
          <WeekTile label="Tips" value={fmt(wkTips)} />
          <WeekTile label="Card" value={fmt(wkCard)} />
          <WeekTile label="Cash" value={fmt(wkCash)} />
          <WeekTile label="Tickets" value={String(wk.length)} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross sales" value={fmt(s.grossSales)} sub="service + tips" />
        <StatCard
          label="Shop revenue"
          value={fmt(s.splitRevenue + rentCollected)}
          sub={`${fmt(s.splitRevenue)} splits + ${fmt(rentCollected)} rent`}
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
          <SectionTitle action={<Link href="/admin/rent" className="text-xs font-medium text-brand">All rent →</Link>}>
            Booth rent
          </SectionTitle>
          <Card className="mb-4">
            <div className="divide-y divide-black/5">
              {rent.length === 0 && <div className="px-4 py-5 text-center text-xs text-black/40">No rent invoices.</div>}
              {rent.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="truncate text-sm" title={r.title}>{r.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-sm">{fmt(r.amountCents)}</span>
                    {r.paid ? <Badge tone="good">paid</Badge> : r.overdue ? <Badge tone="bad">overdue</Badge> : <Badge tone="warn">due</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <StatCard label="Rent outstanding" value={fmt(rentOutstanding)} tone={rentOutstanding ? "warn" : "good"} sub={overdue.length ? `${overdue.length} overdue` : undefined} />
        </div>
      </div>
    </div>
  );
}

// ── Single artist: just their numbers ──
function ArtistOverview({ artistId }: { artistId: string }) {
  const { sales, real } = useSales();
  const { artists } = useArtists();
  const artist = artists.find((a) => a.id === artistId);
  if (!artist) return null;
  const st = statementFor(artist, sales, []);
  const mine = sales.filter((s) => s.artistId === artistId);

  return (
    <div>
      <PageHead title={`Hey, ${artist.name.split(" ")[0]}`} sub={payTypeLabel(artist)} />
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
  const { artists } = useArtists();
  const outstanding = CASH_LOG.filter((c) => !c.reconciled);
  return (
    <div>
      <PageHead title="Front Desk" sub="Today at the shop" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash unreconciled" value={fmt(outstanding.reduce((a, c) => a + c.amountCents, 0))} tone="warn" />
        <StatCard label="Entries today" value={String(CASH_LOG.filter((c) => c.date >= "2026-06-03").length)} />
        <StatCard label="Artists in" value={String(artists.filter((a) => a.active).length)} />
        <StatCard label="Walk-ins" value="open" sub="door's always open" />
      </div>
      <div className="mt-5">
        <SectionTitle action={<Link href="/admin/cash" className="text-xs font-medium text-brand">Open cash log →</Link>}>
          Needs reconciling
        </SectionTitle>
        <Card>
          <div className="divide-y divide-black/5">
            {outstanding.map((c) => {
              const a = artists.find((x) => x.id === c.artistId);
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

function WeekTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className={`tnum ${strong ? "text-base font-bold text-brand" : "text-sm font-semibold"}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-black/40">{label}</div>
    </div>
  );
}
