import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { createPaymentLink } from "@/lib/stripe/payments";
import { connectChargeParams } from "@/lib/stripe/connect";

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
    bookingId?: string;
  };

  // An artist taking their own payment defaults to themselves; front desk/owner
  // may name the artist being paid.
  const artistId = b.artistId || me.artistId;
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return NextResponse.json({ error: "Amount must be at least $0.50." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // Record the pending payment first so the webhook always has a row to settle.
  const link = await createPaymentLink(admin, {
    bookingId: b.bookingId ?? null,
    artistId: artistId ?? null,
    kind: "ticket",
    amountCents,
  });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 502 });

  const split = await connectChargeParams(admin, artistId ?? null, "ticket", amountCents);

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        ...(split
          ? { application_fee_amount: split.applicationFeeCents, transfer_data: { destination: split.destination } }
          : {}),
        metadata: { payment_id: link.paymentId, pay_token: link.payToken, kind: "ticket" },
      },
      { idempotencyKey: `terminal_${link.payToken}` },
    );
    await admin.from("payments").update({ stripe_payment_intent_id: pi.id }).eq("id", link.paymentId);

    return NextResponse.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      paymentId: link.paymentId,
      split: !!split,
    });
  } catch (e) {
    await admin.from("payments").delete().eq("id", link.paymentId);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}
