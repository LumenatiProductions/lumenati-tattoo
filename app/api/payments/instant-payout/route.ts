import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { instantPayoutFeeCents } from "@/lib/stripe/fees";
import { pushEvent } from "@/lib/push/send";

export const dynamic = "force-dynamic";

// Get-paid-early (instant payout) — the opt-in margin lever. A booth RENTER's
// settled ticket normally reaches their bank on Stripe's standard schedule; this
// pays it to their debit card NOW. Lumenati charges a service fee for the speed
// (INSTANT_PAYOUT in lib/stripe/fees) — reclaimed from the renter's balance by
// reversing that slice of the sale's transfer back to the platform, then the
// rest is paid out instantly. This is a SERVICE fee, not a surcharge, so it
// isn't bound by the surcharge cap. Renter-only: payroll artists are paid by
// Gusto and never have a Stripe balance to pull early.
//
// Cookie-or-Bearer (resolveStaff): the OWNER drives it from /admin/payouts (any
// renter in the shop); an ARTIST drives it from their app Pay screen, scoped to
// their OWN tickets only. Bearer callers get the service-role client, so every
// query is explicitly shop- (and for artists, self-) scoped.

// List the renter tickets that could be paid out early right now: settled, not
// already paid out, routed to a booth renter with a linked bank. An owner sees
// every renter's; an artist sees only their own.
export async function GET(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ configured: false, eligible: [] });
  }
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { role, shopId, artistId } = ctx;
  // An artist can only ever see their own; they must be pinned to a chair.
  if (role === "artist" && !artistId) return NextResponse.json({ configured: true, eligible: [] });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // Onboarded booth renters are the only artists who can be paid early; an
  // artist caller is narrowed to just themselves.
  let rq = admin
    .from("artists")
    .select("id, name")
    .eq("shop_id", shopId)
    .eq("pay_type", "booth_rent")
    .eq("stripe_onboarded", true);
  if (role === "artist") rq = rq.eq("id", artistId!);
  const { data: renters } = await rq;
  const renterMap = new Map((renters ?? []).map((r) => [r.id as string, r.name as string]));
  if (renterMap.size === 0) return NextResponse.json({ configured: true, eligible: [] });

  const { data: rows } = await admin
    .from("payments")
    .select("id, artist_id, amount_cents, tip_cents, paid_at")
    .eq("shop_id", shopId)
    .eq("status", "paid")
    .in("kind", ["ticket", "other"])
    .in("artist_id", [...renterMap.keys()])
    .is("instant_payout_id", null)
    .not("stripe_payment_intent_id", "is", null)
    .order("paid_at", { ascending: false })
    .limit(25);

  const eligible = (rows ?? [])
    .filter((r) => r.artist_id && renterMap.has(r.artist_id))
    .map((r) => {
      const transferred = r.amount_cents + Math.max(0, Math.round(r.tip_cents ?? 0));
      return {
        paymentId: r.id as string,
        artistName: renterMap.get(r.artist_id as string)!,
        amountCents: transferred,
        feeCents: instantPayoutFeeCents(transferred),
        paidAt: r.paid_at as string | null,
      };
    })
    .filter((r) => r.amountCents - r.feeCents >= 50);

  return NextResponse.json({ configured: true, eligible });
}

export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { role, shopId, artistId } = ctx;
  if (role === "artist" && !artistId) {
    return NextResponse.json({ error: "No chair linked to your account." }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as { paymentId?: string };
  if (!b.paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // Pinned to the caller's shop — a foreign payment id is just "not found". An
  // artist is further pinned to their own chair, so they can only pay out their
  // own sales (mirrors the RLS wall for Bearer callers).
  let pq = admin
    .from("payments")
    .select("id, kind, status, artist_id, amount_cents, tip_cents, stripe_payment_intent_id, instant_payout_id")
    .eq("id", b.paymentId)
    .eq("shop_id", shopId);
  if (role === "artist") pq = pq.eq("artist_id", artistId!);
  const { data: row } = await pq
    .maybeSingle<{
      id: string;
      kind: string;
      status: string;
      artist_id: string | null;
      amount_cents: number;
      tip_cents: number | null;
      stripe_payment_intent_id: string | null;
      instant_payout_id: string | null;
    }>();
  if (!row) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (row.instant_payout_id) return NextResponse.json({ ok: true, alreadyPaidOut: true });
  if (row.status !== "paid") {
    return NextResponse.json({ error: "Only a settled payment can be paid out early." }, { status: 400 });
  }
  if (row.kind !== "ticket" && row.kind !== "other") {
    return NextResponse.json({ error: "Only a ticket can be paid out early." }, { status: 400 });
  }
  if (!row.artist_id || !row.stripe_payment_intent_id) {
    return NextResponse.json({ error: "This payment isn't eligible for early payout." }, { status: 400 });
  }

  // The renter must be a booth renter with an onboarded account.
  const { data: artist } = await admin
    .from("artists")
    .select("name, pay_type, stripe_account_id, stripe_onboarded")
    .eq("id", row.artist_id)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!artist || artist.pay_type !== "booth_rent" || !artist.stripe_onboarded || !artist.stripe_account_id) {
    return NextResponse.json(
      { error: "Get paid early is for booth renters with a linked bank." },
      { status: 400 },
    );
  }
  const acct = artist.stripe_account_id as string;

  // The transfer created by the sale's destination charge is what carried the
  // renter their money (service + tip). Reverse Lumenati's fee out of it, then
  // instant-payout the remainder to their debit card.
  const transferred = row.amount_cents + Math.max(0, Math.round(row.tip_cents ?? 0));
  const fee = instantPayoutFeeCents(transferred);
  const payoutAmount = transferred - fee;
  if (payoutAmount < 50) {
    return NextResponse.json({ error: "Too small to pay out early." }, { status: 400 });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id, {
      expand: ["latest_charge"],
    });
    const charge = pi.latest_charge;
    const transferId =
      charge && typeof charge !== "string" ? (charge.transfer as string | null) : null;
    if (!transferId) {
      return NextResponse.json(
        { error: "This sale didn't route to the renter, so it can't be paid out early." },
        { status: 400 },
      );
    }

    // Reclaim Lumenati's service fee from the renter's balance (idempotent key).
    await stripe.transfers.createReversal(
      transferId,
      { amount: fee, metadata: { payment_id: row.id, reason: "instant_payout_fee" } },
      { idempotencyKey: `ipfee_${row.id}` },
    );

    // Pay the rest to the renter's default debit card, right now.
    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: "usd",
        method: "instant",
        metadata: { payment_id: row.id },
      },
      { stripeAccount: acct, idempotencyKey: `ipout_${row.id}` },
    );

    // Record the early payout on the payment. The fee is Lumenati's (it left the
    // renter's balance to the platform), NOT the shop's income, so it's tracked
    // here on the payment row and deliberately NOT written to the shop ledger —
    // writing an 'in' row there would inflate the shop's books.
    await admin
      .from("payments")
      .update({ instant_payout_id: payout.id, instant_fee_cents: fee })
      .eq("id", row.id)
      .eq("shop_id", shopId);

    const usd = (payoutAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    await pushEvent(
      admin,
      { artistId: row.artist_id, shopId },
      "Paid early",
      `${usd} is on the way to your debit card now.`,
    );

    return NextResponse.json({ ok: true, payoutCents: payoutAmount, feeCents: fee });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe payout failed." },
      { status: 502 },
    );
  }
}
