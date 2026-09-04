import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock, webpifyLegacyAssets } from "@/lib/legacy";
import { fetchArtists } from "@/lib/admin/artists-data";
import { fetchAllRooms } from "@/lib/admin/room-data";
import { renderCrewBlock } from "@/lib/site/theme-artists";

// The Y2K homepage is four Squarespace code blocks stacked in order. The
// site-wide bundle (Winamp, Clippy, AOL intro, etc.) is rendered by the (site)
// layout, so it is intentionally not included here. The Crew section is BUILT
// from the roster: one card per active artist, photo/gallery/accent/song from
// their room. Add an artist in Admin -> Artists and they show up here.
export const revalidate = 60; // artists edit their rooms in the app; a minute is the most the homepage lags

export default async function HomePage() {
  const hero = readLegacyBlock("hero-y2k.html");
  let artists = readLegacyBlock("artists-y2k.html");
  const koolAid = readLegacyBlock("kool-aid-y2k.html");
  const footer = readLegacyBlock("footer-y2k.html");
  const games = readLegacyBlock("win95-games.html");
  const buddies = readLegacyBlock("buddylist-y2k.html"); // the crew's AIM buddy list, real status
  const poll = readLegacyBlock("poll-y2k.html"); // one live poll, chunky bars
  const guestbook = readLegacyBlock("guestbook-y2k.html"); // sign it, shows once the shop approves
  const homeDesk = readLegacyBlock("home-desk-y2k.html"); // lifts those windows onto the desktop, draggable

  try {
    const [roster, rooms] = await Promise.all([fetchArtists(), fetchAllRooms()]);
    artists = webpifyLegacyAssets(renderCrewBlock(artists, roster, rooms));
  } catch {
    /* data hiccup -> the hand-coded colors still stand */
  }

  return (
    <main>
      <LegacyBlock html={hero} />
      <LegacyBlock html={artists} />
      <LegacyBlock html={koolAid} />
      <LegacyBlock html={buddies} />
      <LegacyBlock html={poll} />
      <LegacyBlock html={guestbook} />
      <LegacyBlock html={footer} />
      <LegacyBlock html={homeDesk} />
      <LegacyBlock html={games} />
    </main>
  );
}