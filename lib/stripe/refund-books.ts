import type { SupabaseClient } from "@supabase/supabase-js";
import { pushEvent } from "@/lib/push/send";

// The books side of a refund, shared by the admin refund action and the
// Stripe webhook (a refund issued from the Stripe dashboard must land in the
// books exactly like one issued in the app). Stripe has already moved the
// money by the time this runs — this only makes our records agree: payment ->
// refunded, drop the mirrored sale, append reversing ledger rows, cascade a
// deposit's booking, tell the owner. Idempotent: an already-refunded payment
// no-ops, and the ledger upsert ignores rows that already exist.

export type RefundablePayment = {
  id: string;
  kind: string;
  status: string;
  booking_id: string | null;
  artist_id: string | null;
  shop_id: string;
  amount_cents: number;
  tip_cents: number | null;
};

export async function reverseRefundBooks(
  admin: SupabaseClient,
  row: RefundablePayment,
): Promise<{ refundedCents: number; alreadyRefunded: boolean }> {
  const total = row.amount_cents + Math.max(0, Math.round(row.tip_cents ?? 0));
  if (row.status === "refunded") return { refundedCents: total, alreadyRefunded: true };
  const shopId = row.shop_id;

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

  const usd = (total / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  await pushEvent(admin, { roles: ["owner"], artistId: row.artist_id, shopId }, "Refund issued", `${usd} refunded`);

  return { refundedCents: total, alreadyRefunded: false };
}
