import Link from "next/link";
import SocialIcon from "@/components/SocialIcon";
import type { PublicArtist, PublicShop } from "@/lib/shops/public";
import type { RoomContent } from "@/lib/admin/types";

// The artist-page skins. One data model, three looks — the header unit
// (shop logo -> avatar -> name -> niche -> socials -> Book) is the SAME
// component in every skin so a shop can switch templates without the page
// meaning anything different:
//   minimal (template 'standard') — clean, the work leads.
//   dark ink ('dark')             — smoke not white, blackwork energy.
//   flash sheet ('flash')         — the wall of flash IS the page.
// Y2K never renders here; the route redirects it to the root site.

export type FlashPiece = { id: string; src: string; title: string; priceCents: number; claimed: boolean };
export type Promo = { title: string; offer: string; ends_at: string | null };

export type SkinProps = {
  shop: PublicShop;
  artist: PublicArtist;
  room: RoomContent;
  accent: string;
  shots: { src: string; label: string }[];
  socials: { key: string; label: string; href: string }[];
  flash: FlashPiece[];
  promo: Promo | null;
  booksClosed: boolean;
  bookHref: string;
  cta: string;
  /** "Wed, Sep 2 at 12 PM" when the artist offers open times; null otherwise. */
  nextOpen?: string | null;
};

export const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const usd = (c: number) => `$${Math.round(c / 100)}`;

