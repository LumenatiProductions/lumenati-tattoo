import LegacyBlock from "@/components/LegacyBlock";
import { notFound } from "next/navigation";
import { fetchRoom } from "@/lib/admin/room-data";
import { fetchArtistBySlug } from "@/lib/admin/artists-data";
import { renderRoomHtml } from "@/lib/admin/render-room";
import { getSupabase } from "@/lib/supabase";

// One dynamic route for every artist room (/<slug>). The roster lives in the
// DB, so adding an artist gives them a live room here automatically. Static
// routes (/book, /contact) take precedence over this dynamic segment.
export const dynamic = "force-dynamic";

// The artist's own live promo, if one is running (artist_campaigns — written
// from the phone app; RLS lets the anon key read active rows only). Newest
// wins; date-expired promos stay off even if the artist forgot to end them.
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

export default async function ArtistRoomPage({
  params,
}: {
  params: Promise<{ artist: string }>;
}) {
  const { artist: slug } = await params;
  const artist = await fetchArtistBySlug(slug);
  if (!artist) notFound();

  const [content, promo] = await Promise.all([fetchRoom(artist.id), fetchLivePromo(artist.id)]);
  const html = renderRoomHtml(content, artist.name, !!artist.roomExtras);
  return (
    <>
      {promo && (
        // Promo bar rides ABOVE the legacy room markup so it never fights the
        // Y2K bundle. Loud on purpose — it's a deal, not a disclaimer.
        <div
          style={{
            background: "#000",
            borderTop: "2px solid #ff1493",
            borderBottom: "2px solid #ff1493",
            color: "#fff",
            textAlign: "center",
            padding: "10px 16px",
            fontFamily: "'Courier New', monospace",
            fontSize: 15,
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ color: "#ff1493", fontWeight: 700 }}>★ </span>
          <strong>{promo.title ? `${promo.title}: ` : ""}</strong>
          {promo.offer}
          {promo.ends_at ? (
            <span style={{ color: "#ff1493" }}> thru {prettyDay(promo.ends_at)}</span>
          ) : null}
          <span style={{ color: "#ff1493", fontWeight: 700 }}> ★</span>
        </div>
      )}
      <LegacyBlock html={html} />
    </>
  );
}
