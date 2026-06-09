"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type SocialPost = {
  id: string;
  artist_id: string | null;
  platform: string;
  external_id: string | null;
  permalink: string;
  media_url: string | null;
  media_type: "image" | "video" | "carousel";
  caption: string;
  source: "manual" | "graph" | "aggregator" | "hashtag";
  featured: boolean;
  posted_at: string | null;
  submitted_by: string | null;
  created_at: string;
  fetched_at: string;
};

type SocialCtx = {
  posts: SocialPost[];
  loading: boolean;
  error: string | null;
  featured: SocialPost[];
  refresh: () => Promise<void>;
  addPost: (input: {
    url: string;
    artistId?: string | null;
    caption?: string;
    mediaUrl?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  toggleFeatured: (id: string, featured: boolean) => Promise<void>;
  updatePost: (id: string, patch: { caption?: string; artistId?: string | null }) => Promise<void>;
  removePost: (id: string) => Promise<void>;
};

const Ctx = createContext<SocialCtx>({
  posts: [],
  loading: true,
  error: null,
  featured: [],
  refresh: async () => {},
  addPost: async () => ({ ok: false }),
  toggleFeatured: async () => {},
  updatePost: async () => {},
  removePost: async () => {},
});

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/social");
      const d = await r.json();
      if (r.ok) {
        setPosts(d.posts || []);
        setError(null);
      } else {
        setError(d.error || "Could not load the feed.");
      }
    } catch {
      setError("Could not load the feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPost: SocialCtx["addPost"] = useCallback(
    async (input) => {
      const r = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not add that post." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  // Mutations are optimistic; the refresh in `finally` re-pulls the truth, so a
  // failed call (network drop, RLS) reverts the UI instead of lying.
  const toggleFeatured: SocialCtx["toggleFeatured"] = useCallback(
    async (id, featured) => {
      setPosts((p) => p.map((x) => (x.id === id ? { ...x, featured } : x)));
      try {
        await fetch("/api/social", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, featured }),
        });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const updatePost: SocialCtx["updatePost"] = useCallback(
    async (id, patch) => {
      try {
        await fetch("/api/social", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, caption: patch.caption, artistId: patch.artistId }),
        });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const removePost: SocialCtx["removePost"] = useCallback(
    async (id) => {
      setPosts((p) => p.filter((x) => x.id !== id));
      try {
        await fetch(`/api/social?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const featured = posts.filter((p) => p.featured);

  return (
    <Ctx.Provider
      value={{ posts, loading, error, featured, refresh, addPost, toggleFeatured, updatePost, removePost }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSocial = () => useContext(Ctx);