// Handles or URLs -> real link; SocialIcon draws the official Ionicons mark.
export function socialLinks(socials: Record<string, string> | null, igHandle: string) {
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

function PromoBanner({ promo, accent }: { promo: Promo; accent: string }) {
  return (
    <div className="px-4 py-2.5 text-center text-sm font-semibold text-white" style={{ background: accent }}>
      {promo.title ? `${promo.title}: ` : ""}
      {promo.offer}
      {promo.ends_at ? ` · thru ${prettyDay(promo.ends_at)}` : ""}
    </div>
  );
}

function BookBar({ bookHref, cta, accent }: { bookHref: string; cta: string; accent: string }) {
  return (
    <div className="book-bar">
      <a href={bookHref} className="block rounded-xl py-3 text-center text-base font-bold text-white" style={{ background: accent }}>
        {cta}
      </a>
    </div>
  );
}

function PageFooter({ shopName }: { shopName: string }) {
  return (
    <footer className="border-t border-white/8 px-6 py-6 text-center text-xs text-zinc-600">
      {shopName} · powered by Lumenati
    </footer>
  );
}

// The header unit — identical content and order in every skin. The skin only
// gets to change the air around it: atmosphere, density, and type finish.
function ArtistHeader({
  shop,
  artist,
  room,
  accent,
  socials,
  bookHref,
  cta,
  booksClosed,
  nextOpen,
  variant,
}: SkinProps & { variant: "minimal" | "dark" | "flash" }) {
  const dark = variant === "dark";
  const compact = variant === "flash";
  return (
    <header
      className={compact ? "px-6 pb-7 pt-8 text-center" : "px-6 pb-10 pt-12 text-center"}
      style={dark ? undefined : { background: `radial-gradient(80% 130% at 50% -20%, ${accent}33 0%, transparent 70%)` }}
    >
      <Link
        href={`/s/${shop.slug}`}
        className="inline-flex flex-col items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
      >
        {shop.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.logoUrl} alt={shop.name} className="h-10 w-auto max-w-[160px] object-contain opacity-90" />
        ) : null}
        {shop.name}
      </Link>
      <div className={compact ? "mt-4 flex justify-center" : "mt-5 flex justify-center"}>
        {room.profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.profilePhoto}
            alt={artist.name}
            className={`${compact ? "h-16 w-16" : "h-24 w-24"} rounded-full border-2 object-cover`}
            style={{ borderColor: accent }}
          />
        ) : (
          <span
            className={`flex ${compact ? "h-16 w-16 text-xl" : "h-24 w-24 text-3xl"} items-center justify-center rounded-full font-black text-white`}
            style={{ backgroundColor: accent }}
          >
            {artist.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </span>
        )}
      </div>
      <h1 className={`${compact ? "mt-4 text-3xl" : "mt-5 text-4xl sm:text-5xl"} font-black tracking-tight ${dark ? "ink-name" : ""}`}>
        {artist.name}
      </h1>
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
              className={`flex h-9 w-9 items-center justify-center border border-white/15 text-zinc-400 hover:border-white/40 hover:text-white ${dark ? "ink-btn" : "rounded-full"}`}
            >
              <SocialIcon name={s.key} />
            </a>
          ))}
        </div>
      )}
      {!compact && room.bio ? (
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">{room.bio}</p>
      ) : null}
      <a
        href={bookHref}
        className={`${compact ? "mt-5 px-7 py-3 text-sm" : "mt-7 px-8 py-3.5 text-base"} inline-block font-bold text-white ${dark ? "ink-btn" : "rounded-xl"}`}
        style={{ background: accent }}
      >
        {cta}
      </a>
      {booksClosed ? (
        <p className="mt-2 text-xs text-zinc-500">Books are closed right now — waitlist gets first call.</p>
      ) : nextOpen ? (
        <p className="mt-2 text-xs text-zinc-500">Next open: {nextOpen}</p>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------- minimal --

export function MinimalSkin(p: SkinProps) {
  const { accent, shots, flash, promo, booksClosed, bookHref, cta, nextOpen, artist, shop } = p;
  const availableFlash = flash.filter((f) => !f.claimed);
  return (
    <div className="book-bar-pad ink-bg min-h-screen text-zinc-100">
      {promo && <PromoBanner promo={promo} accent={accent} />}
      <div className="artist-shell">
      <div className="artist-rail">
      <ArtistHeader {...p} variant="minimal" />
      </div>

      <main className="artist-body mx-auto max-w-3xl px-5 pb-16 lg:mx-0 lg:max-w-none lg:px-0">
        {availableFlash.length > 0 && (
          <>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
              Flash — first come, first inked
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {availableFlash.map((f) => (
                <a key={f.id} href={`${bookHref}&flash=${f.id}`} className="ink-tile relative block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt={f.title || "flash"} className="aspect-square w-full object-cover" />
                  {f.priceCents ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: accent }}>
                      {usd(f.priceCents)}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          </>
        )}

        {shots.length > 0 ? (
          <>
            <h2 className={`mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500 ${availableFlash.length > 0 ? "mt-12" : ""}`}>The work</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${s.src}-${i}`}
                  src={s.src}
                  alt={s.label || artist.name}
                  loading={i > 5 ? "lazy" : undefined}
                  className="ink-tile aspect-square w-full object-cover"
                />
              ))}
            </div>
          </>
        ) : availableFlash.length === 0 ? (
          <div className="ink-card p-8 text-center">
            <div className="text-base font-bold">New page, fresh needle.</div>
            <p className="mt-1 text-sm text-zinc-500">
              {artist.name.split(" ")[0]} is filling this portfolio now — the booking line is open.
            </p>
          </div>
        ) : null}

        <div className="ink-card mt-12 p-6 text-center">
          <div className="text-lg font-bold">{booksClosed ? "Get in line early." : "Ready when you are."}</div>
          {!booksClosed && nextOpen ? <p className="mt-1 text-sm text-zinc-500">Next open: {nextOpen}</p> : null}
          <a href={bookHref} className="mt-4 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
            {cta}
          </a>
        </div>
      </main>
      </div>

      <PageFooter shopName={shop.name} />
      <BookBar bookHref={bookHref} cta={cta} accent={accent} />
    </div>
  );
}

// --------------------------------------------------------------- dark ink --

export function DarkSkin(p: SkinProps) {
  const { accent, shots, flash, promo, booksClosed, bookHref, cta, artist, shop } = p;
  const availableFlash = flash.filter((f) => !f.claimed);
  return (
    <div className="book-bar-pad ink-bg min-h-screen text-zinc-100">
      {promo && <PromoBanner promo={promo} accent={accent} />}
      <div className="artist-shell">
      <div className="artist-rail">
      <ArtistHeader {...p} variant="dark" />
      </div>

      <main className="artist-body mx-auto max-w-3xl px-5 pb-16 lg:mx-0 lg:max-w-none lg:px-0">
        {availableFlash.length > 0 && (
          <>
            <h2 className="ink-rule mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
              Flash — first come, first inked
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {availableFlash.map((f) => (
                <a key={f.id} href={`${bookHref}&flash=${f.id}`} className="ink-tile relative block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt={f.title || "flash"} className="aspect-square w-full object-cover" />
                  {f.priceCents ? (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: "rgba(5,5,8,0.8)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 4 }}>
                      {usd(f.priceCents)}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          </>
        )}

        {shots.length > 0 ? (
          <>
            <h2 className={`ink-rule mb-4 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500 ${availableFlash.length > 0 ? "mt-12" : ""}`}>The work</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${s.src}-${i}`}
                  src={s.src}
                  alt={s.label || artist.name}
                  loading={i > 5 ? "lazy" : undefined}
                  className="ink-tile aspect-square w-full object-cover"
                />
              ))}
            </div>
          </>
        ) : availableFlash.length === 0 ? (
          <div className="ink-card p-8 text-center">
            <div className="ink-name text-base font-bold">New page, fresh needle.</div>
            <p className="mt-1 text-sm text-zinc-500">
              {artist.name.split(" ")[0]} is filling this portfolio now — the booking line is open.
            </p>
          </div>
        ) : null}

        <div className="ink-card mt-12 p-6 text-center">
          <div className="ink-name text-lg font-bold">{booksClosed ? "Get in line early." : "Ready when you are."}</div>
          <a href={bookHref} className="ink-btn mt-4 inline-block px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
            {cta}
          </a>
        </div>
      </main>
      </div>

      <PageFooter shopName={shop.name} />
      <BookBar bookHref={bookHref} cta={cta} accent={accent} />
    </div>
  );
}

