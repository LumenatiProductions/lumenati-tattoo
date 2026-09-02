import { NextResponse } from "next/server";
import { renterSplit, isCashSource } from "@/lib/money/renter";
import { rentByPeriod } from "@/lib/rent/collected";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { toCsv } from "@/lib/books/export";
import { shopDay, shopDayEndUtc, ledgerShopDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Profit & Loss — the one screen that answers "did the shop make money":
// money in (from the canonical ledger) minus money out (expenses) = profit,
// bucketed by month / quarter / year. Admins only.
//
// Income is the SHOP's money, not gross tickets: an artist's share of their
// sales was never the shop's to keep, so it is deducted up front (same split
// math as Payouts/Reports, so every page reconciles to the penny). Sales with
// no current artist attached (historical Square guests, walk-in product sales)
// count fully as shop income — that is the deliberate call from the backfill.
// Owner draws are distributions, not expenses: shown below the line.
// Sales tax collected is the state's money, not income: shown as owed.

async function gate(req: Request): Promise<{ role: string | null; authed: boolean; shopId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("email", user.email!)
      .maybeSingle();
    return {
      role: profile?.role ?? null,
      authed: true,
      shopId: (profile?.shop_id as string | null) ?? null,
    };
  }
  const me = await userFromBearer(req);
  return me
    ? { role: me.role, authed: true, shopId: me.shopId }
    : { role: null, authed: false, shopId: null };
}

