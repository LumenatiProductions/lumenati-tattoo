import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured, siteUrl } from "@/lib/stripe/client";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { logOpsEvent } from "@/lib/ops-events";
import { streamEnabledMap } from "@/lib/messaging/streams";
import { shopDay } from "@/lib/dates";
import { emailFrom } from "@/lib/email/from";

// In-house rent generation (rent-invoices-schema.sql). Runs in the daily ops
// fan-out AND behind the Rent page's Generate button: for every active booth
// renter, make sure this month's invoice exists, each with a Stripe pay link
// (kind='rent' — the shop's money, always billed on its own; never netted
// against the renter's sales). Idempotent via the (artist_id, period) unique
// index.

// Shop-clock month, not UTC: on the last evening of a month Denver is still
// in the old month while UTC has rolled over — a Generate tap then would mint
// next month's invoices hours early.
export const currentPeriod = () => shopDay().slice(0, 7); // YYYY-MM

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

// ── The nudge ladder (page-walk notes 3/11) ──
// Fixed date rungs per invoice: invoice ready (mint), due today, past due
// (+3d), then a firmer weekly repeat (+7, +14, ... capped). Pure so it's
// testable: given the dates and how many rungs were already delivered,
// which rung (if any) is owed today?
export type RentNudge = { rung: number; tone: "ready" | "due" | "late" | "firm" };
export function rentNudgeDue(
  createdDate: string, // YYYY-MM-DD
  dueDate: string, // YYYY-MM-DD
  today: string, // YYYY-MM-DD
  delivered: number,
): RentNudge | null {
  const add = (d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const rungs: { on: string; tone: RentNudge["tone"] }[] = [
    { on: createdDate, tone: "ready" },
    { on: dueDate, tone: "due" },
    { on: add(dueDate, 3), tone: "late" },
  ];
  for (let w = 7; w <= 42; w += 7) rungs.push({ on: add(dueDate, w), tone: "firm" });
  // Rungs can collide (invoice minted after its due date) — keep date order.
  const passed = rungs.filter((r) => r.on <= today);
  if (passed.length <= delivered) return null;
  // Deliver only the LATEST owed rung — nobody wants four catch-up texts.
  const rung = passed.length;
  return { rung, tone: passed[passed.length - 1].tone };
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function nudgeCopy(tone: RentNudge["tone"], name: string, amount: number, period: string, dueDate: string, payUrl: string | null) {
  const link = payUrl ? ` Pay here: ${payUrl}` : "";
  switch (tone) {
    case "ready":
      return `Lumenati Tattoo: your ${period} booth rent invoice (${money(amount)}) is ready, due ${dueDate}.${link}`;
    case "due":
      return `Lumenati Tattoo: booth rent (${money(amount)}) is due today.${link}`;
    case "late":
      return `Lumenati Tattoo: your ${period} booth rent (${money(amount)}) is past due. Square it up when you're in.${link}`;
    case "firm":
      return `Lumenati Tattoo: booth rent for ${period} (${money(amount)}) is still open. Please handle it this week or talk to the shop.${link}`;
  }
}

/**
 * Walk every pending invoice up the ladder. Sends are gated behind
 * RENT_AUTOSEND === "true" AND a live channel (Twilio SMS first, Resend email
 * fallback) — until Scott flips the switch this reports what WOULD go out and
 * touches nothing. Real sends advance the rung state; dry runs never do.
 */
export async function nudgeRentInvoices(client: SupabaseClient) {
  const autosend = process.env.RENT_AUTOSEND === "true";
  const canSend = autosend && (isSmsConfigured || !!process.env.RESEND_API_KEY);
  const today = shopDay(); // rung math on the shop's calendar, not UTC

  const { data: pending, error } = await client
    .from("rent_invoices")
    .select("id, artist_id, period, amount_cents, due_date, created_at, nudge_count, payment_id, shop_id")
    .eq("status", "pending");
  if (error) {
    if (/relation .* does not exist|42P01/i.test(error.message)) return { feature: "rent_nudges", note: "schema not applied" };
    throw new Error(error.message);
  }
  const rows = pending ?? [];
  if (!rows.length) return { feature: "rent_nudges", checked: 0, sent: 0 };

  const artistIds = [...new Set(rows.map((r) => r.artist_id as string))];
  const [{ data: profiles }, { data: pays }] = await Promise.all([
    client.from("profiles").select("artist_id, email, phone").in("artist_id", artistIds),
    client
      .from("payments")
      .select("id, pay_token")
      .in("id", rows.map((r) => r.payment_id).filter(Boolean) as string[]),
  ]);
  const contact = new Map((profiles ?? []).map((p) => [p.artist_id as string, p]));
  const tokens = new Map((pays ?? []).map((p) => [p.id as string, p.pay_token as string]));

  // The shop's own switch (Sending page) layers under the env master switch.
  const streamByShop = await streamEnabledMap(client, "rent_nudges");

  let sent = 0;
  let unreachable = 0;
  let switchedOff = 0;
  const failedByShop = new Map<string, number>();
  const wouldSend: string[] = [];
  for (const inv of rows) {
    if (streamByShop.get(inv.shop_id as string) === false) {
      switchedOff++;
      continue;
    }
    const due = rentNudgeDue(
      (inv.created_at as string).slice(0, 10),
      (inv.due_date as string) ?? `${inv.period}-05`,
      today,
      (inv.nudge_count as number) ?? 0,
    );
    if (!due) continue;
    const who = contact.get(inv.artist_id as string);
    if (!who?.phone && !who?.email) {
      // No login yet = no way to reach them. The admin rent page still shows
      // the unpaid row; nudges start the day they're onboarded on Team.
      unreachable++;
      continue;
    }
    const payUrl = inv.payment_id && tokens.has(inv.payment_id as string) ? `${siteUrl}/pay/${tokens.get(inv.payment_id as string)}` : null;
    const body = nudgeCopy(due.tone, inv.artist_id as string, inv.amount_cents as number, inv.period as string, (inv.due_date as string) ?? "", payUrl);

    if (!canSend) {
      wouldSend.push(`${inv.artist_id} ${inv.period} rung ${due.rung} (${due.tone})`);
      continue;
    }
    let delivered = false;
    let attempted = false;
    if (isSmsConfigured && who.phone) {
      attempted = true;
      const r = await sendSms(who.phone as string, body);
      delivered = r.ok;
    }
    if (!delivered && who.email && process.env.RESEND_API_KEY) {
      attempted = true;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom(),
          to: [who.email],
          subject: `Booth rent ${inv.period}`,
          text: body,
        }),
      });
      delivered = r.ok;
    }
    if (delivered) {
      sent++;
      await client
        .from("rent_invoices")
        .update({ nudge_count: due.rung, last_nudged_at: new Date().toISOString() })
        .eq("id", inv.id);
    } else if (attempted) {
      const sid = inv.shop_id as string;
      failedByShop.set(sid, (failedByShop.get(sid) ?? 0) + 1);
    }
  }

  // Surface any delivery failures on the Health page (per shop).
  for (const [shopId, count] of failedByShop) {
    await logOpsEvent(client, {
      shopId,
      kind: "sms_failed",
      severity: "warn",
      summary: `${count} booth-rent reminder${count === 1 ? "" : "s"} failed to send`,
      detail: `Rent nudge run: ${count} of ${rows.length} checked did not deliver by text or email.`,
    });
  }

  return {
    feature: "rent_nudges",
    checked: rows.length,
    sent,
    unreachable,
    autosend: canSend,
    ...(wouldSend.length ? { wouldSend } : {}),
  };
}

export async function runDailyJob(admin: unknown) {
  const client = admin as SupabaseClient;
  const generated = await generateRentInvoices(client);
  const nudges = await nudgeRentInvoices(client);
  return { ...generated, nudges };
}
