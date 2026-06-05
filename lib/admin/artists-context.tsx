"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ARTISTS as FALLBACK } from "./mock-data";
import { rowToArtist } from "./artists-data";
import type { Artist } from "./types";

type Ctx = { artists: Artist[]; loading: boolean; refresh: () => Promise<void> };
const C = createContext<Ctx>({ artists: FALLBACK, loading: true, refresh: async () => {} });

export function ArtistsProvider({ children }: { children: React.ReactNode }) {
  const [artists, setArtists] = useState<Artist[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      const { data } = await sb.from("artists").select("*").eq("active", true).order("sort");
      if (data && data.length) setArtists(data.map(rowToArtist));
    } catch {
      /* keep fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <C.Provider value={{ artists, loading, refresh: load }}>{children}</C.Provider>;
}

export const useArtists = () => useContext(C);
