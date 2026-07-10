import { readFileSync } from "node:fs";
import path from "node:path";
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

// The sticker catalog — every artist picks from the same sheet. Ids are
// stable; the app's picker mirrors this list.
export const STICKER_CATALOG = [
  { id: "bolt", src: "/legacy-assets/sqsp-013.png" },
  { id: "8ball", src: "/legacy-assets/sqsp-002.png" },
  { id: "skateboard", src: "/legacy-assets/sqsp-015.png" },
  { id: "rainbow", src: "/legacy-assets/sqsp-022.png" },
  { id: "smilie", src: "/legacy-assets/sqsp-014.png" },
  { id: "tongue", src: "/legacy-assets/sqsp-020.png" },
  { id: "stars", src: "/legacy-assets/sqsp-030.png" },
] as const;

// The five designed sticker spots and four poster spots — positions are part
// of the room's look; picks fill them in order.
// The arcade catalog — every artist picks one game for their room. The skate
// game lives in the template (JD's default); the rest live in legacy/games/
// as drop-in IIFEs that share the template's window shell. The app's picker
// mirrors id + label.
export const GAME_CATALOG = [
  { id: "skate", label: "Skate", exe: "sk8_or_die.exe", hint: "SPACE to ollie" },
  { id: "snake", label: "Ink Snake", exe: "inksnake.exe", hint: "Arrows or swipe to steer" },
  { id: "bricks", label: "Flash Breaker", exe: "flashbreak.exe", hint: "Arrows or drag to move" },
  { id: "shooter", label: "Sterile!", exe: "sterile.exe", hint: "Arrows move, SPACE fires" },
  { id: "pong", label: "Needle Pong", exe: "needlepong.exe", hint: "W/S or drag to move", statA: "You", statB: "CPU" },
  { id: "frogger", label: "Walk-In", exe: "walkin.exe", hint: "Arrows or tap to hop" },
] as const;

function readGameScript(id: string): string {
  return readFileSync(path.join(process.cwd(), "legacy", "games", `${id}.js`), "utf8").trimEnd();
}

