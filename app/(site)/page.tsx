import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";
import { fetchArtists } from "@/lib/admin/artists-data";
import { fetchAllRooms } from "@/lib/admin/room-data";
import { themeArtistsBlock } from "@/lib/site/theme-artists";

// The Y2K homepage is four Squarespace code blocks stacked in order. The
// site-wide bundle (Winamp, Clippy, AOL intro, etc.) is rendered by the (site)
// layout, so it is intentionally not included here. The Crew section is themed
// live from room data — accents + now-playing follow the app's picks.
export const revalidate = 300; // the crew changes rarely; cache the render

export default async function HomePage() {
  const hero = readLegacyBlock("hero-y2k.html");
  let artists = readLegacyBlock("artists-y2k.html");
  const koolAid = readLegacyBlock("kool-aid-y2k.html");
  const footer = readLegacyBlock("footer-y2k.html");
  const games = readLegacyBlock("win95-games.html");

  try {
    const [roster, rooms] = await Promise.all([fetchArtists(), fetchAllRooms()]);
    artists = themeArtistsBlock(artists, roster, rooms);
  } catch {
    /* data hiccup -> the hand-coded colors still stand */
  }

  return (
    <main>
      <LegacyBlock html={hero} />
      <LegacyBlock html={artists} />
      <LegacyBlock html={koolAid} />
      <LegacyBlock html={footer} />
      <LegacyBlock html={games} />
    </main>
  );
}