import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { createPaymentLink } from "@/lib/stripe/payments";
import { connectChargeParams } from "@/lib/stripe/connect";
import { priceCart } from "@/lib/pos/merch";

export const dynamic = "force-dynamic";

// Mint a card-present PaymentIntent for an in-person Tap to Pay ticket. The split
// is the SAME destination charge as the web checkout (reuses connectChargeParams)
// — the app never recomputes it. The app collects + confirms on-device via the
// Terminal SDK; the webhook settles our `payments` row on payment_intent.succeeded.
export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const me = await userFromBearer(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    amountCents?: number;
    tipCents?: number;
    bookingId?: string;
    shop?: boolean;
    // Merch cart (shop sales only): [{id, qty}]. Priced server-side from
    // inventory — the client's amountCents is IGNORED when items are present.
    items?: { id?: string; qty?: number }[];
  };

  // Who the ticket is for. `shop: true` is an explicit shop sale (merch — no
  // split, money stays with the shop) and anyone can ring one up. Otherwise an
  // artist can ONLY take payments as themselves (their own split terms apply);
  // whatever artistId they send is ignored. Desk roles may name any artist.
  const artistId = b.shop === true ? null : me.role === "artist" ? me.artistId : b.artistId || null;

  const admin0 = createAdminClient();
  if (!admin0) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // A merch cart re-prices on the server and adds sales tax ON TOP of the
  // shelf prices. amount_cents stays the NET (products) figure — the ledger
  // sale row is net of tax, the tax gets its own row on settle (same shape as
  // the cash path), and the card is charged net + tax.
  // connectChargeParams looks the artist up by id alone, so the shop check has
  // to happen here — otherwise a caller could route a charge to another shop's
  // artist account.
  if (artistId) {
    const { data: a } = await admin0
      .from("artists")
      .select("id")
      .eq("id", artistId)
      .eq("shop_id", me.shopId)
      .maybeSingle();
    if (!a) return NextResponse.json({ error: "That artist isn't in your shop." }, { status: 400 });
  }

  let cart: Awaited<ReturnType<typeof priceCart>> | null = null;
  if (b.shop === true && Array.isArray(b.items) && b.items.length > 0) {
    cart = await priceCart(admin0, b.items, me.shopId);
    if (!cart.ok) return NextResponse.json({ error: cart.error }, { status: 400 });
  }
  const taxCents = cart?.ok ? cart.cart.taxCents : 0;

  const amountCents = cart?.ok ? cart.cart.subtotalCents : Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return NextResponse.json({ error: "Amount must be at least $0.50." }, { status: 400 });
  }
  // Fat-finger ceiling — same cap as the web pay-link mint. (Service only; the
  // tip can push the charged total above it, same as the web checkout.)
  if (amountCents > 2_000_000) {
    return NextResponse.json({ error: "Amount is over the $20,000 limit." }, { status: 400 });
  }
  // Client-chosen tip. Clamped 0..200% of service, exactly like the pay-link
  // checkout route, so it can only ever ADD to the pre-set service amount.
  const tipRaw = Math.round(Number(b.tipCents ?? 0));
  const tipCents = Number.isFinite(tipRaw) ? Math.min(Math.max(0, tipRaw), amountCents * 2) : 0;

  const admin = admin0;

  // A caller-supplied booking must live in the caller's shop — the settle path
  // mutates it (deposit status), so a foreign id can't be allowed to ride along.
  if (b.bookingId) {
    const { data: bk } = await admin
      .from("bookings")
      .select("id")
      .eq("id", b.bookingId)
      .eq("shop_id", me.shopId)
      .maybeSingle();
    if (!bk) return NextResponse.json({ error: "That booking isn't in your shop." }, { status: 400 });
  }

  // Record the pending payment first so the webhook always has a row to settle.
  // amount_cents is the SERVICE amount; the tip is stored separately and rides
  // the transfer to the artist untouched (fee is on service only, below).
  const link = await createPaymentLink(admin, {
    shopId: me.shopId,
    bookingId: b.bookingId ?? null,
    artistId: artistId ?? null,
    kind: "ticket",
    amountCents,
  });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 502 });
  if (tipCents > 0) {
    await admin.from("payments").update({ tip_cents: tipCents }).eq("id", link.paymentId).eq("shop_id", me.shopId);
  }
  if (cart?.ok) {
    // Tax + what sold ride the payment row so the webhook can settle the books
    // (tax ledger row) and take the stock down without trusting the client.
    await admin
      .from("payments")
      .update({ tax_cents: taxCents, items: cart.cart.lines })
      .eq("id", link.paymentId)
      .eq("shop_id", me.shopId);
  }

  // A ticket routes as a destination charge to the booth renter (their own sale)
  // or the shop's account (payroll / shop income). The client covers the card
  // fee as a SURCHARGE on the whole card charge (service + tip + tax); that
  // surcharge is the Stripe application fee. No onboarded account -> platform
  // charge, no surcharge (same rule as the web pay link).
  const split = await connectChargeParams(admin, {
    shopId: me.shopId,
    artistId: artistId ?? null,
    kind: "ticket",
    baseCents: amountCents + tipCents + taxCents,
  });
  const surcharge = split?.surchargeCents ?? 0;
  const totalCents = amountCents + tipCents + taxCents + surcharge;

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        ...(split
          ? { application_fee_amount: split.applicationFeeCents, transfer_data: { destination: split.destination } }
          : {}),
        metadata: {
          payment_id: link.paymentId,
          pay_token: link.payToken,
          kind: "ticket",
          tip_cents: String(tipCents),
          surcharge_cents: String(surcharge),
        },
      },
      { idempotencyKey: `terminal_${link.payToken}` },
    );
    await admin
      .from("payments")
      .update({
        stripe_payment_intent_id: pi.id,
        surcharge_cents: surcharge,
        app_fee_cents: split?.applicationFeeCents ?? 0,
      })
      .eq("id", link.paymentId)
      .eq("shop_id", me.shopId);

    return NextResponse.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      paymentId: link.paymentId,
      split: !!split,
    });
  } catch (e) {
    await admin.from("payments").delete().eq("id", link.paymentId).eq("shop_id", me.shopId);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}
