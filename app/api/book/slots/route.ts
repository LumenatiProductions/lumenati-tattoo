import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { shopDay } from "@/lib/dates";
import { expireStaleHolds, openSlots, sessionMinutesOf, cleanHours } from "@/lib/bookings/slots";

export const dynamic = "force-dynamic";

// Public: the open times on one artist's book for the next two weeks. The
// booking form calls this when a client picks an artist; if the artist hasn't
// turned self-serve on (or set hours) it answers `selfServe:false` and the
// form falls back to the ask-for-a-time request. Service role, read-only,
// pinned to the artist's shop; nothing about other bookings leaves the server
// except "this start is taken".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const artistId = (url.searchParams.get("artist") ?? "").slice(0, 80);
  const shopSlug = (url.searchParams.get("shop") ?? "").slice(0, 80);
  const days = Math.max(1, Math.min(28, Number(url.searchParams.get("days") ?? 14) || 14));
  if (!artistId) return NextResponse.json({ error: "Which artist?" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  let shopId = LUMENATI_SHOP_ID;
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
  if (!a || !a.active) return NextResponse.json({ error: "That artist isn't taking bookings here." }, { status: 404 });

  const hours = cleanHours(a.hours);
  if (!a.self_serve || !hours || a.books_closed) {
    return NextResponse.json({ ok: true, selfServe: false, booksClosed: !!a.books_closed });
  }

  await expireStaleHolds(admin);
  const fromDay = shopDay(new Date());
  const daysOut = await openSlots(admin, { id: a.id as string, hours, session_minutes: a.session_minutes, deposit_cents: a.deposit_cents }, fromDay, days);
  return NextResponse.json({
    ok: true,
    selfServe: true,
    artist: { id: a.id, name: a.name, sessionMinutes: sessionMinutesOf(a), depositCents: Math.max(0, Number(a.deposit_cents) || 0) },
    tz: process.env.SHOP_TIMEZONE || "America/Denver",
    days: daysOut,
  });
}
