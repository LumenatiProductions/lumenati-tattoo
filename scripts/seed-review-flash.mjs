#!/usr/bin/env node
// Fill out the App Review demo tenant's showcase artist (Sam Rivera,
// /s/apple-review/sam-rivera) so all three page skins have real content to
// render: a profile photo, a portfolio, and a flash sheet with one claimed
// piece. Demo shop only — touches nothing outside apple-review. Re-runnable:
// flash rows are keyed on src and skipped if present.
// Run: node scripts/seed-review-flash.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ARTIST = "apple-review--sam-rivera";
const { data: shop } = await db.from("shops").select("id").eq("slug", "apple-review").maybeSingle();
if (!shop) throw new Error("apple-review shop not found — run provision-review-account.mjs first");

const pf = (id, src, alt) => ({ id, src, alt });
const { error: rcErr } = await db
  .from("room_content")
  .update({
    profile_photo: "/legacy-assets/sqsp-075.jpg",
    portfolio: [
      pf("sr-1", "/legacy-assets/sqsp-077.jpg", "blackwork"),
      pf("sr-2", "/legacy-assets/sqsp-076.jpg", "traditional"),
      pf("sr-3", "/legacy-assets/sqsp-024.png", "color back piece"),
      pf("sr-4", "/legacy-assets/sqsp-045.png", "dotwork spine"),
      pf("sr-5", "/legacy-assets/sqsp-046.png", "peony"),
      pf("sr-6", "/legacy-assets/sqsp-051.png", "florals"),
    ],
  })
  .eq("artist_id", ARTIST);
if (rcErr) throw new Error("room_content: " + rcErr.message);

// Re-seedable: wipe the demo artist's sheet and lay it down fresh.
const { error: delErr } = await db.from("flash_pieces").delete().eq("artist_id", ARTIST);
if (delErr) throw new Error("flash_pieces delete: " + delErr.message);
const FLASH = [
  { src: "/legacy-assets/sqsp-044.png", title: "Dagger + top hat", price_cents: 18000, status: "available" },
  { src: "/legacy-assets/sqsp-056.png", title: "All-seeing heart", price_cents: 15000, status: "available" },
  { src: "/legacy-assets/sqsp-057.png", title: "Diamond dagger", price_cents: 22000, status: "available" },
  { src: "/legacy-assets/sqsp-043.png", title: "Rose heart", price_cents: 20000, status: "claimed" },
];
for (const f of FLASH) {
  const { error } = await db.from("flash_pieces").insert({ ...f, artist_id: ARTIST, shop_id: shop.id });
  if (error) throw new Error("flash_pieces: " + error.message);
}
console.log("Sam Rivera's showcase content is in: profile, 6 portfolio shots, 4 flash pieces (1 claimed).");
