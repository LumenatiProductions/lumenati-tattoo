import { readLegacyBlock } from "@/lib/legacy";
import type { RoomContent } from "./types";

// Renders a public artist room by templating JD's room (the reference room)
// with an artist's RoomContent. JD keeps his extras (skate game + video); every
// other artist gets the same room with those JD-specific blocks stripped.
//
// We string-template the already-asset-rewritten JD markup rather than rebuild
// it in React, so all of JD's interactive code (draggable windows, etc.) is
// preserved verbatim.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

const TILTS = [-4, 3, -2, 5, -3, 2];

export function renderRoomHtml(
  content: RoomContent,
  name: string,
  isJd: boolean,
): string {
  let html = readLegacyBlock("artist-page-y2k.html");
  const firstName = name.split(" ")[0];
  const handle = content.igHandle;
  const folder = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

  // ── Accent: gradient + UI accents derive from the artist's color ──
  html = html.replace(
    "linear-gradient(135deg, #FF1493 0%, #c44a1e 25%, #e06830 50%, #d45520 75%, #c8006e 100%)",
    `linear-gradient(135deg, ${content.accentColor} 0%, #1a1320 92%)`,
  );
  html = html.split("#FF1493").join(content.accentColor);

  // ── Header: name + handle/tagline ──
  html = html.replace(
    '<h1 class="bedroom-name">J.D. Pruitt</h1>',
    `<h1 class="bedroom-name">${esc(name)}</h1>`,
  );
  html = html.replace(
    /(<div class="bedroom-handle">)[^<]*(<\/div>)/,
    `$1@${esc(handle)} // ${esc(content.tagline)}$2`,
  );

  // ── Profile photo + buddy info ──
  html = html.replace(
    /(<div class="br-profile-img">\s*<img[^>]*\bsrc=")[^"]*"/,
    `$1${escAttr(content.profilePhoto)}"`,
  );
  html = html.replace(
    '<div class="br-aim-sn">jd_pruitt</div>',
    `<div class="br-aim-sn">${esc(handle)}</div>`,
  );
  html = html.replace(
    /(<div class="br-aim-msg">)[\s\S]*?(<\/div>)/,
    `$1\n        ${esc(content.bio)}\n      $2`,
  );

  // ── Window titlebars / taskbar ──
  html = html.replace("jd_pruitt.jpg", `${esc(handle)}.jpg`);
  html = html.replace("jd_pruitt - Buddy Info", `${esc(handle)} - Buddy Info`);
  html = html.replace("JD_Pruitt", folder);
  html = html.replace("J.D.'s Room", `${esc(firstName)}'s Room`);

  // ── Instagram links ──
  html = html.split("jd.pruitt").join(handle);

  // ── Polaroids (generated from the array) ──
  const polaroids = content.polaroids
    .map((p, i) => {
      const r = TILTS[i % TILTS.length];
      return `    <div class="bedroom-polaroid" style="--r:${r}deg;transform:rotate(${r}deg);">
      <div class="polaroid-tack"></div>
      <img src="${escAttr(p.src)}" alt="">
      <span class="bedroom-polaroid-label">${esc(p.caption)}</span>
    </div>`;
    })
    .join("\n");
  html = html.replace(
    /(<div class="bedroom-polaroid-row">)[\s\S]*?<\/div>(\s*<!-- Stickers -->)/,
    `$1\n${polaroids}\n  </div>$2`,
  );

  // ── Portfolio grid (generated from the array) ──
  const thumbs = content.portfolio
    .map(
      (p) =>
        `      <div class="br-thumb"><img src="${escAttr(p.src)}" alt="${escAttr(p.alt)}"></div>`,
    )
    .join("\n");
  html = html.replace(
    /(<div class="br-portfolio-grid">)[\s\S]*?<\/div>(\s*<div class="br-portfolio-status">)/,
    `$1\n${thumbs}\n    </div>$2`,
  );
  html = html.replace(
    /<span>\d+ objects<\/span>/,
    `<span>${content.portfolio.length} objects</span>`,
  );

  // ── Strip JD-only extras for everyone else ──
  if (!isJd) {
    // Video player + skate game (contiguous: comment through the game script)
    html = html.replace(/<!-- Hidden Video Player[\s\S]*?<\/script>/, "");
    // Desktop game/skate icons
    html = html.replace(
      /<div class="br-icon"[^>]*id="jd-games-icon">[\s\S]*?<span class="br-icon-label">Games<\/span>\s*<\/div>/,
      "",
    );
    html = html.replace(
      /<div class="br-icon"[^>]*id="jd-skate-icon">[\s\S]*?<span class="br-icon-label">Skate<\/span>\s*<\/div>/,
      "",
    );
    // Mobile game/skate buttons
    html = html.replace(/<a class="bedroom-mobile-btn"[^>]*id="jd-mob-game">[\s\S]*?<\/a>\s*/, "");
    html = html.replace(/<a class="bedroom-mobile-btn"[^>]*id="jd-mob-skate">[\s\S]*?<\/a>\s*/, "");
  }

  return html;
}
