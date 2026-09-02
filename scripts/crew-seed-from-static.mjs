#!/usr/bin/env node
// One-shot: the homepage Crew now builds from room_content, so the six
// original artists need what their hand-coded cards had: the gallery slides
// and the real Instagram links. Unions the static slides into each room's
// portfolio (dedupe on src, room's own items first) and sets ig_handle from
// the static card's link. Idempotent. Run: node scripts/crew-seed-from-static.mjs
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

const manifest = JSON.parse(fs.readFileSync(new URL("../lib/asset-manifest.json", import.meta.url), "utf8"));
const html = fs.readFileSync(new URL("../legacy/artists-y2k.html", import.meta.url), "utf8");
const cards = [...html.matchAll(/<div class="lmn-artist" data-color="\d">([\s\S]*?)(?=<div class="lmn-artist" data-color=|<\/section>)/g)].map((m) => m[1]);

const artists = await (await fetch(`${URL_}/rest/v1/artists?select=id,slug&shop_id=eq.11111111-1111-1111-1111-111111111111`, { headers: H })).json();
const bySlug = Object.fromEntries(artists.map((a) => [a.slug, a.id]));

for (const body of cards) {
  const slug = body.match(/href="\/([a-z0-9-]+)"/)[1];
  const id = bySlug[slug];
  if (!id) { console.log("skip (no artist)", slug); continue; }
  const slides = [...body.matchAll(/lmn-carousel-slide"><img src="([^"]+)"/g)].map((m) => manifest[m[1]] ?? m[1]);
  const ig = (body.match(/lmn-gallery-footer-dots"><\/div>\s*<a href="https?:\/\/(?:www\.)?instagram\.com\/([^/"]+)/) || [])[1] ?? null;

  const [room] = await (await fetch(`${URL_}/rest/v1/room_content?select=artist_id,portfolio,ig_handle&artist_id=eq.${id}`, { headers: H })).json();
  if (!room) { console.log("skip (no room)", slug); continue; }
  const have = new Set((room.portfolio ?? []).map((p) => p.src));
  const added = slides.filter((s) => !have.has(s)).map((src, i) => ({ id: `${id}-site-${i + 1}`, alt: "", src }));
  const portfolio = [...(room.portfolio ?? []), ...added];
  const patch = { portfolio };
  if (ig && ig !== room.ig_handle) patch.ig_handle = ig;
  const r = await fetch(`${URL_}/rest/v1/room_content?artist_id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) });
  console.log(slug, r.ok ? "ok" : "FAILED " + r.status, `portfolio ${room.portfolio?.length ?? 0} -> ${portfolio.length}`, ig ? `ig ${room.ig_handle} -> ${ig}` : "");
}
