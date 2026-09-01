import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { looksLikePhone, normalizePhone } from "@/lib/sms";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";
import { pushEvent } from "@/lib/push/send";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { cleanHours, sessionMinutesOf, slotIsOpen } from "@/lib/bookings/slots";

export const dynamic = "force-dynamic";

// Public: a client books an open time themselves. The write lands as
//   deposit asked   -> status 'held' (30 min), pay link back to the browser;
//                      the Stripe webhook flips it to scheduled + confirmed.
//   no deposit      -> status 'scheduled' + confirmed right now.
// Service-role write pinned to the artist's shop, the slot re-checked against
// the live book the instant before insert, honeypot + hourly cap per contact.
// Modeled on the waitlist claim route (the other anon path onto the book).

const HOLD_MINUTES = 30;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Honeypot: real people never fill the hidden "website" field.
  if (clip(b.website, 10)) return NextResponse.json({ ok: true });

  const name = clip(b.name, 120);
  const email = clip(b.email, 200).toLowerCase();
  const rawPhone = clip(b.phone, 40);
  const idea = clip(b.idea, 2000);
  const artistId = clip(b.artistId, 80);
  const startsAt = clip(b.startsAt, 40);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phone = rawPhone && looksLikePhone(rawPhone) ? normalizePhone(rawPhone) : null;
  if (!name) return NextResponse.json({ error: "Tell us your name." }, { status: 400 });
  if (!idea) return NextResponse.json({ error: "Tell us about the tattoo you want." }, { status: 400 });
  if (!emailOk && !phone) return NextResponse.json({ error: "Leave an email or a mobile number." }, { status: 400 });
  if (!artistId || !startsAt || Number.isNaN(Date.parse(startsAt))) {
    return NextResponse.json({ error: "Pick an artist and a time." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  let shopId = LUMENATI_SHOP_ID;
  const shopSlug = clip(b.shopSlug, 80);
  if (shopSlug) {
    const { data: shop } = await admin.from("shops").select("id").eq("slug", shopSlug).maybeSingle();
    if (shop) shopId = shop.id as string;
  }

  const { data: a } = await admin
    .from("artists")
    .select("id, name, active, books_closed, self_serve, hours, session_minutes, deposit_cents")
    .eq("id", artistId)
    .eq("shop_id", shopId)
    .maybeSingle();
  const hours = a ? cleanHours(a.hours) : null;
  if (!a || !a.active || !a.self_serve || !hours || a.books_closed) {
    return NextResponse.json({ error: "That artist isn't taking self-serve bookings right now." }, { status: 409 });
  }

  // Hourly cap per contact, so one person can't hold a whole week.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let contactClientIds: string[] = [];
  if (emailOk) {
    const { data } = await admin.from("clients").select("id").eq("shop_id", shopId).eq("email", email);
    contactClientIds = (data ?? []).map((c) => c.id as string);
  }
  if (phone) {
    const { data } = await admin.from("clients").select("id").eq("shop_id", shopId).eq("phone", phone);
    contactClientIds.push(...(data ?? []).map((c) => c.id as string));
  }
  if (contactClientIds.length) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("client_id", contactClientIds)
      .eq("source", "self_serve")
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: "That's a lot of bookings in an hour. Text the shop and they'll sort it." }, { status: 429 });
    }
  }

  // Re-check the slot against the live book right before we write.
  const slotArtist = { id: a.id as string, hours, session_minutes: a.session_minutes, deposit_cents: a.deposit_cents };
  if (!(await slotIsOpen(admin, slotArtist, startsAt))) {
    return NextResponse.json({ error: "That time just got taken. Pick another one.", taken: true }, { status: 409 });
  }

  // Find-or-create the client: match email first, then phone.
  let clientId: string | null = contactClientIds[0] ?? null;
  if (!clientId) {
    const [first, ...rest] = name.split(/\s+/);
    const { data: c, error: cErr } = await admin
      .from("clients")
      .insert({
        id: `cl-${randomUUID()}`,
        shop_id: shopId,
        first_name: first || name,
        last_name: rest.join(" "),
        email: emailOk ? email : null,
        phone,
        source: "manual",
        notes: "Booked themselves from the artist's page.",
      })
      .select("id")
      .single();
    if (cErr) return NextResponse.json({ error: `Could not save your details: ${cErr.message}` }, { status: 500 });
    clientId = c.id as string;
  }
  if (b.marketingOk === true && clientId) {
    await admin
      .from("clients")
      .update({ marketing_ok: true, marketing_ok_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("shop_id", shopId)
      .eq("marketing_ok", false);
  }

  const session = sessionMinutesOf(a);
  const deposit = Math.max(0, Math.round(Number(a.deposit_cents) || 0));
  const askDeposit = deposit >= 50 && isStripeConfigured;
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + session * 60000);
  const placement = clip(b.placement, 200);
  const size = clip(b.size, 200);
  const nowIso = new Date().toISOString();
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      id: `bk-${randomUUID()}`,
      shop_id: shopId,
      client_id: clientId,
      artist_id: a.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: askDeposit ? "held" : "scheduled",
      hold_expires_at: askDeposit ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString() : null,
      confirmed_at: askDeposit ? null : nowIso,
      service_desc: idea.slice(0, 200),
      deposit_cents: deposit,
      deposit_status: "none",
      notes: [placement && `Placement: ${placement}`, size && `Size: ${size}`, "Booked from the artist's page."]
        .filter(Boolean)
        .join("\n"),
      source: "self_serve",
    })
    .select("id")
    .single();
  if (bErr) {
    // The unique race: two people, same second, same slot. Read as "taken".
    return NextResponse.json({ error: "That time just got taken. Pick another one.", taken: true }, { status: 409 });
  }

  if (!askDeposit) {
    const when = start.toLocaleString("en-US", {
      timeZone: process.env.SHOP_TIMEZONE || "America/Denver",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    await pushEvent(admin, { roles: ["owner"], artistId: a.id as string, shopId }, "New booking", `${name} booked ${when}.`);
    return NextResponse.json({ ok: true, bookingId: booking.id, confirmed: true });
  }

  const link = await createPaymentLink(admin, {
    bookingId: booking.id as string,
    clientId,
    artistId: a.id as string,
    kind: "deposit",
    amountCents: deposit,
    shopId,
  });
  if (!link.ok || !link.url) {
    // No pay link = no hold. Free the slot and say so.
    await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id).eq("status", "held");
    return NextResponse.json({ error: "Could not start the deposit payment. Try again." }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    confirmed: false,
    holdMinutes: HOLD_MINUTES,
    // Same-origin path: the pay page lives on whatever host served the form
    // (local dev, staging, prod), so never bounce the client across hosts.
    payUrl: `/pay/${link.payToken}`,
  });
}
