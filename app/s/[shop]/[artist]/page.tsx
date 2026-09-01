import { notFound, redirect } from "next/navigation";
import { cleanHours, openSlots } from "@/lib/bookings/slots";
import { shopDay } from "@/lib/dates";
import { fetchShopArtist, fetchShopBySlug } from "@/lib/shops/public";
import { fetchRoom } from "@/lib/admin/room-data";
import { getSupabase } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { DarkSkin, FlashSkin, MinimalSkin, socialLinks, type FlashPiece, type Promo } from "./skins";

// The hosted artist page (/s/<shop>/<artist>) — one data model, three skins.
// shops.template picks the skin (see skins.tsx); the fetches here are shared.
// Built to the research rules: the work leads, the niche statement lands in
// the first screen, socials sit with the name (they ARE the credibility), and
// Book is one tap away at all times (sticky bar on phones). Closed books swap
// every Book CTA for the waitlist door, same as the Y2K renderer.
export const dynamic = "force-dynamic";

async function fetchLivePromo(artistId: string): Promise<Promo | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("artist_campaigns")
    .select("title, offer, ends_at")
    .eq("artist_id", artistId)
    .eq("active", true)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as Promo | undefined) ?? null;
}

// Live flash for sale — public read; available pieces first ('available'
// sorts before 'claimed'). The table tracks status, not a claimed flag.
async function fetchFlash(artistId: string): Promise<FlashPiece[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("flash_pieces")
    .select("id, src, title, price_cents, status")
    .eq("artist_id", artistId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(24);
  return ((data ?? []) as { id: string; src: string; title: string; price_cents: number | null; status: string }[]).map(
    (f) => ({ id: f.id, src: f.src, title: f.title, priceCents: f.price_cents ?? 0, claimed: f.status === "claimed" }),
  );
}

// books_closed rides the service client (anon column grant still queued).
async function fetchBooksClosed(artistId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("artists").select("books_closed").eq("id", artistId).maybeSingle();
  return !!data?.books_closed;
}

// "Next open: Wed, Sep 2 at 12 PM" under the book button, when the artist
// offers open times. One read of the live book; null when self-serve is off.
async function fetchNextOpen(artistId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: a } = await admin
    .from("artists")
    .select("id, self_serve, hours, session_minutes, deposit_cents, books_closed")
    .eq("id", artistId)
    .maybeSingle();
  if (!a || !a.self_serve || a.books_closed) return null;
  const hours = cleanHours(a.hours);
  if (!hours) return null;
  const days = await openSlots(admin, { id: a.id as string, hours, session_minutes: a.session_minutes, deposit_cents: a.deposit_cents }, shopDay(new Date()), 14);
  const first = days.find((d) => d.slots.length)?.slots[0];
  if (!first) return null;
  return new Date(first).toLocaleString("en-US", {
    timeZone: process.env.SHOP_TIMEZONE || "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(":00", "");
}

const SKINS = { standard: MinimalSkin, dark: DarkSkin, flash: FlashSkin } as const;

export default async function ShopArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string; artist: string }>;
  searchParams: Promise<{ skin?: string }>;
}) {
  const { shop: shopSlug, artist: artistSlug } = await params;
  const shop = await fetchShopBySlug(shopSlug);
  if (!shop) notFound();
  if (shop.template === "y2k") redirect(`/${artistSlug}`);

  const artist = await fetchShopArtist(shop.id, shop.slug, artistSlug);
  if (!artist) notFound();
  const [room, promo, flash, booksClosed, nextOpen] = await Promise.all([
    fetchRoom(artist.id),
    fetchLivePromo(artist.id),
    fetchFlash(artist.id),
    fetchBooksClosed(artist.id),
    fetchNextOpen(artist.id),
  ]);
  const accent = room.accentColor || artist.color || shop.accent;
  const shots = [
    ...room.portfolio.map((p) => ({ src: p.src, label: p.alt })),
    ...room.polaroids.map((p) => ({ src: p.src, label: p.caption })),
  ].filter((s) => s.src);
  const socials = socialLinks(room.socials, room.igHandle);
  const bookHref = `/request?artist=${encodeURIComponent(artist.id)}&shop=${encodeURIComponent(shopSlug)}`;
  const cta = booksClosed ? "Join the waitlist" : `Book with ${artist.name.split(" ")[0]}`;

  // ?skin= previews any skin without touching the shop's stored choice (how
  // the theme picker will let a shop peek before committing).
  const { skin: skinParam } = await searchParams;
  const key = (skinParam && skinParam in SKINS ? skinParam : shop.template) as keyof typeof SKINS;
  const Skin = SKINS[key] ?? MinimalSkin;

  return (
    <Skin
      shop={shop}
      artist={artist}
      room={room}
      accent={accent}
      shots={shots}
      socials={socials}
      flash={flash}
      promo={promo}
      booksClosed={booksClosed}
      bookHref={bookHref}
      cta={cta}
      nextOpen={nextOpen}
    />
  );
}
