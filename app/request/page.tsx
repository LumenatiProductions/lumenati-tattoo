import { createAdminClient } from "@/lib/supabase/admin";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a tattoo",
  description: "Tell us what you want and we'll get you in the chair.",
};

// Public booking-request page. Lives OUTSIDE the (site) route group on purpose
// — same clean parent-brand shell as /intake and /pay, no Y2K bundle. The Y2K
// site links here when Scott wants it to; nothing on the public site changed.
// ?shop=<slug> (sent by the /s/<shop> template) scopes the artist roster and
// stamps the request on that shop; without it this stays Lumenati's page.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; artist?: string; flash?: string }>;
}) {
  const { shop: shopSlug, artist: artistParam, flash: flashParam } = await searchParams;
  const admin = createAdminClient();
  let artists: { id: string; name: string; booksClosed: boolean }[] = [];
  let shopName = "Lumenati Tattoo";
  let resolvedSlug: string | undefined;
  // The button + accents wear the shop's color; bare /request stays Lumenati pink.
  let accent = "#ff1493";
  if (admin) {
    let shopId = LUMENATI_SHOP_ID;
    if (shopSlug) {
      const { data: shop } = await admin
        .from("shops")
        .select("id, slug, name, accent")
        .eq("slug", shopSlug)
        .maybeSingle();
      if (shop) {
        shopId = shop.id as string;
        shopName = (shop.name as string) || shopName;
        if (/^#[0-9a-f]{6}$/i.test((shop.accent as string) ?? "")) accent = shop.accent as string;
        // Lumenati linked with its own slug still gets its logo header.
        if (shopId !== LUMENATI_SHOP_ID) resolvedSlug = shop.slug as string;
      }
    }
    const { data } = await admin
      .from("artists")
      .select("id, name, books_closed")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("sort");
    artists = (data ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      booksClosed: !!a.books_closed,
    }));
  }
  // A "Book with <artist>" link arrives with ?artist=<id>; preselect them only
  // if they're really in this shop's roster (a stale/foreign id falls back to
  // "no preference").
  let preselectArtistId = artists.some((a) => a.id === artistParam) ? artistParam : undefined;

  // Tapping a flash piece lands here with ?flash=<id>: show the piece above
  // the form and seed the idea so the desk knows exactly which design it is.
  // A piece someone already claimed (or a foreign/stale id) is just ignored —
  // the form still works as a normal request.
  let flashPiece: { src: string; title: string; price: string | null } | undefined;
  let initialIdea: string | undefined;
  if (admin && flashParam) {
    const { data: piece } = await admin
      .from("flash_pieces")
      .select("id, src, title, price_cents, status, artist_id")
      .eq("id", flashParam)
      .maybeSingle();
    if (piece && piece.status !== "claimed" && artists.some((a) => a.id === piece.artist_id)) {
      const price = piece.price_cents ? `$${Math.round((piece.price_cents as number) / 100)}` : null;
      flashPiece = { src: piece.src as string, title: (piece.title as string) || "", price };
      initialIdea = `Claiming the flash piece${flashPiece.title ? ` "${flashPiece.title}"` : ""}${price ? ` (${price})` : ""} from the sheet.`;
      if (!preselectArtistId) preselectArtistId = piece.artist_id as string;
    }
  }

  const isLumenati = !resolvedSlug;
  const openArtists = artists.filter((a) => !a.booksClosed);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-6xl">
          {resolvedSlug ? (
            <div className="text-xl font-semibold tracking-tight text-white">{shopName}</div>
          ) : (
            <LumenatiLogo bg="dark" className="w-28" />
          )}
          <div
            className="mt-1.5 text-[10px] uppercase tracking-[0.3em]"
            style={resolvedSlug ? { color: accent } : undefined}
          >
            <span className={resolvedSlug ? "" : "text-zinc-400"}>Book a tattoo</span>
          </div>
        </div>
      </header>
      {/* Phones get the form alone, top to bottom. Desktop splits: the pitch
          and the crew on the left, sticky, the form on the right. */}
      <main className="mx-auto max-w-6xl px-5 py-6 lg:grid lg:grid-cols-12 lg:gap-12 lg:py-12">
        <aside className="hidden lg:col-span-5 lg:block">
          <div className="sticky top-10">
            <h1 className="text-5xl font-bold leading-[1.02] tracking-tight">
              Get inked<span style={{ color: accent }}>.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-600">
              Tell us what you want and we get you in the chair. No account, no back and forth
              about deposits until a session is actually on the calendar.
            </p>

            <ol className="mt-9 space-y-5">
              {[
                ["Send the request", "A few details, a photo or two if you have them."],
                ["We reply to lock a time", "Usually the same day, by text or email, from a real person."],
                ["A deposit holds the chair", "Paid by link once your session is confirmed. It comes off the final price."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: accent }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold">{t}</div>
                    <div className="text-sm text-zinc-600">{d}</div>
                  </div>
                </li>
              ))}
            </ol>

            {artists.length > 0 && (
              <div className="mt-10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  The crew
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {artists.map((a) => {
                    const picked = a.id === preselectArtistId;
                    const q = new URLSearchParams({ artist: a.id, ...(resolvedSlug ? { shop: resolvedSlug } : {}) });
                    return (
                      <li key={a.id}>
                        <a
                          href={`/request?${q.toString()}`}
                          className="flex items-center justify-between rounded-xl border bg-white px-3.5 py-3 text-sm font-medium transition hover:border-zinc-400"
                          style={picked ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}33` } : undefined}
                        >
                          <span>{a.name}</span>
                          <span
                            className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={
                              a.booksClosed
                                ? { background: "#f4f4f5", color: "#71717a" }
                                : { background: `${accent}1a`, color: accent }
                            }
                          >
                            {a.booksClosed ? "Waitlist" : "Open"}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-sm text-zinc-500">
                  {openArtists.length === artists.length
                    ? "Pick one, or leave it to us and we match you."
                    : "Waitlist means their books are closed right now. Pick anyone open, or leave it to us."}
                </p>
              </div>
            )}

            <p className="mt-10 text-sm text-zinc-500">
              {isLumenati
                ? "Walk-ins are welcome whenever a chair is open. Flash on the wall, the door is open."
                : `Questions before you book? Ask ${shopName} directly.`}
            </p>
          </div>
        </aside>
        <div className="lg:col-span-7">
          <RequestForm
            artists={artists}
            shopSlug={resolvedSlug}
            shopName={shopName}
            preselectArtistId={preselectArtistId}
            accent={accent}
            initialIdea={initialIdea}
            flashPiece={flashPiece}
          />
        </div>
      </main>
    </div>
  );
}
