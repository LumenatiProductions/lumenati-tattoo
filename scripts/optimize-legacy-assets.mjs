// Shrinks the Squarespace-era images the Y2K site ships. The originals are up
// to 1600px JPGs and 500px PNG stickers shown at 100-300px; this writes a WebP
// next to each (longest side capped, alpha kept) and points the asset manifest
// at it. Originals stay on disk: room_content rows and older pages may still
// name them directly.
//
//   node scripts/optimize-legacy-assets.mjs            (writes)
//   node scripts/optimize-legacy-assets.mjs --dry      (reports only)
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const dry = process.argv.includes("--dry");
const MAX = 720; // longest side; the biggest display size on the site is ~450 css px
const manifestPath = path.join(process.cwd(), "lib/asset-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let before = 0, after = 0, n = 0;
for (const [cdn, local] of Object.entries(manifest)) {
  // The manifest may already point at the .webp; the original sits beside it.
  const stem = local.replace(/\.(png|jpe?g|webp)$/i, "");
  const orig = ["png", "jpg", "jpeg"].map((e) => path.join(process.cwd(), "public", `${stem}.${e}`)).find((f) => existsSync(f));
  if (!orig) continue;
  const src = orig;
  const out = path.join(process.cwd(), "public", `${stem}.webp`);
  const meta = await sharp(src).metadata();
  const hasAlpha = !!meta.hasAlpha;
  const img = sharp(src).rotate().resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
    .webp(hasAlpha ? { quality: 76, alphaQuality: 72, effort: 6 } : { quality: 76, effort: 6 });
  const buf = await img.toBuffer();
  const b = statSync(src).size;
  before += b; after += buf.length; n++;
  if (!dry) { writeFileSync(out, buf); manifest[cdn] = `${stem}.webp`; }
  console.log(`${local} ${meta.width}x${meta.height} ${(b/1024).toFixed(0)}k -> ${(buf.length/1024).toFixed(0)}k`);
}
if (!dry) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${n} images: ${(before/1024/1024).toFixed(2)}MB -> ${(after/1024/1024).toFixed(2)}MB${dry ? " (dry run)" : ""}`);
