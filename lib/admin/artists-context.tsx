"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ARTISTS as FALLBACK } from "./mock-data";
import { rowToArtist } from "./artists-data";
import type { Artist } from "./types";

type Ctx = { artists: Artist[]; loading: boolean; refresh: () => Promise<void> };
const C = createContext<Ctx>({ artists: FALLBACK, loading: true, refresh: async () => {} });

export function ArtistsProvider({ shopId, children }: { shopId?: string | null; children: React.ReactNode }) {
  const [artists, setArtists] = useState<Artist[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      // artists is public-read; RLS does not wall shops apart, so the roster
      // MUST scope to the viewer's shop (same gotcha as app-native).
      let q = sb.from("artists").select("*").eq("active", true);
      if (shopId) q = q.eq("shop_id", shopId);
      const { data } = await q.order("sort");
      // Scoped reads trust an empty roster; the mock fallback is only for
      // Supabase being unreachable/unconfigured (Lumenati dev).
      if (data && (data.length || shopId)) setArtists(data.map(rowToArtist));
    } catch {
      /* keep fallback */
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  return <C.Provider value={{ artists, loading, refresh: load }}>{children}</C.Provider>;
}

export const useArtists = () => useContext(C);
