import type { RoomContent } from "./types";

// Seed/mock room content + small lookups. No React here so both the client
// provider (room-content.tsx) and the data layer (room-data.ts) can import it
// without a circular dependency.

// Songs the Winamp player knows about (files live in /public/audio).
export const SONGS: { id: string; label: string }[] = [
  { id: "offspring", label: "The Offspring - The Kids Aren't Alright" },
  { id: "goldfinger", label: "Goldfinger - Superman" },
  { id: "no-doubt", label: "No Doubt - Just a Girl" },
  { id: "shorty", label: "A Day to Remember - You Should Have Killed Me" },
  { id: "outkast", label: "Outkast - Ms. Jackson" },
  { id: "blink182", label: "Blink-182 - Mutt" },
  { id: "manson", label: "Marilyn Manson - The Dope Show" },
];

// Preset accent swatches (the crew's colors + a couple extra).
export const COLOR_PRESETS = [
  "#FF1493", "#FFD700", "#7FFF00", "#1493FF", "#9b59b6", "#FF6347",
  "#00E0C0", "#FF8A00", "#B026FF",
];

const pf = (id: string, src: string, alt: string) => ({ id, src, alt });
const pol = (id: string, src: string, caption: string) => ({ id, src, caption });

// Seed content pulled from the real rooms (images mapped to /legacy-assets).
// Mirrors supabase/schema.sql seed.
export const ROOM_CONTENT: Record<string, RoomContent> = {
  jd: {
    artistId: "jd",
    tagline: "skater // gamer // bold color tattoos",
    bio: "what's up, I'm JD. i do big bold colorful tattoos. when i'm not tattooing i'm probably skating or gaming. DM me to book something rad or just swing by the shop -- i'm the nice one :)",
    igHandle: "jd.pruitt",
    songId: "goldfinger",
    accentColor: "#FF1493",
    profilePhoto: "/legacy-assets/sqsp-000.jpg",
    polaroids: [
      pol("jd-p1", "/legacy-assets/sqsp-021.jpg", "@ the shop"),
      pol("jd-p2", "/legacy-assets/sqsp-010.jpg", "<3 Penny"),
      pol("jd-p3", "/legacy-assets/sqsp-025.jpg", "vibes :)"),
    ],
    portfolio: [
      pf("jd-f1", "/legacy-assets/sqsp-003.jpg", "color piece"),
      pf("jd-f2", "/legacy-assets/sqsp-001.jpg", "black & grey"),
      pf("jd-f3", "/legacy-assets/sqsp-029.jpg", "flash"),
    ],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
  elaine: {
    artistId: "elaine",
    tagline: "fine line // florals // electric energy",
    bio: "Electric Elaine. delicate fine-line and florals with a little electricity in them. small pieces, big pieces, first tattoos welcome. DM me on IG to book or swing by the shop and say hi.",
    igHandle: "electric.elaine",
    songId: "no-doubt",
    accentColor: "#FFD700",
    profilePhoto: "/legacy-assets/sqsp-034.jpg",
    polaroids: [],
    portfolio: [pf("el-f1", "/legacy-assets/sqsp-034.jpg", "fine line")],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
  shorty: {
    artistId: "shorty",
    tagline: "bold // traditional // loud",
    bio: "ShorTy. bold traditional, the kind that still reads from across the room in twenty years. flash always on the wall, walk-ins always welcome. DM to book or just show up.",
    igHandle: "shorty.tattoo",
    songId: "shorty",
    accentColor: "#7FFF00",
    profilePhoto: "/legacy-assets/sqsp-031.png",
    polaroids: [],
    portfolio: [],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
  kalypso: {
    artistId: "kalypso",
    tagline: "color // realism // royalty",
    bio: "King Kalypso. color realism -- portraits, animals, anything that needs to look alive on skin. bring your reference and let's build it. DM to book a consult.",
    igHandle: "king.kalypso",
    songId: "outkast",
    accentColor: "#1493FF",
    profilePhoto: "/legacy-assets/sqsp-063.png",
    polaroids: [],
    portfolio: [],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
  sam: {
    artistId: "sam",
    tagline: "blackwork // illustrative // clean lines",
    bio: "Sam Durbin-Clark. illustrative blackwork. swing by or DM to book.",
    igHandle: "sam.durbinclark",
    songId: "blink182",
    accentColor: "#9b59b6",
    profilePhoto: "/legacy-assets/sqsp-075.jpg",
    polaroids: [pol("sam-p1", "/legacy-assets/sqsp-076.jpg", "studio")],
    portfolio: [
      pf("sam-f1", "/legacy-assets/sqsp-077.jpg", "blackwork"),
      pf("sam-f2", "/legacy-assets/sqsp-076.jpg", "lines"),
    ],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
  moonie: {
    artistId: "moonie",
    tagline: "dark // surreal // dreamy",
    bio: "Moonie B. Jones, guest spot. dark, surreal, dreamy pieces -- if it feels like a fever dream, that's the point. limited dates while I'm in town, DM to grab one.",
    igHandle: "moonie.b.jones",
    songId: "manson",
    accentColor: "#FF6347",
    profilePhoto: "/legacy-assets/sqsp-087.png",
    polaroids: [],
    portfolio: [],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: null,
    layout: null,
    socials: null,
  },
};

export const songLabel = (id: string) =>
  SONGS.find((s) => s.id === id)?.label ?? id;
