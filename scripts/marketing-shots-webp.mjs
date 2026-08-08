#!/usr/bin/env node
// Convert the marketing screenshot PNGs (from marketing-shots.mjs and
// marketing-shots-artist.mjs) into the webp files /shops actually serves.
// Run after either shots script: node scripts/marketing-shots-webp.mjs

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "marketing");

// Every image referenced by app/shops/page.tsx.
const NAMES = [
  "command-center-full",
  "command-center",
  "reports",
  "payouts",
  "bookings",
  "followups",
  "app-artist-home",
  "app-artist-goals",
  "app-artist-coach",
];

for (const name of NAMES) {
  const png = join(OUT, `${name}.png`);
  if (!existsSync(png)) {
    console.log(`skip ${name} (no png)`);
    continue;
  }
  const { size } = await sharp(png).webp({ quality: 82 }).toFile(join(OUT, `${name}.webp`));
  console.log(`${name}.webp (${Math.round(size / 1024)}k)`);
}
