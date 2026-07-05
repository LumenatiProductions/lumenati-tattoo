import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { toCsv } from "@/lib/books/export";

export const dynamic = "force-dynamic";

// Profit & Loss — the one screen that answers "did the shop make money":
// money in (from the canonical ledger) minus money out (expenses) = profit,
// bucketed by month / quarter / year. Owner + bookkeeper only.
//
// Income is the SHOP's money, not gross tickets: an artist's share of their
// sales was never the shop's to keep, so it is deducted up front (same split
// math as Payouts/Reports, so every page reconciles to the penny). Sales with
// no current artist attached (historical Square guests, walk-in product sales)
// count fully as shop income — that is the deliberate call from the backfill.
// Owner draws are distributions, not expenses: shown below the line.
// Sales tax collected is the state's money, not income: shown as owed.

async function gate(req: Request): Promise<{ role: string | null; authed: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", user.email!)
      .maybeSingle();
    return { role: profile?.role ?? null, authed: true };
  }
  const me = await userFromBearer(req);
  return me ? { role: me.role, authed: true } : { role: null, authed: false };
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
      .range(start, start + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
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
  artistShare: number; // the artists' cut — never the shop's money
  splitIncome: number; // shop's % of attributed artists' service
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
  const { role, authed } = await gate(req);
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !["owner", "bookkeeper"].includes(role)) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
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
  const toEnd = `${to}T23:59:59.999`;

  try {
    // Artists (ALL, not just active — a former split artist's history must
    // still compute with their split, or old months change under you).
    const { data: artistRows, error: artErr } = await db
      .from("artists")
      .select("id, pay_type, split_pct");
    if (artErr) throw new Error(artErr.message);
    const splitOf = new Map<string, number>();
    for (const a of artistRows ?? []) {
      splitOf.set(a.id as string, a.pay_type === "rent" ? 0 : Number(a.split_pct) || 0);
    }

    const [sales, ledgerExtras, expenses, draws, bookings] = await Promise.all([
      pullAll<{ created_at: string; service_cents: number; tip_cents: number; artist_id: string | null }>(
        db, "ledger_sales", "created_at, service_cents, tip_cents, artist_id", "created_at", from, toEnd),
      // Rent + tax live in the raw ledger (reversals net out via `reverses`).
      pullAll<{ occurred_at: string; kind: string; direction: string; amount_cents: number; reverses: string | null }>(
        db, "ledger", "occurred_at, kind, direction, amount_cents, reverses", "occurred_at", from, toEnd,
        (q) => q.in("kind", ["rent", "tax"])),
      pullAll<{ date: string; category: string; amount_cents: number }>(
        db, "expenses", "date, category, amount_cents", "date", from, to),
      pullAll<{ date: string; amount_cents: number }>(
        db, "owner_draws", "date, amount_cents", "date", from, to),
      pullAll<{ starts_at: string; deposit_cents: number | null; deposit_status: string | null }>(
        db, "bookings", "starts_at, deposit_cents, deposit_status", "starts_at", from, toEnd,
        (q) => q.eq("deposit_status", "forfeited")),
    ]);

    const periods = new Map<string, PnlPeriod>();
    const at = (date: string) => {
      const key = periodKey(date, group);
      let p = periods.get(key);
      if (!p) periods.set(key, (p = blank(key)));
      return p;
    };

    for (const s of sales) {
      const p = at(s.created_at.slice(0, 10));
      const svc = s.service_cents ?? 0;
      const tip = s.tip_cents ?? 0;
      p.grossCollected += svc + tip;
      if (s.artist_id && splitOf.has(s.artist_id)) {
        const split = splitOf.get(s.artist_id)!;
        const shopCut = Math.round(svc * split);
        p.splitIncome += shopCut;
        p.artistShare += svc - shopCut + tip; // artist keeps their % + all tips
      } else {
        p.unattributedIncome += svc + tip;
      }
    }

    for (const row of ledgerExtras) {
      const p = at(row.occurred_at.slice(0, 10));
      const sign = row.direction === "in" ? 1 : -1; // reversing rows net out
      if (row.kind === "rent") p.rentIncome += sign * row.amount_cents;
      else if (row.kind === "tax") p.taxCollected += sign * row.amount_cents;
    }

    for (const b of bookings) at(b.starts_at.slice(0, 10)).forfeitedDeposits += b.deposit_cents ?? 0;
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
          "Period", "Gross collected", "Artist share", "Shop split income", "Unattributed sales",
          "Booth rent", "Forfeited deposits", "Income",
          ...cats.map((c) => `Expenses: ${c}`), "Expenses total", "Profit", "Owner draws", "Sales tax collected",
        ],
        [...list, totals].map((p) => [
          p.key, dollars(p.grossCollected), dollars(p.artistShare), dollars(p.splitIncome),
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
