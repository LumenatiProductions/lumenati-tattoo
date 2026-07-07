import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSmsConfigured, normalizePhone, sendSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

// Offer a freed slot to the waitlist — first tap takes it (Scott, 2026-07-07).
// Body: { artistId, startsAt, serviceHint? }
// Texts every ACTIVE waitlist entry in that artist's lane (or the "anyone"
// pool) that has a phone; each text carries a personal claim link. Returns how
// many went out so the app can say "texted 4 people — first tap wins".
//
// Staff can offer any artist's slot; an artist can only offer their own.
// Texting is best-effort behind the same Twilio gate as reminders — on the
// trial account only verified numbers receive, and until it's configured we
// return texted: 0 with smsReady: false so the app can say so honestly.

const SHOP_TZ = "America/Denver";

export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    startsAt?: string;
    serviceHint?: string;
  };
  const artistId = ctx.role === "artist" ? ctx.artistId : b.artistId || null;
  if (!artistId) return NextResponse.json({ error: "An artist is required." }, { status: 400 });
  const startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "A valid slot time is required." }, { status: 400 });
  }
  if (startsAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That slot is already in the past." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // resolveStaff hands Bearer callers the service-role client too, but this
  // route always uses admin — everything scopes to the caller's shop.
  const { data: artist } = await admin
    .from("artists")
    .select("name")
    .eq("id", artistId)
    .eq("shop_id", ctx.shopId)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: "Unknown artist." }, { status: 400 });

  const { data: entries } = await admin
    .from("waitlist")
    .select("id, name, phone, artist_id")
    .eq("active", true)
    .eq("shop_id", ctx.shopId)
    .or(`artist_id.eq.${artistId},artist_id.is.null`)
    .order("created_at", { ascending: true })
    .limit(50);
  const reachable = ((entries ?? []) as { id: string; name: string; phone: string | null }[]).filter(
    (e) => normalizePhone(e.phone),
  );
  if (!reachable.length) {
    return NextResponse.json({ offered: 0, smsReady: isSmsConfigured, error: "Nobody on the waitlist has a phone number." }, { status: 400 });
  }

  const { data: offer, error } = await admin
    .from("slot_offers")
    .insert({
      shop_id: ctx.shopId,
      artist_id: artistId,
      starts_at: startsAt.toISOString(),
      service_hint: (b.serviceHint ?? "").trim(),
      status: "open",
    })
    .select("id")
    .single();
  if (error || !offer) return NextResponse.json({ error: error?.message ?? "Could not create the offer." }, { status: 500 });

  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TZ,
  }).format(startsAt);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");

  let texted = 0;
  const failures: string[] = [];
  for (const e of reachable) {
    const first = e.name.split(/\s+/)[0] || "there";
    const msg = `Lumenati Tattoo: ${first}, a spot just opened ${when} with ${artist.name}. First come first served — grab it: ${base}/claim/${offer.id}/${e.id}`;
    const r = await sendSms(e.phone!, msg);
    if (r.ok) texted++;
    else failures.push(r.error);
  }
  await admin.from("slot_offers").update({ offered_count: texted }).eq("id", offer.id).eq("shop_id", ctx.shopId);

  return NextResponse.json({
    offerId: offer.id,
    waiting: reachable.length,
    texted,
    smsReady: isSmsConfigured,
    // Trial-Twilio reality: sends to unverified numbers fail. Surface it.
    note: texted < reachable.length ? failures[0] : undefined,
  });
}