// ------------------------------------------------------------ flash sheet --

export function FlashSkin(p: SkinProps) {
  const { accent, shots, flash, promo, booksClosed, bookHref, cta, artist, shop } = p;
  const available = flash.filter((f) => !f.claimed);
  const claimed = flash.filter((f) => f.claimed);
  return (
    <div className="book-bar-pad ink-bg min-h-screen text-zinc-100">
      {promo && <PromoBanner promo={promo} accent={accent} />}
      <div className="artist-shell">
      <div className="artist-rail">
      <ArtistHeader {...p} variant="flash" />
      </div>

      <main className="artist-body mx-auto max-w-3xl px-4 pb-16 lg:mx-0 lg:max-w-none lg:px-0">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">The flash sheet</h2>
          {available.length > 0 ? (
            <span className="text-xs font-semibold" style={{ color: accent }}>
              {available.length} up for grabs
            </span>
          ) : null}
        </div>

        {flash.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {available.map((f) => (
                <a key={f.id} href={`${bookHref}&flash=${f.id}`} className="ink-tile relative block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt={f.title || "flash"} className="aspect-square w-full object-cover" />
                  <span className="flash-claim">
                    <span className="text-xs font-bold text-white">Claim it</span>
                    {f.priceCents ? (
                      <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: accent }}>
                        {usd(f.priceCents)}
                      </span>
                    ) : null}
                  </span>
                </a>
              ))}
              {claimed.map((f) => (
                <div key={f.id} className="ink-tile relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt={f.title || "flash"} className="aspect-square w-full object-cover opacity-60" />
                  <span className="flash-stamp">
                    <span>Claimed</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              Every design is one-off — once it&apos;s claimed, it&apos;s retired.
            </p>
          </>
        ) : (
          <div className="ink-card p-8 text-center">
            <div className="text-base font-bold">The next sheet is being drawn.</div>
            <p className="mt-1 text-sm text-zinc-500">
              New flash lands here first — or bring {artist.name.split(" ")[0]} your own idea below.
            </p>
          </div>
        )}

        {shots.length > 0 && (
          <>
            <h2 className="mb-4 mt-12 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Healed + custom work</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${s.src}-${i}`}
                  src={s.src}
                  alt={s.label || artist.name}
                  loading={i > 5 ? "lazy" : undefined}
                  className="ink-tile aspect-square w-full object-cover"
                />
              ))}
            </div>
          </>
        )}

        <div className="ink-card mt-12 p-6 text-center">
          <div className="text-lg font-bold">{booksClosed ? "Get in line early." : "Want something custom?"}</div>
          <a href={bookHref} className="mt-4 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
            {cta}
          </a>
        </div>
      </main>
      </div>

      <PageFooter shopName={shop.name} />
      <BookBar bookHref={bookHref} cta={cta} accent={accent} />
    </div>
  );
}
