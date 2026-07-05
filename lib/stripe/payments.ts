import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe, siteUrl } from "./client";
import { connectChargeParams } from "./connect";
import { pushEvent } from "@/lib/push/send";
import { decrementStock, type CartLine } from "@/lib/pos/merch";

// Shared payment helpers. SERVER ONLY. Used by /api/payments (mint a pay link),
// /pay/[token]/checkout (start the Stripe session), and /api/stripe/webhook
// (settle it). Connect (POS-STARTER-5) extends startCheckout with
// application_fee_amount + transfer_data; keep the shape stable so the kiosk and
// phone app reuse this rather than reinventing it.

export type PaymentKind = "deposit" | "ticket" | "other" | "rent";

const KIND_LABEL: Record<PaymentKind, string> = {
  deposit: "Deposit",
  ticket: "Tattoo",
  other: "Payment",
  rent: "Booth rent",
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
  /** Client-chosen tip (tips-schema.sql); 0 until the payer picks one. Goes to the artist in full. */
  tip_cents?: number | null;
  /** Merch sale extras (2026-07-05-merch-pos.sql): sales tax charged on top of
   *  amount_cents (which stays net), and the cart that sold, for stock. */
  tax_cents?: number | null;
  items?: CartLine[] | null;
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
  const tip = Math.max(0, Math.round(row.tip_cents ?? 0));

  // Connect (POS-STARTER-5): a ticket for an onboarded artist becomes a
  // destination charge — shop keeps its cut as the application fee, the rest
  // transfers to the artist. Deposits and non-onboarded artists charge the
  // platform normally (no transfer). The fee is computed on the SERVICE amount
  // only, so the tip rides the transfer to the artist untouched.
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
          // A chosen tip shows as its own line on Stripe's page + receipt.
          ...(tip > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: row.currency || "usd",
                    unit_amount: tip,
                    product_data: { name: "Tip for your artist" },
                  },
                },
              ]
            : []),
        ],
        metadata: { payment_id: row.id, pay_token: row.pay_token, kind: row.kind, tip_cents: String(tip) },
        payment_intent_data: paymentIntentData,
      },
      // Tip is part of the key: changing the tip mints a fresh session instead
      // of reusing one priced at the old total.
      { idempotencyKey: `checkout_${row.pay_token}_t${tip}` },
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

  const paidAt = new Date().toISOString();
  await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: paidAt,
      ...(match.paymentIntentId ? { stripe_payment_intent_id: match.paymentIntentId } : {}),
    })
    .eq("id", row.id);

  // ── Dual-write to the canonical ledger (money source of truth, staged rollout).
  // Idempotent per payment via stable external ids + unique(source, external_id)
  // (ON CONFLICT DO NOTHING), so Stripe webhook retries never double-count.
  // Errors ignored — a settled payment must never bounce on a books write.
  {
    const tipCents = Math.max(0, Math.round(row.tip_cents ?? 0));
    const taxCents = Math.max(0, Math.round(row.tax_cents ?? 0));
    const base = {
      source: "stripe",
      direction: "in",
      currency: row.currency || "usd",
      artist_id: row.artist_id,
      client_id: row.client_id,
      booking_id: row.booking_id,
      occurred_at: paidAt,
      created_by: "stripe",
    };
    const ledgerRows: Record<string, unknown>[] = [];
    if (row.kind === "deposit") {
      ledgerRows.push({ ...base, kind: "deposit", amount_cents: row.amount_cents, external_id: `pay_${row.id}_dep` });
    } else if (row.kind === "rent") {
      ledgerRows.push({ ...base, kind: "rent", amount_cents: row.amount_cents, external_id: `pay_${row.id}_rent` });
    } else {
      ledgerRows.push({ ...base, kind: "sale", amount_cents: row.amount_cents, external_id: `pay_${row.id}_svc` });
      if (tipCents > 0) ledgerRows.push({ ...base, kind: "tip", amount_cents: tipCents, external_id: `pay_${row.id}_tip` });
      // Card merch: the sale row above is already NET (products only) — the
      // sales tax charged on top books as its own row, same as the cash path.
      if (taxCents > 0) {
        ledgerRows.push({ ...base, kind: "tax", amount_cents: taxCents, external_id: `pay_${row.id}_tax`, note: "sales tax collected" });
      }
    }
    await admin.from("ledger").upsert(ledgerRows, { onConflict: "source,external_id", ignoreDuplicates: true });
  }

  if (row.kind === "deposit" && row.booking_id) {
    await admin
      .from("bookings")
      .update({ deposit_status: "held", deposit_payment_id: match.paymentIntentId ?? row.id })
      .eq("id", row.booking_id)
      .eq("deposit_status", "none"); // don't clobber an applied/forfeited deposit
  }

  if (row.kind === "rent") {
    // In-house rent invoice paid (rent-invoices-schema.sql). Errors ignored —
    // the table may not be applied yet and a paid payment must never bounce.
    await admin
      .from("rent_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("payment_id", row.id)
      .eq("status", "pending");
  }

  // Feed the books. Every dashboard (earnings, statements, Payouts, Reports)
  // reads `sales`, which until now only Square wrote — so a Tap to Pay or
  // pay-link charge was invisible to the books, and the Square cutover would
  // dark out the money layer entirely. A paid ticket/misc payment IS a sale, so
  // mirror it here. Deposits (a hold) and rent (shop income, not service
  // revenue) are excluded. Deterministic id (lum_<payment id>) keeps this
  // idempotent on Stripe's webhook retries and can't collide with Square ids.
  // Errors ignored — a settled payment must never bounce on a books write.
  if (row.kind === "ticket" || row.kind === "other") {
    await admin.from("sales").upsert(
      {
        id: `lum_${row.id}`,
        created_at: paidAt,
        service_cents: row.amount_cents,
        tip_cents: Math.max(0, Math.round(row.tip_cents ?? 0)),
        method: "card", // Stripe is always card (Tap to Pay is card-present)
        artist_id: row.artist_id,
        status: "paid",
        synced_at: paidAt,
      },
      { onConflict: "id" },
    );
  }

  // A settled merch cart takes its stock down (idempotent via the paid-status
  // guard above — a webhook retry never reaches here twice). Best-effort, like
  // every books write: the charge already happened.
  if (Array.isArray(row.items) && row.items.length > 0) {
    await decrementStock(admin, row.items, "stripe");
  }

  // Phone ping for money landing — owner always, plus the artist it belongs to.
  const total =
    row.amount_cents + Math.max(0, Math.round(row.tip_cents ?? 0)) + Math.max(0, Math.round(row.tax_cents ?? 0));
  const usd = (total / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  await pushEvent(
    admin,
    { roles: ["owner"], artistId: row.artist_id },
    "Payment received",
    `${usd} ${KIND_LABEL[row.kind] ?? row.kind}${row.tip_cents ? " (incl. tip)" : ""}`,
  );

  return { settled: true, paymentId: row.id, kind: row.kind };
}
