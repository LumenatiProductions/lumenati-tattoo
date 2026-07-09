import type { Artist } from "@/lib/admin/types";
import type { RoomContent } from "@/lib/admin/types";

// Theme the homepage Crew section from ROOM DATA instead of the hand-coded
// hex values baked into artists-y2k.html. Each card is matched to its artist
// by the room link href (/<slug>), then its accent variables are overridden
// and its "now playing" marquee follows the artist's actual Winamp pick.

const SONG_TITLES: Record<string, string> = {
  offspring: "The Offspring -- The Kids Aren't Alright",
  goldfinger: "Goldfinger -- Superman",
  "no-doubt": "No Doubt -- Just a Girl",
  shorty: "A Day to Remember -- You Should Have Killed Me",
  outkast: "Outkast -- Ms. Jackson",
  blink182: "Blink-182 -- Mutt",
  manson: "Marilyn Manson -- The Dope Show",
};

// The playlist order inside code-injection-footer.html — the rooms hand the
// browser a song id and the widget maps it to a track index.
export const SONG_INDEX: Record<string, number> = {
  offspring: 0,
  goldfinger: 1,
  "no-doubt": 2,
  shorty: 3,
  outkast: 4,
  blink182: 5,
  manson: 6,
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// The darker gradient stop: the accent mixed 45% toward black.
const darken = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => Math.round(v * 0.55));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function themeArtistsBlock(
  html: string,
  artists: Artist[],
  rooms: Record<string, RoomContent>,
): string {
  const bySlug = new Map(artists.map((a) => [a.slug, a]));

  // Which data-color index belongs to which slug — read it off the markup so
  // reordering cards in the HTML never breaks the mapping.
  const cardRe = /<div class="lmn-artist" data-color="(\d+)">[\s\S]*?href="\/([a-z0-9-]+)"/g;
  const overrides: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html))) {
    const [, colorIdx, slug] = m;
    const artist = bySlug.get(slug);
    const room = artist ? rooms[artist.id] : undefined;
    if (!room) continue;
    const rgb = hexToRgb(room.accentColor);
    if (rgb) {
      overrides.push(
        `.lmn-artist[data-color="${colorIdx}"] { --accent: ${room.accentColor}; --accent-bg: rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.08); --title-bg: linear-gradient(90deg, ${room.accentColor}, ${darken(room.accentColor)}); }`,
      );
    }
    // The marquee: both spans carry the same text (seamless loop).
    const title = SONG_TITLES[room.songId];
    if (title) {
      const cardStart = m.index;
      const cardEnd = html.indexOf('<div class="lmn-artist"', cardStart + 10);
      const section = html.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
      const swapped = section.replace(
        /<div class="lmn-now-playing-track">[\s\S]*?<\/div>/,
        `<div class="lmn-now-playing-track"><span>&gt; ${esc(title)}</span><span>&gt; ${esc(title)}</span></div>`,
      );
      html = html.slice(0, cardStart) + swapped + (cardEnd === -1 ? "" : html.slice(cardEnd));
    }
  }
  if (overrides.length) {
    html += `\n<style>/* accents from room data — the app's color picker is the source of truth */\n${overrides.join("\n")}\n</style>`;
  }
  return html;
}