const STICKER_SLOTS = [
  "top:6%;right:6%;transform:rotate(-12deg);width:120px",
  "top:45%;left:2%;transform:rotate(15deg);width:100px",
  "top:20%;right:2%;transform:rotate(-20deg);width:110px",
  "top:55%;right:8%;transform:rotate(8deg);width:105px",
  "top:30%;left:3%;transform:rotate(-8deg);width:90px",
  "bottom:20%;right:4%;transform:rotate(14deg);width:95px",
  "top:8%;left:15%;transform:rotate(6deg);width:100px",
];
const POSTER_SLOTS = [
  "top:18%;right:3%;transform:rotate(2deg);width:180px;",
  "top:3%;right:15%;transform:rotate(-3deg);width:160px;",
  "top:calc(22% - 70px);left:8%;transform:rotate(4deg);width:300px;",
  "top:55%;left:4%;transform:rotate(-5deg);width:140px;",
];

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
      <img loading="lazy" decoding="async" src="${escAttr(p.src)}" alt="">
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
        `      <div class="br-thumb"><img loading="lazy" decoding="async" src="${escAttr(p.src)}" alt="${escAttr(p.alt)}"></div>`,
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

  // ── Arcade + video: every room gets what its artist picked ──
  // NULL keeps today's behavior: JD's room ships the skate game + his Vimeo
  // clip, everyone else has neither window.
  const game =
    content.gameId && GAME_CATALOG.some((g) => g.id === content.gameId)
      ? content.gameId
      : isJd
        ? "skate"
        : null;
  const hasVideo = !!content.videoUrl || isJd;

  // Video first: its strip regex needs the game block's comment as a boundary.
  if (!hasVideo) {
    html = html.replace(/<!-- Hidden Video Player[\s\S]*?(?=<!-- Hidden Game -->)/, "");
    html = html.replace(
      /<div class="br-icon"[^>]*id="jd-skate-icon">[\s\S]*?<span class="br-icon-label">Skate<\/span>\s*<\/div>/,
      "",
    );
    html = html.replace(/<a class="bedroom-mobile-btn"[^>]*id="jd-mob-skate">[\s\S]*?<\/a>\s*/, "");
  } else if (content.videoUrl) {
    // An uploaded clip replaces the Vimeo iframe inside the same WMP chrome.
    const file = `${handle.replace(/[^A-Za-z0-9]+/g, "_") || "room"}_edit.avi`;
    html = html.replace("Windows Media Player — jd_skate_edit.avi", `Windows Media Player — ${esc(file)}`);
    html = html.replace("Playing - jd_skate_edit.avi", `Playing - ${esc(file)}`);
    html = html.replace(
      /<iframe id="jd-vimeo"[\s\S]*?<\/iframe>/,
      () =>
        `<video id="jd-room-video" src="${escAttr(content.videoUrl!)}" autoplay loop muted playsinline style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;background:#000;"></video>`,
    );
    // The close button resets the iframe; a <video> just pauses.
    html = html.replace(
      "document.getElementById('jd-video-overlay').style.display='none';document.getElementById('jd-vimeo').src=document.getElementById('jd-vimeo').src;",
      "document.getElementById('jd-video-overlay').style.display='none';var v=document.getElementById('jd-room-video');if(v)v.pause();",
    );
    if (!isJd) {
      html = html.replace('<span class="br-icon-label">Skate</span>', '<span class="br-icon-label">Video</span>');
      html = html.replace(/(id="jd-mob-skate">)Skate Vid(<\/a>)/, "$1Video$2");
    }
  }

  if (!game) {
    html = html.replace(/<!-- Hidden Game -->[\s\S]*?<\/script>/, "");
    html = html.replace(
      /<div class="br-icon"[^>]*id="jd-games-icon">[\s\S]*?<span class="br-icon-label">Games<\/span>\s*<\/div>/,
      "",
    );
    html = html.replace(/<a class="bedroom-mobile-btn"[^>]*id="jd-mob-game">[\s\S]*?<\/a>\s*/, "");
  } else {
    if (!isJd) html = html.replace("JD's Arcade", `${esc(firstName)}'s Arcade`);
    if (game !== "skate") {
      const g = GAME_CATALOG.find((x) => x.id === game)!;
      const src = readGameScript(game);
      html = html.replace(
        /<script id="jd-arcade-game">[\s\S]*?<\/script>/,
        () => `<script id="jd-arcade-game">\n${src}\n</script>`,
      );
      html = html.replace("sk8_or_die.exe", g.exe);
      html = html.replace(
        '<span id="jd-game-hint">SPACE to ollie</span>',
        `<span id="jd-game-hint">${esc(g.hint)}</span>`,
      );
      if ("statA" in g) {
        html = html.replace('<span id="jd-stat-a">Score</span>', `<span id="jd-stat-a">${esc(g.statA)}</span>`);
        html = html.replace('<span id="jd-stat-b">Lives</span>', `<span id="jd-stat-b">${esc(g.statB)}</span>`);
        html = html.replace('<span id="jd-br-lives">3</span>', '<span id="jd-br-lives">0</span>');
      }
    }
  }

  // ── Stickers: chosen catalog set into the five designed wall slots ──
  // (null = artist hasn't picked; the baked-in set stays.)
  if (content.stickers) {
    const chosen = content.stickers
      .map((id) => STICKER_CATALOG.find((c) => c.id === id))
      .filter((c): c is (typeof STICKER_CATALOG)[number] => !!c)
      .slice(0, STICKER_SLOTS.length);
    const imgs = chosen
      .map((c, i) => `<img class="bedroom-sticker" src="${escAttr(c.src)}" style="${STICKER_SLOTS[i]}" alt="">`)
      .join("\n  ");
    html = html.replace(
      /<!-- Stickers -->[\s\S]*?(?=<\/section>|<!-- |$)/,
      `<!-- Stickers -->\n  ${imgs}\n\n  `,
    );
  }

  // ── Wall posters: the artist's own, taped into the four designed spots ──
  if (content.posters) {
    const posters = content.posters
      .slice(0, POSTER_SLOTS.length)
      .map((pp, i) => {
        const slot = POSTER_SLOTS[i];
        const tapes = i % 2 === 0
          ? '<div class="wall-poster-tape tl"></div>\n    <div class="wall-poster-tape tr"></div>'
          : '<div class="wall-poster-tape tl"></div>';
        return `<div class="bedroom-wall-poster" style="${slot}">\n    ${tapes}\n    <img loading="lazy" decoding="async" src="${escAttr(pp.src)}" alt="">\n  </div>`;
      })
      .join("\n  ");
    html = html.replace(
      /<!-- Wall posters -->[\s\S]*?(?=\n\n|<!-- Polaroid row)/,
      `<!-- Wall posters -->\n  ${posters}\n\n  `,
    );
  }

  // The Winamp widget (site-wide bundle) starts on the artist's actual pick.
  html += `\n<script>window.__ROOM_SONG_ID__=${JSON.stringify(content.songId)};</script>`;

  return html;
}
