import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { pushEvent } from "@/lib/push/send";

export const dynamic = "force-dynamic";

// Refund a paid payment. Owner / bookkeeper only. For a Connect destination
// charge (a ticket split to an artist) the refund REVERSES the transfer — the
// money comes back out of the artist's balance and the shop's application fee is
// returned proportionally — so a refund can't leave the shop out of pocket. We
// then undo our books: flip the payment to `refunded`, drop the mirrored sale,
// and mark a deposit's booking refunded. Idempotent on the payment id.
const BOOKS = ["owner", "bookkeeper"] as const;

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
    return NextResponse.json({ error: "Owners & bookkeepers only." }, { status: 403 });
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

  // Books: payment -> refunded, drop the mirrored sale, cascade a deposit.
  await admin.from("payments").update({ status: "refunded" }).eq("id", row.id).eq("shop_id", shopId);
  if (row.kind === "ticket" || row.kind === "other") {
    await admin.from("sales").delete().eq("id", `lum_${row.id}`).eq("shop_id", shopId);
  }

  // Reverse this payment's ledger rows (append-only: a correction is a new row
  // pointing at the original, which ledger_sales then excludes). Idempotent.
  const { data: origLedger } = await admin
    .from("ledger")
    .select("id, kind, amount_cents, artist_id, client_id, booking_id, external_id")
    .eq("source", "stripe")
    .eq("shop_id", shopId)
    .like("external_id", `pay_${row.id}_%`)
    .is("reverses", null);
  if (origLedger?.length) {
    await admin.from("ledger").upsert(
      origLedger.map((o) => ({
        shop_id: shopId,
        source: "stripe",
        kind: "refund",
        direction: "out",
        amount_cents: o.amount_cents,
        artist_id: o.artist_id,
        client_id: o.client_id,
        booking_id: o.booking_id,
        reverses: o.id,
        external_id: `${o.external_id}_rev`,
        created_by: "refund",
      })),
      { onConflict: "source,external_id", ignoreDuplicates: true },
    );
  }
  if (row.kind === "deposit" && row.booking_id) {
    await admin
      .from("bookings")
      .update({ deposit_status: "refunded" })
      .eq("id", row.booking_id)
      .eq("shop_id", shopId)
      .in("deposit_status", ["held", "applied"]);
  }

  const total = row.amount_cents + Math.max(0, Math.round(row.tip_cents ?? 0));
  const usd = (total / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  await pushEvent(admin, { roles: ["owner"], artistId: row.artist_id, shopId }, "Refund issued", `${usd} refunded`);

  return NextResponse.json({ ok: true, refundedCents: total });
}
