import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { userFromBearer } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Tap to Pay needs a Stripe Terminal Location to register the phone-reader
// against. One shop, one location: get-or-create "Lumenati Tattoo" and hand
// back its id. Bearer-authed like the other terminal endpoints.
export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const me = await userFromBearer(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const existing = await stripe.terminal.locations.list({ limit: 1 });
    if (existing.data[0]) return NextResponse.json({ locationId: existing.data[0].id });
    const loc = await stripe.terminal.locations.create({
      display_name: "Lumenati Tattoo",
      address: {
        line1: "3839 Jackson St",
        city: "Denver",
        state: "CO",
        postal_code: "80205",
        country: "US",
      },
    });
    return NextResponse.json({ locationId: loc.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
  }
}
