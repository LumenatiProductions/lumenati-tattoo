// One-shot migration: download every Squarespace-CDN image referenced by the
// legacy blocks into /public/legacy-assets and emit a manifest mapping the
// original CDN URL -> local path. lib/legacy.ts applies the manifest at read
// time so the rebuilt site stops depending on the Squarespace account.
//
// Run: node scripts/migrate-assets.mjs   (needs network)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const urls = readFileSync("/tmp/sqsp_urls.txt", "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const outDir = path.join(root, "public", "legacy-assets");
mkdirSync(outDir, { recursive: true });

function extFor(url, contentType) {
  const fname = url.split("?")[0].split("/").pop() || "";
  const m = fname.match(/\.(png|jpe?g|gif|webp|svg)$/i);
  if (m) return m[0].toLowerCase().replace("jpeg", "jpg");
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("svg")) return ".svg";
  return ".png";
}

const manifest = {};
let ok = 0;
const failures = [];

for (let i = 0; i < urls.length; i++) {
  const url = urls[i];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      failures.push(`${res.status} ${url}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFor(url, res.headers.get("content-type"));
    const name = `sqsp-${String(i).padStart(3, "0")}${ext}`;
    writeFileSync(path.join(outDir, name), buf);
    manifest[url] = `/legacy-assets/${name}`;
    ok++;
  } catch (e) {
    failures.push(`ERR ${url} :: ${e.message}`);
  }
}

writeFileSync(
  path.join(root, "lib", "asset-manifest.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`downloaded OK: ${ok} / ${urls.length}`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  " + f);
}
