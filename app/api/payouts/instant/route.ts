import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Resolve which connected account this request acts on. Artists act on their own;
// an owner may pass ?artistId / {artistId}. Returns the Stripe account id or null.
async function resolveAccount(req: Request, bodyArtistId?: string) {
  const me = await userFromBearer(req);
  if (!me) return { error: "Not signed in", status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Service role not set", status: 500 as const };

  // Non-owners can only touch their own payout account.
  const artistId = me.role === "owner" ? bodyArtistId || me.artistId : me.artistId;
  if (!artistId) return { error: "No artist linked to this account", status: 400 as const };

  // Shop-pinned: an owner can only cash out artists in their own shop.
  const { data: a } = await admin
    .from("artists")
    .select("stripe_account_id, stripe_onboarded, name")
    .eq("id", artistId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!a?.stripe_account_id || !a.stripe_onboarded) {
    return { error: "Payouts aren't set up for this artist yet.", status: 409 as const };
  }
  return { accountId: a.stripe_account_id as string, name: a.name as string };
}

// GET — how much is available to cash out right now (instant-eligible balance).
export async function GET(req: Request) {
  if (!isStripeConfigured || !stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const r = await resolveAccount(req, new URL(req.url).searchParams.get("artistId") || undefined);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    const bal = await stripe.balance.retrieve({}, { stripeAccount: r.accountId });
    const usd = (rows: { amount: number; currency: string }[] | undefined) =>
      (rows ?? []).filter((x) => x.currency === "usd").reduce((a, x) => a + x.amount, 0);
    const instant = usd(bal.instant_available as { amount: number; currency: string }[] | undefined);
    const available = usd(bal.available);
    return NextResponse.json({ name: r.name, instantCents: instant, availableCents: available });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}

// POST — cash out now (instant payout to the artist's debit card). The artist
// pays Stripe's instant fee (~1.5%). Omit amount to take the whole instant balance.
export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { artistId?: string; amountCents?: number };
  const r = await resolveAccount(req, body.artistId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    const bal = await stripe.balance.retrieve({}, { stripeAccount: r.accountId });
    const instant = (bal.instant_available as { amount: number; currency: string }[] | undefined ?? [])
      .filter((x) => x.currency === "usd")
      .reduce((a, x) => a + x.amount, 0);

    const amount = body.amountCents ? Math.min(Math.round(body.amountCents), instant) : instant;
    if (amount < 50) {
      return NextResponse.json({ error: "Nothing available to cash out yet." }, { status: 400 });
    }

    const payout = await stripe.payouts.create(
      { amount, currency: "usd", method: "instant" },
      { stripeAccount: r.accountId },
    );
    return NextResponse.json({ ok: true, amountCents: amount, payoutId: payout.id, arrival: payout.arrival_date });
  } catch (e) {
    // Common: no eligible debit card linked, or account not instant-eligible.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}
