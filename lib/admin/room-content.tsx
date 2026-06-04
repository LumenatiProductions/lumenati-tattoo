"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { RoomContent } from "./types";

// Songs the Winamp player knows about (files live in /public/audio).
export const SONGS: { id: string; label: string }[] = [
  { id: "offspring", label: "The Offspring — The Kids Aren't Alright" },
  { id: "goldfinger", label: "Goldfinger — Superman" },
  { id: "no-doubt", label: "No Doubt — Just a Girl" },
  { id: "shorty", label: "A Day to Remember — You Should Have Killed Me" },
  { id: "outkast", label: "Outkast — Ms. Jackson" },
  { id: "blink182", label: "Blink-182 — Mutt" },
  { id: "manson", label: "Marilyn Manson — The Dope Show" },
];

// Preset accent swatches (the crew's colors + a couple extra).
export const COLOR_PRESETS = [
  "#FF1493", "#FFD700", "#7FFF00", "#1493FF", "#9b59b6", "#FF6347",
  "#00E0C0", "#FF8A00", "#B026FF",
];

const pf = (src: string, alt: string) => ({ id: src, src, alt });
const pol = (src: string, caption: string) => ({ id: src, src, caption });

// Seed content pulled from the real rooms (images mapped to /legacy-assets).
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
      pol("/legacy-assets/sqsp-021.jpg", "@ the shop"),
      pol("/legacy-assets/sqsp-010.jpg", "<3 Penny"),
      pol("/legacy-assets/sqsp-025.jpg", "vibes :)"),
    ],
    portfolio: [
      pf("/legacy-assets/sqsp-003.jpg", "color piece"),
      pf("/legacy-assets/sqsp-001.jpg", "black & grey"),
      pf("/legacy-assets/sqsp-029.jpg", "flash"),
    ],
  },
  elaine: {
    artistId: "elaine",
    tagline: "fine line // florals // electric energy",
    bio: "Electric Elaine here. delicate fine-line and floral work. tap edit and make this your own :)",
    igHandle: "electric.elaine",
    songId: "no-doubt",
    accentColor: "#FFD700",
    profilePhoto: "/legacy-assets/sqsp-034.jpg",
    polaroids: [],
    portfolio: [pf("/legacy-assets/sqsp-034.jpg", "fine line")],
  },
  shorty: {
    artistId: "shorty",
    tagline: "bold // traditional // loud",
    bio: "ShorTy. traditional and bold. this is a starter bio — edit me from the command center.",
    igHandle: "shorty.tattoo",
    songId: "shorty",
    accentColor: "#7FFF00",
    profilePhoto: "/legacy-assets/sqsp-031.png",
    polaroids: [],
    portfolio: [],
  },
  kalypso: {
    artistId: "kalypso",
    tagline: "color // realism // royalty",
    bio: "King Kalypso. color realism. edit this to tell your story.",
    igHandle: "king.kalypso",
    songId: "outkast",
    accentColor: "#1493FF",
    profilePhoto: "/legacy-assets/sqsp-063.png",
    polaroids: [],
    portfolio: [],
  },
  sam: {
    artistId: "sam",
    tagline: "blackwork // illustrative // clean lines",
    bio: "Sam Durbin-Clark. illustrative blackwork. swing by or DM to book.",
    igHandle: "sam.durbinclark",
    songId: "blink182",
    accentColor: "#9b59b6",
    profilePhoto: "/legacy-assets/sqsp-075.jpg",
    polaroids: [pol("/legacy-assets/sqsp-076.jpg", "studio")],
    portfolio: [
      pf("/legacy-assets/sqsp-077.jpg", "blackwork"),
      pf("/legacy-assets/sqsp-076.jpg", "lines"),
    ],
  },
  moonie: {
    artistId: "moonie",
    tagline: "dark // surreal // dreamy",
    bio: "Moonie B. Jones, guest spot. dark surreal pieces. edit me!",
    igHandle: "moonie.b.jones",
    songId: "manson",
    accentColor: "#FF6347",
    profilePhoto: "/legacy-assets/sqsp-087.png",
    polaroids: [],
    portfolio: [],
  },
};

// ── Provider: edits persist to localStorage immediately (go-live semantics).
// Swaps onto Supabase later without changing the editor UI. ──
type RoomCtx = {
  get: (artistId: string) => RoomContent;
  update: (artistId: string, patch: Partial<RoomContent>) => void;
};
const Ctx = createContext<RoomCtx | null>(null);
const KEY = "lum-rooms";

export function RoomContentProvider({ children }: { children: React.ReactNode }) {
  const [rooms, setRooms] = useState<Record<string, RoomContent>>(ROOM_CONTENT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRooms({ ...ROOM_CONTENT, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Record<string, RoomContent>) => {
    setRooms(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Quota (e.g. big data-URL photos) — keep it in session, warn once.
      console.warn("Room content too large to persist locally; lands with Supabase Storage.");
    }
  };

  const get = (artistId: string) => rooms[artistId] ?? ROOM_CONTENT[artistId];
  const update = (artistId: string, patch: Partial<RoomContent>) =>
    persist({ ...rooms, [artistId]: { ...get(artistId), ...patch } });

  return <Ctx.Provider value={{ get, update }}>{children}</Ctx.Provider>;
}

export function useRoomContent(): RoomCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRoomContent must be used within RoomContentProvider");
  return c;
}

export const songLabel = (id: string) =>
  SONGS.find((s) => s.id === id)?.label ?? id;
