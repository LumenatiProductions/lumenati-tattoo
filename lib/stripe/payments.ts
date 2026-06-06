import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe, siteUrl } from "./client";
import { connectChargeParams } from "./connect";

// Shared payment helpers. SERVER ONLY. Used by /api/payments (mint a pay link),
// /pay/[token]/checkout (start the Stripe session), and /api/stripe/webhook
// (settle it). Connect (POS-STARTER-5) extends startCheckout with
// application_fee_amount + transfer_data; keep the shape stable so the kiosk and
// phone app reuse this rather than reinventing it.

export type PaymentKind = "deposit" | "ticket" | "other";

const KIND_LABEL: Record<PaymentKind, string> = {
  deposit: "Deposit",
  ticket: "Tattoo",
  other: "Payment",
};

// Opaque, URL-safe token for the public /pay/<token> route. Not guessable.
export const newPayToken = () => randomBytes(18).toString("base64url");

export type PaymentRow = {
  id: string;
  booking_id: string | null;
  client_id: string | null;
  artist_id: string | null;
  kind: PaymentKind;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  pay_token: string;
  created_at: string;
  paid_at: string | null;
};

type CreateArgs = {
  bookingId?: string | null;
  clientId?: string | null;
  artistId?: string | null;
  kind: PaymentKind;
  amountCents: number;
};

/**
 * Create a pending `payments` row + opaque token. Does NOT call Stripe — the
 * shareable link is `${siteUrl}/pay/<token>`, which never expires; the Stripe
 * Checkout session is minted on demand when the client taps Pay (startCheckout).
 */
export async function createPaymentLink(admin: SupabaseClient, args: CreateArgs) {
  if (!Number.isInteger(args.amountCents) || args.amountCents < 50) {
    return { ok: false as const, error: "Amount must be at least $0.50." };
  }
  const payToken = newPayToken();
  const { data: row, error } = await admin
    .from("payments")
    .insert({
      booking_id: args.bookingId ?? null,
      client_id: args.clientId ?? null,
      artist_id: args.artistId ?? null,
      kind: args.kind,
      amount_cents: args.amountCents,
      status: "pending",
      pay_token: payToken,
    })
    .select()
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, payToken, url: `${siteUrl}/pay/${payToken}`, paymentId: row.id };
}

/**
 * Mint (or reuse) a Stripe Checkout Session for a pending payment and return its
 * hosted URL. Idempotency is keyed on the token so repeated taps within the
 * window reuse one session rather than stacking charges. Called from the public
 * /pay/[token]/checkout route.
 */
export async function startCheckout(
  admin: SupabaseClient,
  row: PaymentRow,
  label?: string,
) {
  if (!stripe) return { ok: false as const, error: "Stripe is not configured." };
  if (row.status === "paid") return { ok: false as const, error: "Already paid." };

  const name = `Lumenati Tattoo · ${label?.trim() || KIND_LABEL[row.kind] || "Payment"}`;

  // Connect (POS-STARTER-5): a ticket for an onboarded artist becomes a
  // destination charge — shop keeps its cut as the application fee, the rest
  // transfers to the artist. Deposits and non-onboarded artists charge the
  // platform normally (no transfer).
  const split = await connectChargeParams(admin, row.artist_id, row.kind, row.amount_cents);
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { payment_id: row.id, pay_token: row.pay_token },
    ...(split
      ? {
          application_fee_amount: split.applicationFeeCents,
          transfer_data: { destination: split.destination },
        }
      : {}),
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${siteUrl}/pay/${row.pay_token}?status=success`,
        cancel_url: `${siteUrl}/pay/${row.pay_token}?status=canceled`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: row.currency || "usd",
              unit_amount: row.amount_cents,
              product_data: { name },
            },
          },
        ],
        metadata: { payment_id: row.id, pay_token: row.pay_token, kind: row.kind },
        payment_intent_data: paymentIntentData,
      },
      { idempotencyKey: `checkout_${row.pay_token}` },
    );
    await admin.from("payments").update({ stripe_session_id: session.id }).eq("id", row.id);
    return { ok: true as const, url: session.url };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Stripe error." };
  }
}

/**
 * Mark a payment paid and cascade to its booking. Idempotent: re-running on the
 * same already-paid row is a no-op. Called from the verified webhook with the
 * service-role client. A paid `deposit` moves the booking's deposit to `held`.
 */
export async function settlePayment(
  admin: SupabaseClient,
  match: { sessionId?: string; paymentIntentId?: string },
) {
  let q = admin.from("payments").select("*");
  if (match.sessionId) q = q.eq("stripe_session_id", match.sessionId);
  else if (match.paymentIntentId) q = q.eq("stripe_payment_intent_id", match.paymentIntentId);
  else return { settled: false, reason: "no match key" };

  const { data: row } = await q.maybeSingle<PaymentRow>();
  if (!row) return { settled: false, reason: "payment not found" };
  if (row.status === "paid") return { settled: false, reason: "already paid" };

  await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(match.paymentIntentId ? { stripe_payment_intent_id: match.paymentIntentId } : {}),
    })
    .eq("id", row.id);

  if (row.kind === "deposit" && row.booking_id) {
    await admin
      .from("bookings")
      .update({ deposit_status: "held", deposit_payment_id: match.paymentIntentId ?? row.id })
      .eq("id", row.booking_id)
      .eq("deposit_status", "none"); // don't clobber an applied/forfeited deposit
  }

  return { settled: true, paymentId: row.id, kind: row.kind };
}
