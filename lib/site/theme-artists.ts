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


// ---------------------------------------------------------------------------
// The Crew, built from the roster instead of the six hand-coded cards.
//
// Every active artist gets a card: accent + now-playing from their room,
// profile photo + gallery from what they set in My Page, room link by slug.
// The card markup mirrors artists-y2k.html exactly so the block's own CSS
// and JS (lmnToggle, lmnSlide, lightbox) keep working untouched. New artist
// added in Admin -> Artists = new card here on the next render.
// ---------------------------------------------------------------------------

const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const igUrl = (handle: string | null | undefined, socials: Record<string, string> | null | undefined) => {
  const raw = (socials?.instagram || handle || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.instagram.com/${raw.replace(/^@/, "").replace(/\/$/, "")}/`;
};

function crewCard(idx: number, artist: Artist, room: RoomContent): string {
  const slug = artist.slug;
  const exe = `${slug.replace(/-/g, "_")}.exe`;
  const song = SONG_TITLES[room.songId] ?? SONG_TITLES.offspring;
  const gallery = room.portfolio.map((p) => p.src).filter(Boolean);
  const ig = igUrl(room.igHandle, room.socials);
  const slides = gallery
    .map((src) => `            <div class="lmn-carousel-slide"><img src="${escAttr(src)}" alt=""></div>`)
    .join("\n");
  const galleryBlock = gallery.length
    ? `    <div class="lmn-gallery-wrap">
      <div class="lmn-carousel" data-index="0">
        <div class="lmn-carousel-track-wrap">
          <div class="lmn-carousel-track">
${slides}
          </div>
        </div>
        <div class="lmn-carousel-btn prev" onclick="event.stopPropagation();lmnSlide(this,-1)">&#9664;</div>
        <div class="lmn-carousel-btn next" onclick="event.stopPropagation();lmnSlide(this,1)">&#9654;</div>
      </div>
      <div class="lmn-gallery-footer">
        <div class="lmn-gallery-footer-dots"></div>
        ${ig ? `<a href="${escAttr(ig)}" target="_blank">view more &rarr;</a>` : "<span></span>"}
      </div>
    </div>`
    : `    <div class="lmn-gallery-wrap">
      <div class="lmn-gallery-footer">
        <div class="lmn-gallery-footer-dots"></div>
        ${ig ? `<a href="${escAttr(ig)}" target="_blank">view more &rarr;</a>` : "<span></span>"}
      </div>
    </div>`;
  const photo = room.profilePhoto || "/brand/lumenati-on-dark.svg";
  return `  <!-- ${esc(artist.name.toUpperCase())} -->
  <div class="lmn-artist" data-color="${idx}">
    <div class="lmn-titlebar" onclick="lmnToggle(this)">
      <div class="lmn-titlebar-left">
        <div class="lmn-titlebar-icon">&#10022;</div>
        <span class="lmn-titlebar-text">${esc(exe)}</span>
      </div>
      <div class="lmn-titlebar-btns">
        <div class="lmn-titlebar-btn">_</div>
        <div class="lmn-titlebar-btn">&#9633;</div>
        <div class="lmn-titlebar-btn close">&times;</div>
      </div>
    </div>
    <div class="lmn-win-content" onclick="lmnToggle(this.previousElementSibling)">
      <div class="lmn-artist-img-wrap">
        <img src="${escAttr(photo)}" alt="${escAttr(artist.name)}">
      </div>
      <div class="lmn-artist-info">
        <div class="lmn-name-group">
          <span class="lmn-artist-name">${esc(artist.name)}</span>
          <div class="lmn-now-playing"><div class="lmn-now-playing-track"><span>&gt; ${esc(song)}</span><span>&gt; ${esc(song)}</span></div></div>
        </div>
        <div class="lmn-artist-meta">
          <a class="lmn-artist-room" href="/${escAttr(slug)}" onclick="event.stopPropagation()">Hang out in ${esc(firstName(artist.name))}&#39;s room &gt;&gt;</a>
          <div class="lmn-toggle">+</div>
        </div>
      </div>
    </div>
${galleryBlock}
  </div>
`;
}

/**
 * Replace the hand-coded cards inside <section class="lmn-artists"> with one
 * card per active artist. Falls back to the original markup (themed) if the
 * section can't be located, so the homepage never comes up empty.
 */
export function renderCrewBlock(html: string, artists: Artist[], rooms: Record<string, RoomContent>): string {
  const start = html.indexOf('<div class="lmn-artist" data-color=');
  const end = html.indexOf("</section>", start);
  if (start === -1 || end === -1 || !artists.length) return themeArtistsBlock(html, artists, rooms);

  const emptyRoom = (a: Artist): RoomContent => ({
    artistId: a.id,
    tagline: "",
    bio: "",
    igHandle: "",
    songId: "offspring",
    accentColor: a.color || "#FF1493",
    profilePhoto: "",
    polaroids: [],
    portfolio: [],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    socials: null,
  });

  const cards: string[] = [];
  const overrides: string[] = [];
  artists.forEach((a, i) => {
    const room = rooms[a.id] ?? emptyRoom(a);
    cards.push(crewCard(i, a, room));
    const accent = room.accentColor || a.color || "#FF1493";
    const rgb = hexToRgb(accent);
    if (rgb) {
      overrides.push(
        `.lmn-artist[data-color="${i}"] { --accent: ${accent}; --accent-bg: rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.08); --title-bg: linear-gradient(90deg, ${accent}, ${darken(accent)}); }`,
      );
    }
  });

  let out = html.slice(0, start) + cards.join("\n") + html.slice(end);
  out = out.replace(/\[ \d+ \]<\/span>/, `[ ${String(artists.length).padStart(2, "0")} ]</span>`);
  out += `\n<style>/* accents from room data */\n${overrides.join("\n")}\n</style>`;
  return out;
}
