import LegacyBlock from "@/components/LegacyBlock";
import { notFound } from "next/navigation";
import { fetchRoom } from "@/lib/admin/room-data";
import { fetchArtistBySlug } from "@/lib/admin/artists-data";
import { renderRoomHtml } from "@/lib/admin/render-room";

// One dynamic route for every artist room (/<slug>). The roster lives in the
// DB, so adding an artist gives them a live room here automatically. Static
// routes (/book, /contact) take precedence over this dynamic segment.
export const dynamic = "force-dynamic";

export default async function ArtistRoomPage({
  params,
}: {
  params: Promise<{ artist: string }>;
}) {
  const { artist: slug } = await params;
  const artist = await fetchArtistBySlug(slug);
  if (!artist) notFound();

  const content = await fetchRoom(artist.id);
  const html = renderRoomHtml(content, artist.name, !!artist.roomExtras);
  return <LegacyBlock html={html} />;
}
