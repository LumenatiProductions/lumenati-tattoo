import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";

// In-house rent generation (rent-invoices-schema.sql). Runs in the daily ops
// fan-out AND behind the Rent page's Generate button: for every active booth
// renter, make sure this month's invoice exists, each with a Stripe pay link
// (kind='rent' — the shop's money, always billed on its own; never netted
// against the renter's sales). Idempotent via the (artist_id, period) unique
// index.

export const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export async function generateRentInvoices(client: SupabaseClient) {
  const period = currentPeriod();
  const dueDate = `${period}-05`; // rent due the 5th

  const { data: artists, error: aErr } = await client
    .from("artists")
    .select("id, name, pay_type, rent_cents, shop_id")
    .eq("active", true)
    .eq("pay_type", "booth_rent")
    .gt("rent_cents", 0);
  if (aErr) throw new Error(aErr.message);

  const { data: existing, error: eErr } = await client
    .from("rent_invoices")
    .select("artist_id")
    .eq("period", period);
  if (eErr) {
    if (/relation .* does not exist|42P01/i.test(eErr.message)) {
      return { feature: "rent_invoices", created: 0, note: "schema not applied" };
    }
    throw new Error(eErr.message);
  }
  const have = new Set((existing ?? []).map((r) => r.artist_id as string));

  let created = 0;
  for (const a of artists ?? []) {
    if (have.has(a.id as string)) continue;

    // Pay link first so the invoice row is born payable. Everything derived
    // from the artist carries the artist's own shop_id.
    let paymentId: string | null = null;
    if (isStripeConfigured) {
      const link = await createPaymentLink(client, {
        shopId: a.shop_id as string,
        artistId: a.id as string,
        kind: "rent",
        amountCents: a.rent_cents as number,
      });
      if (link.ok) paymentId = link.paymentId as string;
    }

    const { error } = await client.from("rent_invoices").insert({
      artist_id: a.id,
      shop_id: a.shop_id,
      period,
      amount_cents: a.rent_cents,
      due_date: dueDate,
      payment_id: paymentId,
    });
    if (!error) created++;
  }

  return { feature: "rent_invoices", period, created };
}

export async function runDailyJob(admin: unknown) {
  return generateRentInvoices(admin as SupabaseClient);
}
