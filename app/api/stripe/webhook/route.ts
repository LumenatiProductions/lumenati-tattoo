import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePayment } from "@/lib/stripe/payments";
import { applySubscription } from "@/lib/stripe/billing";
import { reverseRefundBooks, type RefundablePayment } from "@/lib/stripe/refund-books";
import { pushEvent } from "@/lib/push/send";
import type Stripe from "stripe";

// Look up our payment row for a Stripe payment intent. Returns null for
// charges that aren't a client paying a shop (e.g. subscription billing).
async function paymentByIntent(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  pi: string | Stripe.PaymentIntent | null,
): Promise<RefundablePayment | null> {
  const piId = typeof pi === "string" ? pi : pi?.id;
  if (!piId) return null;
  const { data } = await admin
    .from("payments")
    .select("id, kind, status, booking_id, artist_id, shop_id, amount_cents, tip_cents")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle<RefundablePayment>();
  return data ?? null;
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const dynamic = "force-dynamic";

// Stripe webhook. THE source of truth for payment state (a client closing the tab
// after paying must still settle). We verify the signature against
// STRIPE_WEBHOOK_SECRET and write via the service-role client (bypasses RLS).
// Handlers are idempotent — Stripe retries, and settlePayment no-ops on an
// already-paid row.
//
// Local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
// prints the signing secret to put in STRIPE_WEBHOOK_SECRET.

export async function POST(req: Request) {
  if (!stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not set" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Signature verification needs the RAW body, not the parsed JSON.
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { error: `Signature check failed: ${e instanceof Error ? e.message : "bad signature"}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not configured" }, { status: 500 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as {
          id: string;
          mode: string;
          subscription: string | Stripe.Subscription | null;
          payment_intent: string | null;
          payment_status: string;
        };
        // A subscription checkout is the SHOP paying Lumenati (billing), not a
        // client paying the shop — write billing state, never the sales ledger.
        if (s.mode === "subscription") {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await applySubscription(admin, sub);
          }
          break;
        }
        // Only settle a session that actually paid.
        if (s.payment_status === "paid") {
          await settlePayment(admin, {
            sessionId: s.id,
            paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : undefined,
          });
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as { id: string; payment_intent: string | null };
        await settlePayment(admin, {
          sessionId: s.id,
          paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : undefined,
        });
        break;
      }
      case "payment_intent.succeeded": {
        // In-person Tap to Pay (POS 6c): no Checkout session, settle by the PI id.
        const pi = event.data.object as { id: string };
        await settlePayment(admin, { paymentIntentId: pi.id });
        break;
      }
      case "charge.refunded": {
        // A refund issued outside the app (the Stripe dashboard) must still
        // land in the books. The in-app refund path writes the books before
        // this event arrives, so it no-ops here (payment already `refunded`).
        const ch = event.data.object as Stripe.Charge;
        const row = await paymentByIntent(admin, ch.payment_intent);
        if (!row || row.status !== "paid") break;
        if (ch.refunded) {
          await reverseRefundBooks(admin, row);
        } else {
          // Partial refund: the books have no partial concept, so leave them —
          // but the owner has to know Stripe and the books now disagree.
          await pushEvent(
            admin,
            { roles: ["owner"], artistId: row.artist_id, shopId: row.shop_id },
            "Partial refund in Stripe",
            `${usd(ch.amount_refunded ?? 0)} was refunded in the Stripe dashboard. The books still count this payment in full — finish the refund there, or it stays on the books.`,
          );
        }
        break;
      }
      case "charge.dispute.created": {
        // A client's bank clawing money back. No automatic books change (that
        // accounting is a Scott decision) — but the owner must hear about it
        // the moment it happens, because disputes have a response deadline.
        const d = event.data.object as Stripe.Dispute;
        const row = await paymentByIntent(admin, d.payment_intent);
        if (!row) break;
        await pushEvent(
          admin,
          { roles: ["owner"], artistId: row.artist_id, shopId: row.shop_id },
          "Payment disputed",
          `A client's bank is disputing ${usd(d.amount)}. Respond in the Stripe dashboard before the deadline or the money goes back automatically.`,
        );
        break;
      }
      case "charge.dispute.closed": {
        const d = event.data.object as Stripe.Dispute;
        const row = await paymentByIntent(admin, d.payment_intent);
        if (!row) break;
        const won = d.status === "won";
        await pushEvent(
          admin,
          { roles: ["owner"], artistId: row.artist_id, shopId: row.shop_id },
          won ? "Dispute won" : "Dispute lost",
          won
            ? `The ${usd(d.amount)} dispute closed in the shop's favor. The money stays.`
            : `The ${usd(d.amount)} dispute closed against the shop and the bank kept the money. The books still count this sale — it needs a manual correction.`,
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Renewals, seat changes, card failures, cancels — the billing columns
        // follow Stripe's word for the life of the subscription.
        await applySubscription(admin, event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (e) {
    // Returning 500 makes Stripe retry; only do so for genuine processing errors.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
