import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchShopArtist, fetchShopBySlug } from "@/lib/shops/public";
import { fetchRoom } from "@/lib/admin/room-data";
import { getSupabase } from "@/lib/supabase";

// Standard artist page (/s/<shop>/<artist>). Same room_content data the Y2K
// rooms render — different skin. This is the page a shop's QR cards, promos,
// and claim links point at, so it leads with the work and ends with Book.
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

const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
  const [room, promo] = await Promise.all([fetchRoom(artist.id), fetchLivePromo(artist.id)]);
  const accent = artist.color || shop.accent;
  const shots = [...room.portfolio.map((p) => ({ src: p.src, label: p.alt })), ...room.polaroids.map((p) => ({ src: p.src, label: p.caption }))].filter((s) => s.src);

  return (
    <div className="min-h-screen text-zinc-100" style={{ background: "#0b0b10" }}>
      {promo && (
        <div className="px-4 py-2.5 text-center text-sm font-semibold text-white" style={{ background: accent }}>
          {promo.title ? `${promo.title}: ` : ""}
          {promo.offer}
          {promo.ends_at ? ` · thru ${prettyDay(promo.ends_at)}` : ""}
        </div>
      )}

      <header className="px-6 pb-8 pt-12 text-center" style={{ background: `radial-gradient(80% 130% at 50% -20%, ${accent}33 0%, transparent 70%)` }}>
        <Link href={`/s/${shop.slug}`} className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
          {shop.name}
        </Link>
        <div className="mt-4 flex justify-center">
          {room.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={room.profilePhoto} alt={artist.name} className="h-24 w-24 rounded-full border-2 object-cover" style={{ borderColor: accent }} />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white" style={{ backgroundColor: accent }}>
              {artist.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">{artist.name}</h1>
        <div className="mt-1 text-sm font-semibold" style={{ color: accent }}>
          {artist.handle ? `@${artist.handle}` : null}
          {artist.handle && room.tagline ? " · " : null}
          {room.tagline}
        </div>
        {room.bio ? <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">{room.bio}</p> : null}
        <a
          href={`/request?artist=${encodeURIComponent(artist.id)}`}
          className="mt-6 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white"
          style={{ background: accent }}
        >
          Book with {artist.name.split(" ")[0]}
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        {shots.length > 0 ? (
          <>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">The work</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${s.src}-${i}`} src={s.src} alt={s.label || artist.name} className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-zinc-500">Portfolio coming — the healed shots are on their way.</p>
        )}

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <div className="text-lg font-bold">Ready when you are.</div>
          <a
            href={`/request?artist=${encodeURIComponent(artist.id)}`}
            className="mt-4 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white"
            style={{ background: accent }}
          >
            Book with {artist.name.split(" ")[0]}
          </a>
        </div>
      </main>

      <footer className="border-t border-white/8 px-6 py-6 text-center text-xs text-zinc-600">
        {shop.name} · powered by Lumenati
      </footer>
    </div>
  );
}
