import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// One reconciliation read for the /admin/reconcile page: Stripe's view of the
// money (balance + recent payouts) next to OUR records (payments rows, Square
// sales mirror, the cash log + drawer sessions) for the current month, so the
// books can be squared without QuickBooks. Owner / bookkeeper only.

const monthStart = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
};

// PostgREST caps any select at 1000 rows and these reads feed month SUMS —
// a busy month must not silently undercount (same paging as /api/pnl).
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data } = await build(start, start + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  // Cookie (web admin) or Bearer (the app). Owner/bookkeeper only either way,
  // and they see everything — no artist scoping needed on these reads.
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!["owner", "bookkeeper"].includes(me.role)) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }
  const supabase = me.db;

  const from = monthStart();
  const fromIso = `${from}T00:00:00Z`;

  // ── Our records (tolerate any missing optional tables) ──
  // On the Bearer path me.db is the service-role client, so every tenant read
  // must pin the caller's shop explicitly.
  type PaymentRow = {
    id: string;
    amount_cents: number;
    tip_cents: number | null;
    status: string;
    kind: string;
    paid_at: string | null;
    created_at: string;
    artist_id: string | null;
    client_id: string | null;
    stripe_payment_intent_id: string | null;
  };
  type SaleRow = { service_cents: number | null; tip_cents: number | null; method: string; created_at: string };
  type CashRow = { amount_cents: number; reconciled: boolean };

  const [payments, sales, cashEntries, sessionsRes] = await Promise.all([
    pageAll<PaymentRow>((a, b) =>
      supabase
        .from("payments")
        .select("id, amount_cents, tip_cents, status, kind, paid_at, created_at, artist_id, client_id, stripe_payment_intent_id")
        .eq("shop_id", me.shopId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .range(a, b),
    ),
    pageAll<SaleRow>((a, b) =>
      supabase
        .from("sales")
        .select("service_cents, tip_cents, method, created_at")
        .eq("shop_id", me.shopId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: true })
        .range(a, b),
    ),
    pageAll<CashRow>((a, b) =>
      supabase
        .from("cash_entries")
        .select("amount_cents, reconciled")
        .eq("shop_id", me.shopId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: true })
        .range(a, b),
    ),
    supabase
      .from("cash_sessions")
      .select("opened_at, over_short_cents, closed_at")
      .eq("shop_id", me.shopId)
      .not("closed_at", "is", null)
      .order("opened_at", { ascending: false })
      .limit(10),
  ]);

  const paid = payments.filter((p) => p.status === "paid");
  const stripeRecorded = {
    paidCount: paid.length,
    paidCents: paid.reduce((a, p) => a + p.amount_cents + (p.tip_cents ?? 0), 0),
    pendingCount: payments.filter((p) => p.status === "pending").length,
  };

  const squareRecorded = {
    count: sales.length,
    cardCents: sales
      .filter((s) => s.method !== "cash")
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
    cashCents: sales
      .filter((s) => s.method === "cash")
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
  };

  // Individual card payments for the refund list. Names resolved here so the
  // page doesn't need extra reads; refundable = paid + has a Stripe charge.
  const aIds = [...new Set(payments.map((p) => p.artist_id).filter(Boolean))] as string[];
  const cIds = [...new Set(payments.map((p) => p.client_id).filter(Boolean))] as string[];
  const [aRes, cRes] = await Promise.all([
    aIds.length
      ? supabase.from("artists").select("id, name").eq("shop_id", me.shopId).in("id", aIds)
      : Promise.resolve({ data: [] }),
    cIds.length
      ? supabase.from("clients").select("id, first_name, last_name").eq("shop_id", me.shopId).in("id", cIds)
      : Promise.resolve({ data: [] }),
  ]);
  const artistName = new Map(((aRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  const clientName = new Map(
    ((cRes.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((c) => [
      c.id,
      `${c.first_name} ${c.last_name}`.trim(),
    ]),
  );
  // The list stays bounded (newest 200) — only the SUMS need every row.
  const recent = payments
    .filter((p) => p.status !== "pending") // unpaid links live on their own banner
    .slice(0, 200)
    .map((p) => ({
      id: p.id as string,
      at: (p.paid_at ?? p.created_at) as string,
      kind: p.kind as string,
      status: p.status as string,
      amountCents: (p.amount_cents as number) + Math.max(0, Math.round((p.tip_cents as number | null) ?? 0)),
      artist: p.artist_id ? artistName.get(p.artist_id as string) ?? "" : "",
      client: p.client_id ? clientName.get(p.client_id as string) ?? "" : "",
      refundable: p.status === "paid" && !!p.stripe_payment_intent_id,
    }));

  const cash = {
    loggedCents: cashEntries.reduce((a, c) => a + c.amount_cents, 0),
    unreconciledCents: cashEntries.filter((c) => !c.reconciled).reduce((a, c) => a + c.amount_cents, 0),
    sessions: (sessionsRes.data ?? []).map((s) => ({
      openedAt: s.opened_at,
      overShortCents: s.over_short_cents,
    })),
  };

  // ── Stripe's view ──
  let stripeView: {
    configured: boolean;
    availableCents?: number;
    pendingCents?: number;
    payouts?: { id: string; date: string; amountCents: number; status: string }[];
    chargesCents?: number;
    feesCents?: number;
    error?: string;
  } = { configured: false };

  if (isStripeConfigured && stripe) {
    try {
      const [bal, payouts, txns] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.payouts.list({ limit: 10 }),
        // Stripe pages at 100; the month's charge/fee SUMS need every txn
        // (10k safety cap — far beyond a month of shop volume).
        stripe.balanceTransactions
          .list({ limit: 100, created: { gte: Math.floor(new Date(fromIso).getTime() / 1000) } })
          .autoPagingToArray({ limit: 10000 }),
      ]);
      const usdSum = (rows: { amount: number; currency: string }[]) =>
        rows.filter((r) => r.currency === "usd").reduce((a, r) => a + r.amount, 0);
      const charges = txns.filter((t) => t.type === "charge" || t.type === "payment");
      stripeView = {
        configured: true,
        availableCents: usdSum(bal.available),
        pendingCents: usdSum(bal.pending),
        chargesCents: charges.reduce((a, t) => a + t.amount, 0),
        feesCents: txns.reduce((a, t) => a + t.fee, 0),
        payouts: payouts.data.map((p) => ({
          id: p.id,
          date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
          amountCents: p.amount,
          status: p.status,
        })),
      };
    } catch (e) {
      stripeView = { configured: true, error: e instanceof Error ? e.message : "Stripe error" };
    }
  }

  return NextResponse.json({
    month: from.slice(0, 7),
    stripe: stripeView,
    recorded: stripeRecorded,
    square: squareRecorded,
    cash,
    recent,
  });
}
