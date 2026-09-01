import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// Recent money in/out straight from Stripe (charges, fees, refunds, payouts) —
// the real ledger that, with the expenses table, replaces the QuickBooks export.
// Admins only, and ALWAYS the shop's own connected account: the platform account
// belongs to Lumenati, and its balance would show every shop's subscription
// charges and payouts to whoever asked. A shop with no linked account gets
// `linked: false` and an empty list, never the platform's numbers.
export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ configured: false, linked: false, rows: [] });
  }

  const { data: shop } = await ctx.db
    .from("shops")
    .select("stripe_account_id")
    .eq("id", ctx.shopId)
    .maybeSingle();
  const stripeAccount = (shop?.stripe_account_id as string | null) ?? null;
  if (!stripeAccount) {
    return NextResponse.json({ configured: true, linked: false, rows: [] });
  }

  try {
    const txns = await stripe.balanceTransactions.list({ limit: 40 }, { stripeAccount });
    const rows = txns.data.map((t) => ({
      id: t.id,
      date: new Date(t.created * 1000).toISOString().slice(0, 10),
      type: t.type, // charge | refund | payout | stripe_fee | ...
      description: t.description ?? "",
      amountCents: t.amount, // signed: + in, - out
      feeCents: t.fee,
      netCents: t.net,
    }));
    return NextResponse.json({ configured: true, linked: true, rows });
  } catch (e) {
    return NextResponse.json(
      { configured: true, linked: true, rows: [], error: e instanceof Error ? e.message : "Stripe error" },
      { status: 502 },
    );
  }
}
