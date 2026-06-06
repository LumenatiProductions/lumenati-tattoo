import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { userFromBearer } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// The Stripe Terminal SDK needs a short-lived ConnectionToken to talk to Stripe.
// The app fetches one here (Bearer-authed) before connecting the Tap to Pay
// reader. Any signed-in staff/artist can take a payment.
export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const me = await userFromBearer(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const token = await stripe.terminal.connectionTokens.create();
    return NextResponse.json({ secret: token.secret });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}
