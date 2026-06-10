"use client";

import { useMemo, useState } from "react";
import { useSocial, type SocialPost } from "@/lib/admin/social-context";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle, StatCard, Badge, Dot } from "@/components/admin/ui";
import HealedQueue from "@/components/admin/HealedQueue";

export default function SocialPage() {
  const { posts, loading, error, featured, addPost, toggleFeatured, updatePost, removePost } =
    useSocial();
  const { artists } = useArtists();

  const [url, setUrl] = useState("");
  const [artistId, setArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Shop");
  }, [artists]);
  const artistColor = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.color] as const));
    return (id: string | null) => (id ? m.get(id) ?? "#999" : "#111");
  }, [artists]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setFormError(null);
    const res = await addPost({ url: url.trim(), artistId: artistId || null });
    setBusy(false);
    if (res.ok) {
      setUrl("");
      setArtistId("");
    } else {
      setFormError(res.error || "Could not add that post.");
    }
  };

  // Per-roster coverage: how many of the active artists have at least one post.
  const covered = new Set(posts.map((p) => p.artist_id).filter(Boolean)).size;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Social</h1>
        <p className="text-sm text-black/50">
          One wall for the whole roster&apos;s work. Paste a post, curate, feature the best.
        </p>
      </div>

      <HealedQueue />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Posts" value={String(posts.length)} accent />
        <StatCard label="Featured" value={String(featured.length)} tone={featured.length ? "good" : "neutral"} />
        <StatCard label="Artists covered" value={`${covered}/${artists.length}`} sub="have a post on the wall" />
        <StatCard label="Source" value="Manual" sub="auto-pull not connected yet" />
      </div>

      {/* Add by URL */}
      <Card className="mb-5">
        <form onSubmit={submit} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">
              Instagram post or reel URL
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/Cxyz…/"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="sm:w-48">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">
              Credit artist
            </span>
            <select
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Shop / unattributed</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add to wall"}
          </button>
        </form>
        {formError && <div className="px-4 pb-3 text-xs text-rose-600">{formError}</div>}
        {error && !formError && <div className="px-4 pb-3 text-xs text-amber-600">{error}</div>}
      </Card>

      {/* The wall */}
      <SectionTitle>The wall</SectionTitle>
      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading the wall…</div>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            Nothing here yet. Paste an artist&apos;s post above to start the wall.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              artistName={artistName(p.artist_id)}
              artistColor={artistColor(p.artist_id)}
              artists={artists.map((a) => ({ id: a.id, name: a.name }))}
              onFeature={(v) => toggleFeatured(p.id, v)}
              onAttribute={(id) => updatePost(p.id, { artistId: id })}
              onRemove={() => removePost(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  artistName,
  artistColor,
  artists,
  onFeature,
  onAttribute,
  onRemove,
}: {
  post: SocialPost;
  artistName: string;
  artistColor: string;
  artists: { id: string; name: string }[];
  onFeature: (v: boolean) => void;
  onAttribute: (id: string | null) => void;
  onRemove: () => void;
}) {
  return (
    <Card className={`overflow-hidden ${post.featured ? "ring-1 ring-brand/40" : ""}`}>
      {/* Media, or a link-card fallback when we have no thumbnail (no oEmbed token). */}
      <a href={post.permalink} target="_blank" rel="noreferrer" className="block">
        {post.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.media_url}
            alt={post.caption || "Instagram post"}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-black/4 text-center">
            <span className="text-xs font-semibold text-black/55">
              {post.media_type === "video" ? "Reel" : "Post"} on Instagram ↗
            </span>
            <span className="px-4 text-[11px] text-black/35">
              No preview — open to view (add a thumbnail later via Graph API)
            </span>
          </div>
        )}
      </a>

      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Dot color={artistColor} />
            <span className="truncate text-sm font-medium">{artistName}</span>
          </div>
          <Badge tone={post.source === "manual" ? "neutral" : "brand"}>{post.source}</Badge>
        </div>

        {post.caption && (
          <p className="mb-2 line-clamp-2 text-xs text-black/55">{post.caption}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <select
            value={post.artist_id ?? ""}
            onChange={(e) => onAttribute(e.target.value || null)}
            className="max-w-[55%] rounded-md border border-black/10 bg-white px-1.5 py-1 text-[11px]"
          >
            <option value="">Shop / unattributed</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onFeature(!post.featured)}
              title={post.featured ? "Unfeature" : "Feature"}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                post.featured
                  ? "bg-brand-soft text-brand"
                  : "border border-black/10 text-black/55 hover:bg-black/4"
              }`}
            >
              {post.featured ? "★ Featured" : "☆ Feature"}
            </button>
            <button
              onClick={onRemove}
              title="Remove from wall"
              className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/45 hover:bg-rose-50 hover:text-rose-600"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
