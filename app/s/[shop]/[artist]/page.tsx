import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchShopArtist, fetchShopBySlug } from "@/lib/shops/public";
import { fetchRoom } from "@/lib/admin/room-data";
import { getSupabase } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import SocialIcon from "@/components/SocialIcon";

// The MINIMAL PORTFOLIO template (/s/<shop>/<artist>) — the same room_content
// data the Y2K rooms render, different skin. Built to the research rules:
// the work leads, the niche statement lands in the first screen, socials sit
// with the name (they ARE the credibility), and Book is one tap away at all
// times (sticky bar on phones). Closed books swap every Book CTA for the
// waitlist door, same as the Y2K renderer.
export const dynamic = "force-dynamic";

async function fetchLivePromo(artistId: string) {
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
  return (data?.[0] as { title: string; offer: string; ends_at: string | null } | undefined) ?? null;
}

// Live flash for sale — public read; available pieces first.
async function fetchFlash(artistId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("flash_pieces")
    .select("id, src, price_cents, claimed")
    .eq("artist_id", artistId)
    .order("claimed", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []) as { id: string; src: string; price_cents: number | null; claimed: boolean }[];
}

// books_closed rides the service client (anon column grant still queued).
async function fetchBooksClosed(artistId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("artists").select("books_closed").eq("id", artistId).maybeSingle();
  return !!data?.books_closed;
}

const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const usd = (c: number) => `$${Math.round(c / 100)}`;

// Handles or URLs -> real link; SocialIcon draws the official Ionicons mark.
function socialLinks(socials: Record<string, string> | null, igHandle: string) {
  const out: { key: string; label: string; href: string }[] = [];
  const ig = (socials?.instagram ?? igHandle ?? "").replace(/^@/, "");
  if (ig) out.push({ key: "instagram", label: "Instagram", href: `https://www.instagram.com/${ig}/` });
  const defs: [string, string, (v: string) => string][] = [
    ["tiktok", "TikTok", (v) => `https://www.tiktok.com/@${v.replace(/^@/, "")}`],
    ["x", "X", (v) => `https://x.com/${v.replace(/^@/, "")}`],
    ["youtube", "YouTube", (v) => (v.startsWith("http") ? v : `https://www.youtube.com/@${v.replace(/^@/, "")}`)],
    ["facebook", "Facebook", (v) => (v.startsWith("http") ? v : `https://www.facebook.com/${v}`)],
    ["website", "Website", (v) => (v.startsWith("http") ? v : `https://${v}`)],
  ];
  for (const [key, label, base] of defs) {
    const raw = (socials?.[key] ?? "").trim();
    if (raw) out.push({ key, label, href: base(raw) });
  }
  return out;
}

export default async function ShopArtistPage({
  params,
}: {
  params: Promise<{ shop: string; artist: string }>;
}) {
  const { shop: shopSlug, artist: artistSlug } = await params;
  const shop = await fetchShopBySlug(shopSlug);
  if (!shop) notFound();
  if (shop.template === "y2k") redirect(`/${artistSlug}`);

  const artist = await fetchShopArtist(shop.id, shop.slug, artistSlug);
  if (!artist) notFound();
  const [room, promo, flash, booksClosed] = await Promise.all([
    fetchRoom(artist.id),
    fetchLivePromo(artist.id),
    fetchFlash(artist.id),
    fetchBooksClosed(artist.id),
  ]);
  const accent = room.accentColor || artist.color || shop.accent;
  const shots = [
    ...room.portfolio.map((p) => ({ src: p.src, label: p.alt })),
    ...room.polaroids.map((p) => ({ src: p.src, label: p.caption })),
  ].filter((s) => s.src);
  const socials = socialLinks(room.socials, room.igHandle);
  const bookHref = `/request?artist=${encodeURIComponent(artist.id)}&shop=${encodeURIComponent(shopSlug)}`;
  const cta = booksClosed ? "Join the waitlist" : `Book with ${artist.name.split(" ")[0]}`;
  const availableFlash = flash.filter((f) => !f.claimed);

  return (
    <div className="book-bar-pad min-h-screen text-zinc-100" style={{ background: "#0b0b10" }}>
      {promo && (
        <div className="px-4 py-2.5 text-center text-sm font-semibold text-white" style={{ background: accent }}>
          {promo.title ? `${promo.title}: ` : ""}
          {promo.offer}
          {promo.ends_at ? ` · thru ${prettyDay(promo.ends_at)}` : ""}
        </div>
      )}

      <header
        className="px-6 pb-10 pt-12 text-center"
        style={{ background: `radial-gradient(80% 130% at 50% -20%, ${accent}33 0%, transparent 70%)` }}
      >
        <Link
          href={`/s/${shop.slug}`}
          className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
        >
          {shop.name}
        </Link>
        <div className="mt-5 flex justify-center">
          {room.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={room.profilePhoto}
              alt={artist.name}
              className="h-24 w-24 rounded-full border-2 object-cover"
              style={{ borderColor: accent }}
            />
          ) : (
            <span
              className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white"
              style={{ backgroundColor: accent }}
            >
              {artist.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">{artist.name}</h1>
        {/* The niche statement — the ten-second "is this my artist" answer. */}
        {room.tagline ? (
          <div className="mt-2 text-base font-semibold" style={{ color: accent }}>
            {room.tagline}
          </div>
        ) : null}
        {socials.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {socials.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                title={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-zinc-400 hover:border-white/40 hover:text-white"
              >
                <SocialIcon name={s.key} />
              </a>
            ))}
          </div>
        )}
        {room.bio ? <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">{room.bio}</p> : null}
        <a href={bookHref} className="mt-7 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
          {cta}
        </a>
        {booksClosed ? (
          <p className="mt-2 text-xs text-zinc-500">Books are closed right now — waitlist gets first call.</p>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        {shots.length > 0 ? (
          <>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">The work</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${s.src}-${i}`}
                  src={s.src}
                  alt={s.label || artist.name}
                  loading={i > 5 ? "lazy" : undefined}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <div className="text-base font-bold">New page, fresh needle.</div>
            <p className="mt-1 text-sm text-zinc-500">
              {artist.name.split(" ")[0]} is filling this portfolio now — the booking line is open.
            </p>
          </div>
        )}

        {availableFlash.length > 0 && (
          <>
            <h2 className="mb-4 mt-12 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
              Flash — first come, first inked
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {availableFlash.map((f) => (
                <div key={f.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt="flash" className="aspect-square w-full object-cover" />
                  {f.price_cents ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: accent }}>
                      {usd(f.price_cents)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <div className="text-lg font-bold">{booksClosed ? "Get in line early." : "Ready when you are."}</div>
          <a href={bookHref} className="mt-4 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
            {cta}
          </a>
        </div>
      </main>

      <footer className="border-t border-white/8 px-6 py-6 text-center text-xs text-zinc-600">
        {shop.name} · powered by Lumenati
      </footer>

      {/* One-tap booking, always in reach on a phone. */}
      <div className="book-bar">
        <a href={bookHref} className="block rounded-xl py-3 text-center text-base font-bold text-white" style={{ background: accent }}>
          {cta}
        </a>
      </div>
    </div>
  );
}
