import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePayment } from "@/lib/stripe/payments";
import { applySubscription } from "@/lib/stripe/billing";
import type Stripe from "stripe";

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