const isISODate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Pull every row in a window, paging past PostgREST's 1000-row cap — a P&L
// over five years of history must never silently truncate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;
async function pullAll<T>(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  table: string,
  cols: string,
  dateCol: string,
  from: string,
  toEnd: string,
  extra?: (q: AnyQuery) => AnyQuery,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    let q = db
      .from(table)
      .select(cols)
      .gte(dateCol, from)
      .lte(dateCol, toEnd)
      .order(dateCol, { ascending: true })
      .order("id") // stable tiebreaker so timestamp ties can't shift page boundaries
      .range(start, start + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Ids of ledger rows that have been reversed (shop-scoped, all time — the
// ledger_sales view excludes these and so must we).
async function pullAllReversals(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  shopId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("ledger")
      .select("reverses")
      .eq("shop_id", shopId)
      .not("reverses", "is", null)
      .order("id") // stable order so paging past the 1000-row cap can't drop/dupe rows
      .range(start, start + 999);
    if (error) throw new Error(`ledger: ${error.message}`);
    for (const r of data ?? []) if (r.reverses) out.add(r.reverses as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Group = "month" | "quarter" | "year";
const periodKey = (date: string, group: Group): string => {
  const y = date.slice(0, 4);
  if (group === "year") return y;
  const m = Number(date.slice(5, 7));
  if (group === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  return date.slice(0, 7);
};

type PnlPeriod = {
  key: string;
  grossCollected: number; // every dollar through the shop (service + tips)
  artistShare: number; // payroll artists' cut (their Gusto wages) — never the shop's money
  passThrough: number; // booth renters' CARD sales — moves through the shop's reader, never income
  renterCash: number; // booth renters' cash taken at the chair — never touched the shop; not in grossCollected
  splitIncome: number; // shop's % of split artists' service + ALL of the owner's sales
  unattributedIncome: number; // sales with no current artist -> all shop
  rentIncome: number; // booth rent collected (ledger)
  forfeitedDeposits: number;
  income: number; // splitIncome + unattributedIncome + rentIncome + forfeited
  expensesByCategory: Record<string, number>;
  expensesTotal: number;
  profit: number; // income - expensesTotal
  draws: number; // below the line
  taxCollected: number; // liability, not income
};

const blank = (key: string): PnlPeriod => ({
  key,
  grossCollected: 0,
  artistShare: 0,
  passThrough: 0,
  renterCash: 0,
  splitIncome: 0,
  unattributedIncome: 0,
  rentIncome: 0,
  forfeitedDeposits: 0,
  income: 0,
  expensesByCategory: {},
  expensesTotal: 0,
  profit: 0,
  draws: 0,
  taxCollected: 0,
});

export async function GET(req: Request) {
  const { role, authed, shopId } = await gate(req);
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !shopId || role !== "owner") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const url = new URL(req.url);
  const year = new Date().getUTCFullYear();
  const from = isISODate(url.searchParams.get("from")) ? url.searchParams.get("from")! : `${year}-01-01`;
  const to = isISODate(url.searchParams.get("to"))
    ? url.searchParams.get("to")!
    : new Date().toISOString().slice(0, 10);
  const g = url.searchParams.get("group");
  const group: Group = g === "quarter" || g === "year" ? g : "month";
  // Pull wide enough for BOTH occurred_at conventions (cash rows sit at UTC
  // midnight of their bare date; Stripe instants run to the shop's midnight),
  // then filter per row on the shop-calendar day it belongs to.
  const toEnd = shopDayEndUtc(to);
  const inRange = (day: string) => day >= from && day <= to;

  try {
    // Artists (ALL, not just active — a former split artist's history must
    // still compute with their split, or old months change under you).
    const { data: artistRows, error: artErr } = await db
      .from("artists")
      .select("id, pay_type, split_pct")
      .eq("shop_id", shopId);
    if (artErr) throw new Error(artErr.message);
    const payOf = new Map<string, { type: string; split: number }>();
    for (const a of artistRows ?? []) {
      payOf.set(a.id as string, {
        type: (a.pay_type as string) ?? "payroll_split",
        split: Number(a.split_pct) || 0,
      });
    }

    // ledger_sales (the view) doesn't expose shop_id, so sales are read from
    // the raw ledger with the shop filter and grouped here exactly like the
    // view: sale+tip rows, in, unreversed, keyed on external_id sans _svc/_tip.
    const [saleRows, reversalRows, ledgerExtras, expenses, draws, bookings] = await Promise.all([
      pullAll<{ id: string; occurred_at: string; kind: string; amount_cents: number; artist_id: string | null; external_id: string | null; source: string }>(
        db, "ledger", "id, occurred_at, kind, amount_cents, artist_id, external_id, source", "occurred_at", from, toEnd,
        (q) => q.eq("shop_id", shopId).in("kind", ["sale", "tip"]).eq("direction", "in")
          .is("reverses", null).not("external_id", "is", null)),
      // Reversing rows can land outside the window (a refund months later), so
      // they're pulled un-windowed to exclude their originals, like the view.
      pullAllReversals(db, shopId),
      // Tax lives in the raw ledger (reversals net out via `reverses` — tax
      // reversing rows keep their kind and carry direction 'out'). Rent comes
      // from the shared rent helper below, so P&L, Reports, Overview and the
      // Rent page all say the same number.
      pullAll<{ occurred_at: string; kind: string; direction: string; amount_cents: number; reverses: string | null }>(
        db, "ledger", "occurred_at, kind, direction, amount_cents, reverses", "occurred_at", from, toEnd,
        (q) => q.eq("shop_id", shopId).eq("kind", "tax")),
      pullAll<{ date: string; category: string; amount_cents: number }>(
        db, "expenses", "date, category, amount_cents", "date", from, to,
        (q) => q.eq("shop_id", shopId)),
      pullAll<{ date: string; amount_cents: number }>(
        db, "owner_draws", "date, amount_cents", "date", from, to,
        (q) => q.eq("shop_id", shopId)),
      pullAll<{ starts_at: string; deposit_cents: number | null; deposit_status: string | null }>(
        db, "bookings", "starts_at, deposit_cents, deposit_status", "starts_at", from, toEnd,
        (q) => q.eq("shop_id", shopId).eq("deposit_status", "forfeited")),
    ]);

    const grouped = new Map<string, { created_at: string; service_cents: number; tip_cents: number; artist_id: string | null; source: string }>();
    for (const r of saleRows) {
      if (reversalRows.has(r.id)) continue;
      const key = `${r.source}|${(r.external_id ?? "").replace(/_(svc|tip)$/, "")}`;
      let g = grouped.get(key);
      if (!g) grouped.set(key, (g = { created_at: r.occurred_at, service_cents: 0, tip_cents: 0, artist_id: null, source: r.source }));
      if (r.occurred_at < g.created_at) g.created_at = r.occurred_at;
      if (r.kind === "sale") g.service_cents += r.amount_cents;
      else g.tip_cents += r.amount_cents;
      if (r.artist_id && (!g.artist_id || r.artist_id > g.artist_id)) g.artist_id = r.artist_id;
    }
    const sales = [...grouped.values()];

    const periods = new Map<string, PnlPeriod>();
    const at = (date: string) => {
      const key = periodKey(date, group);
      let p = periods.get(key);
      if (!p) periods.set(key, (p = blank(key)));
      return p;
    };

    for (const s of sales) {
      const day = ledgerShopDay(s.created_at); // bucket on the shop's calendar
      if (!inRange(day)) continue;
      const p = at(day);
      const svc = s.service_cents ?? 0;
      const tip = s.tip_cents ?? 0;
      const pay = s.artist_id ? payOf.get(s.artist_id) : undefined;
      if (pay?.type === "booth_rent") {
        // The shared renter rule (lib/money/renter.ts): card = pass-through the
        // shop holds; cash never touched the shop, so it isn't "collected".
        const split = renterSplit(svc + tip, isCashSource(s.source));
        p.passThrough += split.passThrough;
        p.renterCash += split.renterCash;
        p.grossCollected += split.passThrough;
        continue;
      }
      p.grossCollected += svc + tip;
      if (pay?.type === "payroll_salary") {
        // The salaried owner: his tickets are entirely shop money.
        p.splitIncome += svc + tip;
      } else if (pay) {
        const shopCut = Math.round(svc * pay.split);
        p.splitIncome += shopCut;
        p.artistShare += svc - shopCut + tip; // wages paid via Gusto
      } else {
        p.unattributedIncome += svc + tip;
      }
    }

    for (const row of ledgerExtras) {
      const day = ledgerShopDay(row.occurred_at);
      if (!inRange(day)) continue;
      const p = at(day);
      const sign = row.direction === "in" ? 1 : -1; // reversing rows net out
      if (row.kind === "tax") p.taxCollected += sign * row.amount_cents;
    }

    // THE rent number (lib/rent/collected): paid invoices count in the month
    // they bill for, the same way the Rent page and Reports read them.
    const rent = await rentByPeriod(db, shopId, from.slice(0, 7), to.slice(0, 7));
    for (const [period, cell] of rent.byPeriod) {
      const day = `${period}-01`;
      if (!inRange(day)) continue;
      at(day).rentIncome += cell.collectedCents;
    }

    for (const b of bookings) {
      const day = shopDay(b.starts_at); // real instants, no bare-date convention
      if (!inRange(day)) continue;
      at(day).forfeitedDeposits += b.deposit_cents ?? 0;
    }
    for (const e of expenses) {
      const p = at(e.date);
      p.expensesByCategory[e.category] = (p.expensesByCategory[e.category] ?? 0) + e.amount_cents;
      p.expensesTotal += e.amount_cents;
    }
    for (const d of draws) at(d.date).draws += d.amount_cents;

    const list = [...periods.values()].sort((a, b) => a.key.localeCompare(b.key));
    for (const p of list) {
      p.income = p.splitIncome + p.unattributedIncome + p.rentIncome + p.forfeitedDeposits;
      p.profit = p.income - p.expensesTotal;
    }

    const totals = list.reduce((t, p) => {
      t.grossCollected += p.grossCollected;
      t.artistShare += p.artistShare;
      t.passThrough += p.passThrough;
      t.renterCash += p.renterCash;
      t.splitIncome += p.splitIncome;
      t.unattributedIncome += p.unattributedIncome;
      t.rentIncome += p.rentIncome;
      t.forfeitedDeposits += p.forfeitedDeposits;
      t.income += p.income;
      t.expensesTotal += p.expensesTotal;
      t.profit += p.profit;
      t.draws += p.draws;
      t.taxCollected += p.taxCollected;
      for (const [c, v] of Object.entries(p.expensesByCategory)) {
        t.expensesByCategory[c] = (t.expensesByCategory[c] ?? 0) + v;
      }
      return t;
    }, blank("total"));

    if (url.searchParams.get("format") === "csv") {
      const cats = Object.keys(totals.expensesByCategory).sort();
      const dollars = (c: number) => (c / 100).toFixed(2);
      const csv = toCsv(
        [
          "Period", "Gross collected", "Artist share (Gusto wages)", "Renter pass-through", "Renter cash (theirs, never collected)",
          "Shop ticket income", "Unattributed sales", "Booth rent", "Forfeited deposits", "Income",
          ...cats.map((c) => `Expenses: ${c}`), "Expenses total", "Profit", "Owner draws", "Sales tax collected",
        ],
        [...list, totals].map((p) => [
          p.key, dollars(p.grossCollected), dollars(p.artistShare), dollars(p.passThrough), dollars(p.renterCash),
          dollars(p.splitIncome),
          dollars(p.unattributedIncome), dollars(p.rentIncome), dollars(p.forfeitedDeposits), dollars(p.income),
          ...cats.map((c) => dollars(p.expensesByCategory[c] ?? 0)),
          dollars(p.expensesTotal), dollars(p.profit), dollars(p.draws), dollars(p.taxCollected),
        ]),
      );
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="lumenati-pnl-${from}-to-${to}.csv"`,
        },
      });
    }

    return NextResponse.json({ range: { from, to }, group, periods: list, totals });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "P&L failed." }, { status: 500 });
  }
}
