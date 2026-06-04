import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

// The Y2K homepage is four Squarespace code blocks stacked in order. The
// site-wide bundle (Winamp, Clippy, AOL intro, etc.) is rendered by the (site)
// layout, so it is intentionally not included here.
export default function HomePage() {
  const hero = readLegacyBlock("hero-y2k.html");
  const artists = readLegacyBlock("artists-y2k.html");
  const koolAid = readLegacyBlock("kool-aid-y2k.html");
  const footer = readLegacyBlock("footer-y2k.html");
  const games = readLegacyBlock("win95-games.html");

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
