import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findConflict } from "@/lib/bookings/conflict";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// The claim race (public, capability = offer uuid + waitlist entry id).
//   GET  ?offer=<uuid>&w=<entry> — where do I stand? open | yours | missed | gone
//   POST { offer, w }            — try to take it. Atomic: UPDATE WHERE
//                                  status='open' picks exactly one winner.
//
// A win books the slot for real: client created if the entry isn't linked to
// one, waitlist entry retired with booked_id, offer marked claimed. A loss is
// a friendly "you just missed it" — the entry STAYS on the list.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(offerId: string, entryId: string) {
  const admin = createAdminClient();
  if (!admin || !UUID_RE.test(offerId) || !/^wl-[a-z0-9-]+$/i.test(entryId)) {
    return { admin: null, offer: null, entry: null };
  }
  const [{ data: offer }, { data: entry }] = await Promise.all([
    admin.from("slot_offers").select("*").eq("id", offerId).maybeSingle(),
    admin.from("waitlist").select("id, shop_id, name, phone, client_id, want, active").eq("id", entryId).maybeSingle(),
  ]);
  // The two capability ids must belong to the SAME shop — a link can't pair
  // one shop's offer with another shop's waitlist entry.
  if (offer && entry && entry.shop_id !== offer.shop_id) {
    return { admin, offer: null, entry: null };
  }
  return { admin, offer, entry };
}

function standing(offer: { status: string; starts_at: string; claimed_waitlist_id: string | null }, entryId: string) {
  if (offer.status === "cancelled" || new Date(offer.starts_at).getTime() < Date.now()) return "gone";
  if (offer.status === "claimed") return offer.claimed_waitlist_id === entryId ? "yours" : "missed";
  return "open";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { admin, offer, entry } = await load(url.searchParams.get("offer") ?? "", url.searchParams.get("w") ?? "");
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!offer || !entry) return NextResponse.json({ status: "gone" }, { status: 404 });

  const { data: artist } = await admin.from("artists").select("name").eq("id", offer.artist_id).maybeSingle();
  return NextResponse.json({
    status: standing(offer, entry.id),
    firstName: (entry.name as string).split(/\s+/)[0] || null,
    artistName: (artist?.name as string) ?? null,
    startsAt: offer.starts_at,
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { offer?: string; w?: string };
  const { admin, offer, entry } = await load(b.offer ?? "", b.w ?? "");
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!offer || !entry) return NextResponse.json({ status: "gone" }, { status: 404 });

  const state = standing(offer, entry.id);
  if (state !== "open") return NextResponse.json({ status: state });
  if (!entry.active) return NextResponse.json({ status: "gone" });

  // Everything this claim writes stays in the offer's shop — the service-role
  // client bypasses RLS, so the shop_id is carried explicitly.
  const offerShop = offer.shop_id as string;

  // The race: exactly one UPDATE wins the open row.
  const { data: won } = await admin
    .from("slot_offers")
    .update({ status: "claimed", claimed_waitlist_id: entry.id })
    .eq("id", offer.id)
    .eq("shop_id", offerShop)
    .eq("status", "open")
    .select("id");
  if (!won || won.length === 0) {
    return NextResponse.json({ status: "missed" });
  }

  // Winner books for real. If the desk hand-filled the time meanwhile, give
  // the slot back honestly rather than double-booking the chair.
  const clash = await findConflict(admin, offer.artist_id, offer.starts_at, null);
  if (clash) {
    await admin.from("slot_offers").update({ status: "cancelled" }).eq("id", offer.id).eq("shop_id", offerShop);
    return NextResponse.json({ status: "gone" });
  }

  let clientId = entry.client_id as string | null;
  if (!clientId) {
    clientId = `walkin-${randomUUID()}`;
    const [first, ...rest] = (entry.name as string).split(/\s+/);
    const { error } = await admin.from("clients").insert({
      id: clientId,
      shop_id: offerShop,
      first_name: first,
      last_name: rest.join(" "),
      phone: entry.phone,
      preferred_artist_id: offer.artist_id,
      source: "manual",
      first_seen: new Date().toISOString().slice(0, 10),
    });
    if (error) {
      await admin
        .from("slot_offers")
        .update({ status: "open", claimed_waitlist_id: null })
        .eq("id", offer.id)
        .eq("shop_id", offerShop);
      return NextResponse.json({ error: "Could not save your spot — try again." }, { status: 500 });
    }
  }

  const bookingId = `bk-${randomUUID()}`;
  const { error: bkErr } = await admin.from("bookings").insert({
    id: bookingId,
    shop_id: offerShop,
    artist_id: offer.artist_id,
    client_id: clientId,
    starts_at: offer.starts_at,
    status: "scheduled",
    service_desc: (entry.want as string) || (offer.service_hint as string) || "",
    deposit_cents: 0,
    deposit_status: "none",
    source: "manual",
  });
  if (bkErr) {
    await admin
      .from("slot_offers")
      .update({ status: "open", claimed_waitlist_id: null })
      .eq("id", offer.id)
      .eq("shop_id", offerShop);
    return NextResponse.json({ error: "Could not save your spot — try again." }, { status: 500 });
  }

  await Promise.all([
    admin.from("slot_offers").update({ booking_id: bookingId }).eq("id", offer.id).eq("shop_id", offerShop),
    admin.from("waitlist").update({ active: false, booked_id: bookingId }).eq("id", entry.id).eq("shop_id", offerShop),
  ]);

  return NextResponse.json({ status: "yours" });
}
