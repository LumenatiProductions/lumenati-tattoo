import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Shop insights for the Reports page (admins): rebooking rate,
// no-show rate per artist, busiest hours, top clients by lifetime spend. All
// computed from bookings + clients already in the DB — no schema, no mocks.

const WINDOW_DAYS = 90;
const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (!profile || profile.role !== "owner") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  // PostgREST caps un-ranged selects at 1000 rows; 90 days of bookings can
  // exceed that, so page through the window.
  const bookings: { client_id: string | null; artist_id: string | null; status: string; starts_at: string }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data } = await supabase
      .from("bookings")
      .select("client_id, artist_id, status, starts_at")
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .range(start, start + 999);
    if (!data?.length) break;
    bookings.push(...data);
    if (data.length < 1000) break;
  }
  const clientsRes = await supabase
    .from("clients")
    .select("id, first_name, last_name, total_spent_cents, last_seen")
    .gt("total_spent_cents", 0)
    .order("total_spent_cents", { ascending: false })
    .limit(8);

  // Rebooking: of clients with a completed visit in the window, how many came twice+.
  const visitsByClient = new Map<string, number>();
  for (const b of bookings) {
    if (b.status !== "completed" || !b.client_id) continue;
    visitsByClient.set(b.client_id, (visitsByClient.get(b.client_id) ?? 0) + 1);
  }
  const visited = visitsByClient.size;
  const rebooked = [...visitsByClient.values()].filter((n) => n >= 2).length;

  // No-show rate per artist over settled (completed + no_show) bookings.
  const byArtist = new Map<string, { done: number; noShow: number }>();
  for (const b of bookings) {
    if (!b.artist_id || (b.status !== "completed" && b.status !== "no_show")) continue;
    const e = byArtist.get(b.artist_id) ?? { done: 0, noShow: 0 };
    if (b.status === "completed") e.done++;
    else e.noShow++;
    byArtist.set(b.artist_id, e);
  }
  const noShowByArtist = [...byArtist.entries()]
    .map(([artistId, e]) => ({
      artistId,
      settled: e.done + e.noShow,
      noShowPct: Math.round((e.noShow / Math.max(1, e.done + e.noShow)) * 100),
    }))
    .filter((r) => r.settled >= 3) // don't shame anyone over tiny samples
    .sort((a, b) => b.noShowPct - a.noShowPct);

  // Busiest hours (shop timezone) over non-cancelled bookings.
  const hourFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: SHOP_TZ });
  const hours = new Array(24).fill(0) as number[];
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const h = Number(hourFmt.format(new Date(b.starts_at)));
    if (Number.isFinite(h)) hours[h % 24]++;
  }

  const topClients = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim() || "Unnamed",
    spentCents: c.total_spent_cents,
    lastSeen: c.last_seen,
  }));

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    rebooking: { visited, rebooked, pct: visited ? Math.round((rebooked / visited) * 100) : 0 },
    noShowByArtist,
    hours,
    topClients,
  });
}
