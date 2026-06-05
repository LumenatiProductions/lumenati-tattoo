// Instagram helpers for the Social feature.
//
// THE SEAM: everything that knows how to turn "an Instagram thing" into a row
// for `social_posts` lives here. Phase 1 (manual submit) only needs to parse a
// pasted URL and optionally enrich it via oEmbed. When we wire the official
// Graph API (per-artist tokens) or an aggregator, the new fetcher writes the
// SAME `ResolvedPost` shape — the API route, table, and wall don't change.

export type MediaType = "image" | "video" | "carousel";

export type ResolvedPost = {
  shortcode: string;
  permalink: string;
  mediaUrl: string | null;
  mediaType: MediaType;
  caption: string;
  authorName: string | null;
  postedAt: string | null; // ISO; null when unknown (oEmbed doesn't return it)
};

// Pull the shortcode out of any reel/post/tv URL and rebuild a canonical
// permalink. Returns null if it isn't a recognizable IG post URL.
export function parsePermalink(
  input: string,
): { shortcode: string; permalink: string; mediaType: MediaType } | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
  // /p/<code>/, /reel/<code>/, /tv/<code>/  (optionally /<user>/p/<code>/)
  const m = u.pathname.match(/\/(p|reel|tv|reels)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const shortcode = m[2];
  const mediaType: MediaType = kind === "reel" || kind === "reels" || kind === "tv" ? "video" : "image";
  return { shortcode, permalink: `https://www.instagram.com/${kind === "reels" ? "reel" : kind}/${shortcode}/`, mediaType };
}

// Best-effort enrichment via Meta's Instagram oEmbed Read endpoint.
//
// Honest caveat: this endpoint requires an app access token
// (`{app-id}|{client-token}`) set as INSTAGRAM_OEMBED_TOKEN. Without it we
// CANNOT reliably fetch a thumbnail or caption (Meta locked down anonymous
// oEmbed and the old /media/ image redirect). In that case the caller keeps
// whatever the user supplied (a pasted image URL / caption) and the wall falls
// back to a link card. No scraping — that breaks and violates IG's terms.
export async function resolveOEmbed(permalink: string): Promise<Partial<ResolvedPost>> {
  const token = process.env.INSTAGRAM_OEMBED_TOKEN;
  if (!token) return {};
  try {
    const url = new URL("https://graph.facebook.com/v21.0/instagram_oembed");
    url.searchParams.set("url", permalink);
    url.searchParams.set("omitscript", "true");
    url.searchParams.set("access_token", token);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const d = (await res.json()) as { thumbnail_url?: string; author_name?: string; title?: string };
    return {
      mediaUrl: d.thumbnail_url ?? null,
      authorName: d.author_name ?? null,
      caption: d.title ?? "",
    };
  } catch {
    return {};
  }
}

export const isOEmbedConfigured = Boolean(process.env.INSTAGRAM_OEMBED_TOKEN);
