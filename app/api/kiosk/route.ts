import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

export const dynamic = "force-dynamic";

// The kiosk runs on a shared, locked iPad — it is NOT signed in as a person. So
// this route is gated by a device token (KIOSK_DEVICE_TOKEN), not a user session,
// and uses the service-role client to read today's bookings + write check-ins.
// It only ever touches today's bookings; it never lists clients or anything else.
//
// If KIOSK_DEVICE_TOKEN is unset the kiosk is inert (503) — a safe default, same
// pattern as the Stripe/Square gates. Scott sets the token, then provisions the
// iPad once (the /kiosk setup screen stores it in localStorage).

function authed(req: Request): { ok: boolean; status: number; error?: string } {
  const expected = process.env.KIOSK_DEVICE_TOKEN;
  if (!expected) return { ok: false, status: 503, error: "Kiosk not configured." };
  const got = req.headers.get("x-kiosk-token");
  // Constant-time compare so response timing can't leak how much of a guessed
  // token matched (hash both sides so lengths always agree).
  const ok = !!got && timingSafeEqual(sha256(got), sha256(expected));
  if (!ok) return { ok: false, status: 401, error: "Bad device token." };
  return { ok: true, status: 200 };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type ConsentState = "signed" | "unsigned" | "none";

// GET ?date=YYYY-MM-DD — today's appointments for the kiosk (the iPad passes its
// own local date so "today" is the shop's day, matching the rest of the app).
export async function GET(req: Request) {
  const a = authed(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const dateParam = new URL(req.url).searchParams.get("date");
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const dayEnd = `${date}T23:59:59.999`;

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "id, starts_at, status, service_desc, est_price_cents, deposit_cents, deposit_status, checked_in_at, client_id, artist_id",
    )
    // Physical iPad at Lumenati — service-role reads pin to that shop.
    .eq("shop_id", LUMENATI_SHOP_ID)
    .gte("starts_at", date)
    .lte("starts_at", dayEnd)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, bookings: [] }, { status: 500 });

  const rows = bookings ?? [];
  const clientIds = [...new Set(rows.map((b) => b.client_id).filter(Boolean) as string[])];
  const artistIds = [...new Set(rows.map((b) => b.artist_id).filter(Boolean) as string[])];
  const bookingIds = rows.map((b) => b.id);

  const [clientsRes, artistsRes, formsRes] = await Promise.all([
    clientIds.length
      ? admin
          .from("clients")
          .select("id, first_name, last_name, phone")
          .eq("shop_id", LUMENATI_SHOP_ID)
          .in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[] }),
    artistIds.length
      ? admin.from("artists").select("id, name").eq("shop_id", LUMENATI_SHOP_ID).in("id", artistIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    bookingIds.length
      ? admin
          .from("consent_forms")
          .select("booking_id, sign_token, signed_at, voided")
          .eq("shop_id", LUMENATI_SHOP_ID)
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as { booking_id: string | null; sign_token: string | null; signed_at: string | null; voided: boolean }[] }),
  ]);

  const clientMap = new Map((clientsRes.data ?? []).map((c) => [c.id, c]));
  const artistMap = new Map((artistsRes.data ?? []).map((a2) => [a2.id, a2.name]));

  // Best consent state per booking: a signed (non-void) form wins; else an
  // unsigned form (with its sign link) so the kiosk can hand off to the signer.
  const consentMap = new Map<string, { state: ConsentState; token: string | null }>();
  for (const f of formsRes.data ?? []) {
    if (!f.booking_id || f.voided) continue;
    const cur = consentMap.get(f.booking_id);
    if (f.signed_at) consentMap.set(f.booking_id, { state: "signed", token: null });
    else if (!cur) consentMap.set(f.booking_id, { state: "unsigned", token: f.sign_token });
  }

  const shaped = rows.map((b) => {
    const c = b.client_id ? clientMap.get(b.client_id) : undefined;
    const consent = consentMap.get(b.id) ?? { state: "none" as ConsentState, token: null };
    return {
      id: b.id,
      startsAt: b.starts_at,
      status: b.status,
      serviceDesc: (b.service_desc as string) || "",
      depositCents: b.deposit_cents ?? 0,
      depositStatus: b.deposit_status ?? "none",
      checkedIn: !!b.checked_in_at,
      clientId: b.client_id,
      firstName: c?.first_name ?? "",
      lastName: c?.last_name ?? "",
      phone: c?.phone ?? "",
      artistName: b.artist_id ? artistMap.get(b.artist_id) ?? "" : "",
      consent,
    };
  });

  return NextResponse.json({ date, stripe: isStripeConfigured, bookings: shaped });
}

// POST — kiosk actions. Body { action, bookingId, ... }.
//  - checkin: confirm name/phone (optional edits to the client) + stamp checked_in_at
//  - deposit: mint a Session-1 pay link for this booking's deposit, return /pay token
export async function POST(req: Request) {
  const a = authed(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    action?: string;
    bookingId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  if (!b.bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_id, artist_id, deposit_cents, deposit_status, starts_at, status")
    .eq("id", b.bookingId)
    .eq("shop_id", LUMENATI_SHOP_ID)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // The kiosk only ever acts on the current day's sessions. Reject stale or
  // far-future booking ids (±1 day tolerance covers timezone skew) so a leaked
  // device token can't poke at history.
  const startsAt = new Date(booking.starts_at as string).getTime();
  if (!Number.isFinite(startsAt) || Math.abs(startsAt - Date.now()) > 86_400_000 * 1.5) {
    return NextResponse.json({ error: "That session isn't on today's list." }, { status: 400 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "That session was cancelled — please see the desk." }, { status: 400 });
  }

  if (b.action === "checkin") {
    // Optional client detail edits (only the fields the client touched).
    if (booking.client_id) {
      const patch: Record<string, string> = {};
      if (typeof b.firstName === "string" && b.firstName.trim()) patch.first_name = b.firstName.trim();
      if (typeof b.lastName === "string") patch.last_name = b.lastName.trim();
      if (typeof b.phone === "string") patch.phone = b.phone.trim();
      if (Object.keys(patch).length) {
        await admin.from("clients").update(patch).eq("id", booking.client_id).eq("shop_id", LUMENATI_SHOP_ID);
      }
    }
    const { error } = await admin
      .from("bookings")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("shop_id", LUMENATI_SHOP_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "deposit") {
    if (!isStripeConfigured) {
      return NextResponse.json({ error: "Payments not enabled." }, { status: 503 });
    }
    const amount = booking.deposit_cents ?? 0;
    if (amount < 50) return NextResponse.json({ error: "No deposit is due." }, { status: 400 });

    const res = await createPaymentLink(admin, {
      bookingId: booking.id,
      artistId: booking.artist_id ?? null,
      kind: "deposit",
      amountCents: amount,
      shopId: LUMENATI_SHOP_ID,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ payToken: res.payToken, url: res.url });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
