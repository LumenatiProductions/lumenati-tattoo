import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchShopArtists, fetchShopBySlug, publicArtistSlug } from "@/lib/shops/public";
import { fetchRoom } from "@/lib/admin/room-data";

// Standard shop landing (/s/<shop>): the clean template every non-Lumenati
// shop gets. Shop name + tagline, the crew as accent-lit cards. One data
// model, many skins — Lumenati's Y2K root site is just another skin.
export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: slug } = await params;
  const shop = await fetchShopBySlug(slug);
  if (!shop) notFound();
  if (shop.template === "y2k") redirect("/"); // Lumenati lives at the root

  const artists = await fetchShopArtists(shop.id);
  const rooms = await Promise.all(artists.map((a) => fetchRoom(a.id)));

  // The dark-ink skin's smoke follows the shop onto the crew page; the other
  // skins share the standard landing.
  const dark = shop.template === "dark";
  return (
    <div className={`min-h-screen text-zinc-100 ${dark ? "ink-bg" : ""}`} style={dark ? undefined : { background: "#0b0b10" }}>
      <header className="px-6 pb-10 pt-14 text-center" style={dark ? undefined : { background: `radial-gradient(80% 120% at 50% -20%, ${shop.accent}33 0%, transparent 70%)` }}>
        <div className="text-[11px] font-bold uppercase" style={{ letterSpacing: "0.35em", color: shop.accent }}>
          Tattoo studio
        </div>
        <h1 className="mt-2 text-4xl font-black tracking-tight">{shop.name}</h1>
        {shop.tagline ? <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">{shop.tagline}</p> : null}
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">The artists</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {artists.map((a, i) => {
            const room = rooms[i];
            return (
              <Link
                key={a.id}
                href={`/s/${shop.slug}/${publicArtistSlug(shop.slug, a.slug)}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:bg-white/[0.07]"
              >
                <div className="flex items-center gap-4">
                  {room.profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={room.profilePhoto} alt={a.name} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                      style={{ backgroundColor: a.color }}
                    >
                      {a.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </span>
                  )}
                  <div>
                    <div className="text-lg font-bold">{a.name}</div>
                    <div className="text-sm" style={{ color: a.color }}>
                      {a.handle ? `@${a.handle}` : room.tagline || "tattoo artist"}
                    </div>
                  </div>
                </div>
                {room.tagline ? <p className="mt-3 text-sm text-zinc-400">{room.tagline}</p> : null}
                <div className="mt-4 text-sm font-semibold" style={{ color: shop.accent }}>
                  See work + book →
                </div>
              </Link>
            );
          })}
        </div>
        {artists.length === 0 && <p className="text-sm text-zinc-500">The crew is being added — check back soon.</p>}
      </main>

      <footer className="border-t border-white/8 px-6 py-6 text-center text-xs text-zinc-600">
        {shop.name} · powered by Lumenati
      </footer>
    </div>
  );
}
