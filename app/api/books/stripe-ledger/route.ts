import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// Recent money in/out straight from Stripe (charges, fees, refunds, payouts) —
// the real ledger that, with the expenses table, replaces the QuickBooks export.
// Owner / bookkeeper only.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (!profile || !["owner", "bookkeeper"].includes(profile.role)) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }

  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ configured: false, rows: [] });
  }

  try {
    const txns = await stripe.balanceTransactions.list({ limit: 40 });
    const rows = txns.data.map((t) => ({
      id: t.id,
      date: new Date(t.created * 1000).toISOString().slice(0, 10),
      type: t.type, // charge | refund | payout | stripe_fee | ...
      description: t.description ?? "",
      amountCents: t.amount, // signed: + in, - out
      feeCents: t.fee,
      netCents: t.net,
    }));
    return NextResponse.json({ configured: true, rows });
  } catch (e) {
    return NextResponse.json(
      { configured: true, rows: [], error: e instanceof Error ? e.message : "Stripe error" },
      { status: 502 },
    );
  }
}
