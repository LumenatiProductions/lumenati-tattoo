import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePayment } from "@/lib/stripe/payments";

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
          payment_intent: string | null;
          payment_status: string;
        };
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
