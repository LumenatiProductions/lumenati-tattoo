import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import assetManifest from "./asset-manifest.json";

// Squarespace-CDN image URL -> local /legacy-assets path, produced by
// scripts/migrate-assets.mjs. Longest URLs first so a base URL can't shadow a
// size-variant (?format=750w vs ?format=500w) during replacement.
const assetEntries = Object.entries(assetManifest as Record<string, string>).sort(
  (a, b) => b[0].length - a[0].length,
);


// Optimized copies: scripts/optimize-legacy-assets.mjs writes a capped WebP
// beside each Squarespace-era image. Any markup that names the original
// (manifest hits, hard-coded paths, room_content rows) gets the WebP instead.
const webpStems = new Set(
  (() => {
    try {
      return readdirSync(path.join(process.cwd(), "public", "legacy-assets"))
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(/\.webp$/, ""));
    } catch {
      return [] as string[];
    }
  })(),
);
export function webpifyLegacyAssets(html: string): string {
  return html.replace(/\/legacy-assets\/([A-Za-z0-9_-]+)\.(png|jpe?g)\b/g, (m, stem) =>
    webpStems.has(stem) ? `/legacy-assets/${stem}.webp` : m,
  );
}

/**
 * Reads a legacy Squarespace block out of /legacy and returns its raw HTML.
 *
 * The Y2K site was authored as standalone HTML blocks pasted into Squarespace
 * code-injection slots. We keep those files as the editable source of truth and
 * inline their contents at build time (the public pages are statically
 * generated, so this runs during `next build`, not per-request).
 *
 * While reading, we rewrite the old hosting paths to their new homes so the
 * rebuild stops depending on the Squarespace account / GitHub repo:
 *   - audio from raw.githubusercontent.com/.../main/<file> -> /audio/<file>
 *   - images from images.squarespace-cdn.com -> /legacy-assets/... (via manifest)
 */
export function readLegacyBlock(name: string): string {
  const file = path.join(process.cwd(), "legacy", name);
  let html = readFileSync(file, "utf8");

  // Audio used to be pulled straight from the GitHub repo root; it now lives in
  // /public/audio and is served from the site itself.
  html = html.replace(
    /https:\/\/raw\.githubusercontent\.com\/LumenatiProductions\/lumenati-tattoo\/main\//g,
    "/audio/",
  );

  // Images: swap each known CDN URL for its downloaded local copy.
  for (const [cdnUrl, localPath] of assetEntries) {
    if (html.includes(cdnUrl)) html = html.split(cdnUrl).join(localPath);
  }
  html = webpifyLegacyAssets(html);

  // Every legacy image defers until it scrolls near the viewport. The blocks
  // are injected client-side after mount anyway, so nothing here is LCP; the
  // rooms carry ~90 images each and this keeps the fold from paying for the
  // whole wall.
  html = html.replace(/<img (?![^>]*loading=)/g, '<img loading="lazy" decoding="async" ');

  return html;
}
