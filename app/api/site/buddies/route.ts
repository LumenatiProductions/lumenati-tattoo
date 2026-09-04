import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchArtists } from "@/lib/admin/artists-data";
import { fetchAllRooms } from "@/lib/admin/room-data";
import { startOfShopDayIso } from "@/lib/arcade/scores";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// The home page's AIM buddy list, for real. One buddy per active artist;
// status comes from today's book: ONLINE while a session is running, AWAY
// when they're in today but between sessions, OFFLINE when they're not in.
// The away message is the artist's own room tagline when they wrote one.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type Session = { start: number; end: number };
export type Buddy = {
  id: string;
  slug: string;
  handle: string;
  name: string;
  color: string;
  status: "online" | "away" | "offline";
  away: string;
  nextAt?: string;
  booksClosed?: boolean;
};

const DEFAULT_AWAY = [
  "tattooing, back soon",
  "at the machine. leave a message",
  "inking. brb",
  "on a client. hit me up",
];

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).toLowerCase();
}

export async function GET() {
  const [artists, rooms] = await Promise.all([fetchArtists(), fetchAllRooms().catch(() => ({}))]);
  const admin = createAdminClient();
  const dayStart = startOfShopDayIso();
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 3600 * 1000).toISOString();
  const byArtist: Record<string, Session[]> = {};
  let closed: Record<string, boolean> = {};
  if (admin) {
    const { data } = await admin
      .from("bookings")
      .select("artist_id, starts_at, ends_at, status")
      .eq("shop_id", LUMENATI_SHOP_ID)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .neq("status", "cancelled");
    for (const b of (data ?? []) as { artist_id: string; starts_at: string; ends_at: string | null }[]) {
      const start = new Date(b.starts_at).getTime();
      const end = b.ends_at ? new Date(b.ends_at).getTime() : start + 2 * 3600 * 1000;
      (byArtist[b.artist_id] ??= []).push({ start, end });
    }
    const { data: art } = await admin.from("artists").select("id, books_closed").eq("shop_id", LUMENATI_SHOP_ID);
    closed = Object.fromEntries(((art ?? []) as { id: string; books_closed: boolean }[]).map((a) => [a.id, !!a.books_closed]));
  }

  const now = Date.now();
  const buddies: Buddy[] = artists.map((a, i) => {
    const sessions = (byArtist[a.id] ?? []).sort((x, y) => x.start - y.start);
    const room = (rooms as Record<string, { tagline?: string }>)[a.id];
    const tagline = (room?.tagline ?? "").trim();
    let away = tagline || DEFAULT_AWAY[i % DEFAULT_AWAY.length];
    let status: Buddy["status"] = "offline";
    let nextAt: string | undefined;
    if (sessions.length) {
      const live = sessions.find((s) => s.start <= now && now <= s.end);
      if (live) status = "online";
      else {
        status = "away";
        const next = sessions.find((s) => s.start > now);
        if (next) {
          nextAt = new Date(next.start).toISOString();
          away = `${away} // back at ${clock(next.start)}`;
        } else {
          away = `${away} // done for today`;
        }
      }
    } else {
      away = tagline ? `${tagline} // not in today` : "not in today. leave a message";
    }
    return { id: a.id, slug: a.slug, handle: a.handle, name: a.name, color: a.color, status, away, nextAt, booksClosed: closed[a.id] || undefined };
  });

  return NextResponse.json({ buddies, at: new Date(now).toISOString() }, { headers: NO_STORE });
}
