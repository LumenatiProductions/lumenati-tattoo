"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { RoomContent } from "./types";
import { ROOM_CONTENT } from "./room-seed";
import { fetchAllRooms, saveRoom } from "./room-data";
import { isSupabaseConfigured } from "@/lib/supabase";

// Re-export seed lookups so existing imports (`from room-content`) keep working.
export { SONGS, COLOR_PRESETS, ROOM_CONTENT, songLabel } from "./room-seed";

// Provider: edits apply optimistically, then persist. With Supabase configured
// they upsert to the DB (debounced); otherwise they fall back to localStorage.
// Same go-live semantics either way.
type RoomCtx = {
  get: (artistId: string) => RoomContent;
  update: (artistId: string, patch: Partial<RoomContent>) => void;
  ready: boolean;
};
const Ctx = createContext<RoomCtx | null>(null);
const KEY = "lum-rooms";

export function RoomContentProvider({ children }: { children: React.ReactNode }) {
  const [rooms, setRooms] = useState<Record<string, RoomContent>>(ROOM_CONTENT);
  const [ready, setReady] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let alive = true;
    if (isSupabaseConfigured) {
      fetchAllRooms().then((r) => {
        if (alive) {
          setRooms(r);
          setReady(true);
        }
      });
    } else {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) setRooms({ ...ROOM_CONTENT, ...JSON.parse(raw) });
      } catch {
        /* ignore */
      }
      setReady(true);
    }
    return () => {
      alive = false;
    };
  }, []);

  const get = (artistId: string) => rooms[artistId] ?? ROOM_CONTENT[artistId];

  const update = (artistId: string, patch: Partial<RoomContent>) => {
    const next = { ...get(artistId), ...patch };
    setRooms((prev) => ({ ...prev, [artistId]: next }));

    if (isSupabaseConfigured) {
      // Debounce DB writes so we don't upsert on every keystroke.
      clearTimeout(timers.current[artistId]);
      timers.current[artistId] = setTimeout(() => {
        saveRoom(next).catch(() => {/* surfaced later via a save indicator */});
      }, 600);
    } else {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ ...rooms, [artistId]: next }),
        );
      } catch {
        console.warn("Room content too large to persist locally; lands with Supabase Storage.");
      }
    }
  };

  return <Ctx.Provider value={{ get, update, ready }}>{children}</Ctx.Provider>;
}

export function useRoomContent(): RoomCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRoomContent must be used within RoomContentProvider");
  return c;
}
