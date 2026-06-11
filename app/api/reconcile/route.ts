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
  const [paymentsRes, salesRes, cashRes, sessionsRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_cents, tip_cents, status, kind, paid_at")
      .gte("created_at", fromIso),
    supabase.from("sales").select("service_cents, tip_cents, method, created_at").gte("created_at", fromIso),
    supabase.from("cash_entries").select("amount_cents, reconciled").gte("created_at", fromIso),
    supabase
      .from("cash_sessions")
      .select("opened_at, over_short_cents, closed_at")
      .not("closed_at", "is", null)
      .order("opened_at", { ascending: false })
      .limit(10),
  ]);

  const payments = paymentsRes.data ?? [];
  const paid = payments.filter((p) => p.status === "paid");
  const stripeRecorded = {
    paidCount: paid.length,
    paidCents: paid.reduce((a, p) => a + p.amount_cents + (p.tip_cents ?? 0), 0),
    pendingCount: payments.filter((p) => p.status === "pending").length,
  };

  const sales = salesRes.data ?? [];
  const squareRecorded = {
    count: sales.length,
    cardCents: sales
      .filter((s) => s.method !== "cash")
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
    cashCents: sales
      .filter((s) => s.method === "cash")
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
  };

  const cashEntries = cashRes.data ?? [];
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
        stripe.balanceTransactions.list({ limit: 100, created: { gte: Math.floor(new Date(fromIso).getTime() / 1000) } }),
      ]);
      const usdSum = (rows: { amount: number; currency: string }[]) =>
        rows.filter((r) => r.currency === "usd").reduce((a, r) => a + r.amount, 0);
      const charges = txns.data.filter((t) => t.type === "charge" || t.type === "payment");
      stripeView = {
        configured: true,
        availableCents: usdSum(bal.available),
        pendingCents: usdSum(bal.pending),
        chargesCents: charges.reduce((a, t) => a + t.amount, 0),
        feesCents: txns.data.reduce((a, t) => a + t.fee, 0),
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
  });
}
