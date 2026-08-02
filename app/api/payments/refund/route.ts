import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { reverseRefundBooks } from "@/lib/stripe/refund-books";

export const dynamic = "force-dynamic";

// Refund a paid payment. Admins only. For a Connect destination
// charge (a ticket split to an artist) the refund REVERSES the transfer — the
// money comes back out of the artist's balance and the shop's application fee is
// returned proportionally — so a refund can't leave the shop out of pocket. We
// then undo our books: flip the payment to `refunded`, drop the mirrored sale,
// and mark a deposit's booking refunded. Idempotent on the payment id.
const BOOKS = ["owner"] as const;

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null as string | null, shopId: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("email", user.email!)
    .maybeSingle();
  return {
    role: (profile?.role ?? null) as string | null,
    shopId: (profile?.shop_id as string | null) ?? null,
  };
}

export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  const { role, shopId } = await staff();
  if (!role || !shopId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!BOOKS.includes(role as (typeof BOOKS)[number])) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as { paymentId?: string; paymentIntentId?: string };
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // Service-role reads bypass RLS — every lookup below is pinned to the
  // caller's shop so an id from another tenant is just "not found".
  let q = admin.from("payments").select("*").eq("shop_id", shopId);
  if (b.paymentId) q = q.eq("id", b.paymentId);
  else if (b.paymentIntentId) q = q.eq("stripe_payment_intent_id", b.paymentIntentId);
  else return NextResponse.json({ error: "Need a payment to refund." }, { status: 400 });

  const { data: row } = await q.maybeSingle<{
    id: string;
    kind: string;
    status: string;
    booking_id: string | null;
    artist_id: string | null;
    shop_id: string;
    amount_cents: number;
    tip_cents: number | null;
    stripe_payment_intent_id: string | null;
  }>();
  if (!row) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (row.status === "refunded") return NextResponse.json({ ok: true, alreadyRefunded: true });
  if (row.status !== "paid") {
    return NextResponse.json({ error: "Only a paid payment can be refunded." }, { status: 400 });
  }
  if (!row.stripe_payment_intent_id) {
    return NextResponse.json({ error: "No Stripe charge on file for this payment." }, { status: 400 });
  }

  try {
    // Reverse the transfer + fee only when this was a destination (split) charge;
    // those params error on a plain platform charge (deposits, non-Connect).
    const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
    const isDestination = !!pi.transfer_data?.destination;
    await stripe.refunds.create(
      {
        payment_intent: row.stripe_payment_intent_id,
        ...(isDestination ? { reverse_transfer: true, refund_application_fee: true } : {}),
      },
      { idempotencyKey: `refund_${row.id}` },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe refund failed." },
      { status: 502 },
    );
  }

  // Books: shared with the webhook so dashboard refunds land identically.
  const { refundedCents } = await reverseRefundBooks(admin, row);

  return NextResponse.json({ ok: true, refundedCents });
}
