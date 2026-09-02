import { readLegacyBlock, webpifyLegacyAssets } from "@/lib/legacy";
import type { RoomContent } from "./types";
import { GAME_CATALOG } from "@/lib/arcade/catalog";
import { MUSIC_VIDEOS, roomTvId, tvChannelById } from "@/lib/kiosk/tv-channels";
export { GAME_CATALOG };

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
// Each game also writes its hint (and pong its You/CPU labels) into the
// status bar at init, so the shell is right even before the renderer swap.

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
  opts?: { booksClosed?: boolean },
): string {
  let html = readLegacyBlock("artist-page-y2k.html");
  const firstName = name.split(" ")[0];

  // Booking from a room is booking with THIS artist: every Book door opens the
  // request form with them preselected (self-serve slots if they publish them,
  // otherwise a request that pings their phone). Closed books make it the
  // waitlist door. The label carries their full name so the client knows.
  {
    const bookHref = `/request?artist=${escAttr(content.artistId)}`;
    const label = opts?.booksClosed ? `Join ${esc(name)}'s waitlist` : `Book with ${esc(name)}`;
    html = html
      .replaceAll('href="/book"', `href="${bookHref}"`)
      .replace('<span class="br-icon-label">Book</span>', `<span class="br-icon-label">${label}</span>`)
      .replace(`<a class="bedroom-mobile-btn" href="${bookHref}">Book</a>`, `<a class="bedroom-mobile-btn" href="${bookHref}">${label}</a>`)
      .replace(`<a href="${bookHref}" class="br-aim-btn">Book</a>`, `<a href="${bookHref}" class="br-aim-btn">${label}</a>`);
  }
  // Instagram: the connected socials bag wins; the legacy ig_handle field is
  // the fallback so old rooms render unchanged.
  const handle = (content.socials?.instagram ?? content.igHandle ?? "").replace(/^@/, "");
  const folder = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

  // ── Socials beyond Instagram: desktop icons, mobile buttons, buddy-info
  // lines. Handles or full URLs both work; empty entries render nothing. ──
  const SOCIAL_DEFS: { key: string; label: string; base: (v: string) => string; svg: string }[] = [
    {
      key: "tiktok",
      label: "TikTok",
      base: (v) => `https://www.tiktok.com/@${v.replace(/^@/, "")}`,
      svg: '<svg viewBox="0 0 32 32"><path d="M13 6 L19 6 L19 18 A5 5 0 1 1 14 13 L14 17 A2 2 0 1 0 16 19 L16 6 Z" fill="#fff"/><path d="M19 6 Q20 11 25 11 L25 14 Q20 14 19 12 Z" fill="#fff"/></svg>',
    },
    {
      key: "x",
      label: "X",
      base: (v) => `https://x.com/${v.replace(/^@/, "")}`,
      svg: '<svg viewBox="0 0 32 32"><path d="M7 7 L14 16 L7 25 L10 25 L16 18 L21 25 L25 25 L18 16 L25 7 L22 7 L16 14 L11 7 Z" fill="#fff"/></svg>',
    },
    {
      key: "youtube",
      label: "YouTube",
      base: (v) => (v.startsWith("http") ? v : `https://www.youtube.com/@${v.replace(/^@/, "")}`),
      svg: '<svg viewBox="0 0 32 32"><rect x="4" y="9" width="24" height="14" rx="4" fill="#fff"/><path d="M14 13 L20 16 L14 19 Z" fill="#c8006e"/></svg>',
    },
    {
      key: "facebook",
      label: "Facebook",
      base: (v) => (v.startsWith("http") ? v : `https://www.facebook.com/${v}`),
      svg: '<svg viewBox="0 0 32 32"><rect x="6" y="6" width="20" height="20" rx="3" fill="#fff"/><path d="M18 12 L20 12 L20 9 L17 9 Q14 9 14 13 L14 15 L12 15 L12 18 L14 18 L14 24 L17 24 L17 18 L20 18 L20 15 L17 15 L17 13 Q17 12 18 12 Z" fill="#c8006e"/></svg>',
    },
    {
      key: "website",
      label: "Website",
      base: (v) => (v.startsWith("http") ? v : `https://${v}`),
      svg: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#fff" stroke-width="2"/><ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="5" y1="16" x2="27" y2="16" stroke="#fff" stroke-width="1.5"/></svg>',
    },
  ];
  const extraSocials = SOCIAL_DEFS.flatMap((d) => {
    const raw = (content.socials?.[d.key] ?? "").trim();
    return raw ? [{ ...d, href: d.base(raw) }] : [];
  });
  if (extraSocials.length) {
    const icons = extraSocials
      .map(
        (x) =>
          `    <a class="br-icon" href="${escAttr(x.href)}" target="_blank">\n      <div class="br-icon-img">${x.svg}</div>\n      <span class="br-icon-label">${x.label}</span>\n    </a>\n`,
      )
      .join("");
    html = html.replace('    <div class="br-icon" style="cursor:pointer" id="jd-games-icon">', `${icons}    <div class="br-icon" style="cursor:pointer" id="jd-games-icon">`);
    const btns = extraSocials
      .map((x) => `    <a class="bedroom-mobile-btn" href="${escAttr(x.href)}" target="_blank">${x.label}</a>\n`)
      .join("");
    html = html.replace('<a class="bedroom-mobile-btn" href="#" id="jd-mob-game">Games</a>', `<a class="bedroom-mobile-btn" href="#" id="jd-mob-game">Games</a>\n${btns}`);
    const aimLines = extraSocials
      .map((x) => `${x.label}: <a href="${escAttr(x.href)}" target="_blank">${esc(x.href.replace(/^https?:\/\/(www\.)?/, ""))}</a><br>`)
      .join("\n        ");
    html = html.replace(`@${handle}</a><br>`, `@${handle}</a><br>\n        ${aimLines}`);
  }

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

  // ── Arcade + video ──
  // Every room ships the full Lumenati cabinet: all games behind the selector
  // screen (/arcade-selector.js swaps game cartridges in as embed iframes).
  // The arcade is Lumenati showroom flair, not a per-page setting — future
  // professional page templates simply won't include it.
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
    // The artist's title becomes the era-true filename; handle is the fallback.
    const slug = (content.videoTitle ?? "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    const file = slug ? `${slug}.avi` : `${handle.replace(/[^A-Za-z0-9]+/g, "_") || "room"}_edit.avi`;
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

  if (!isJd) html = html.replace("JD's Arcade", `${esc(firstName)}'s Arcade`);

  // ── The artist's song: one pick from the shop TV's music video block ──
  // The room's Winamp holds the whole block and starts on their pick, playing
  // through a YouTube player parked offscreen inside a Windows Media Player
  // window. The MTV desktop icon slides that window on screen: same player,
  // same audio, now with the picture. (Site-wide Winamp reads __ROOM_TV__.)
  const tv = tvChannelById(roomTvId(content.songId, content.tvVideoId));
  if (tv) {
    const mpg = (name: string) => `${name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "mtv"}.mpg`;
    const icon = `    <div class="br-icon" style="cursor:pointer" id="jd-mtv-icon">
      <div class="br-icon-img"><svg viewBox="0 0 32 32"><line x1="12" y1="8" x2="8" y2="2" stroke="#000" stroke-width="1.2"/><line x1="15" y1="8" x2="19" y2="2" stroke="#000" stroke-width="1.2"/><rect x="3" y="8" width="26" height="18" rx="2" fill="#555" stroke="#000" stroke-width="1"/><rect x="5" y="10" width="17" height="14" rx="1" fill="#1a6bd8" stroke="#000" stroke-width="0.5"/><rect x="24" y="11" width="3.5" height="12" fill="#222"/><circle cx="25.75" cy="14" r="1.1" fill="#ccc"/><circle cx="25.75" cy="18" r="1.1" fill="#ccc"/><text x="13.5" y="20" font-size="6.5" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">MTV</text></svg></div>
      <span class="br-icon-label">MTV</span>
    </div>
`;
    html = html.replace(
      '<span class="br-icon-label">Games</span>\n    </div>\n',
      `<span class="br-icon-label">Games</span>\n    </div>\n${icon}`,
    );
    const win = `<!-- MTV window: the room's song as its video, Windows Media Player style. Parked offscreen (still playing) until the MTV icon slides it in. -->
<div id="jd-mtv-overlay" style="display:flex;position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;transform:translateX(-300vw);">
  <div style="background:#ece9d8;border:2px solid;border-color:#fff #808080 #808080 #fff;box-shadow:3px 3px 0 rgba(0,0,0,0.3);max-width:95vw;width:640px;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;background:linear-gradient(180deg,#0a246a 0%,#3a6ea5 40%,#0a246a 100%);height:24px;">
      <span id="jd-mtv-title" style="font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 rgba(0,0,0,0.3);">Windows Media Player — ${esc(mpg(tv.name))}</span>
      <span id="jd-mtv-close" style="font-family:Tahoma,sans-serif;font-size:11px;color:#fff;cursor:pointer;padding:0 6px;">✕</span>
    </div>
    <div style="display:flex;padding:1px 4px;background:#ece9d8;border-bottom:1px solid #aca899;gap:0;">
      <span style="font-family:Tahoma,sans-serif;font-size:11px;color:#000;padding:2px 8px;">File</span>
      <span style="font-family:Tahoma,sans-serif;font-size:11px;color:#000;padding:2px 8px;">View</span>
      <span style="font-family:Tahoma,sans-serif;font-size:11px;color:#000;padding:2px 8px;">Play</span>
      <span style="font-family:Tahoma,sans-serif;font-size:11px;color:#000;padding:2px 8px;">Help</span>
    </div>
    <div style="margin:4px;border:1px solid;border-color:#808080 #fff #fff #808080;overflow:hidden;position:relative;padding-top:56.25%;background:#000;">
      <iframe id="jd-mtv" src="https://www.youtube-nocookie.com/embed/${escAttr(tv.id)}?controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1" title="${escAttr(tv.name)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe>
    </div>
    <div style="padding:6px 8px;background:#ece9d8;border-top:1px solid #aca899;display:flex;justify-content:space-between;align-items:center;">
      <span id="jd-mtv-status" style="font-family:Tahoma,sans-serif;font-size:10px;color:#444;">Playing - ${esc(mpg(tv.name))} &nbsp;//&nbsp; MTV ch. ${tv.num}</span>
      <span style="font-family:Tahoma,sans-serif;font-size:10px;color:#444;">Winamp has the controls</span>
    </div>
  </div>
</div>

`;
    html = html.replace("<!-- Hidden Game -->", `${win}<!-- Hidden Game -->`);
    // Phones hide the desktop icons; the action row gets an MTV button instead.
    html = html.replace(
      '<a class="bedroom-mobile-btn" href="#" id="jd-mob-game">Games</a>',
      '<a class="bedroom-mobile-btn" href="#" id="jd-mob-game">Games</a>\n    <a class="bedroom-mobile-btn" href="#" id="jd-mob-mtv">MTV</a>',
    );
    const list = MUSIC_VIDEOS.map((c) => ({ id: c.id, name: c.name, num: c.num }));
    const tvJson = JSON.stringify({ id: tv.id, list }).replace(/</g, "\\u003c");
    html += `\n<script>window.__ROOM_TV__=${tvJson};
(function(){var ov=document.getElementById('jd-mtv-overlay');if(!ov)return;
function mpg(n){return (n.replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase()||'mtv')+'.mpg';}
window.__lmnMtvOpen=function(){ov.style.transform='';if(window.__winampPlay&&!(window.__winampIsPlaying&&window.__winampIsPlaying()))window.__winampPlay();};
window.__lmnMtvClose=function(){ov.style.transform='translateX(-300vw)';};
window.__lmnMtvTitle=function(c){var t=document.getElementById('jd-mtv-title'),s=document.getElementById('jd-mtv-status');if(t)t.textContent='Windows Media Player \u2014 '+mpg(c.name);if(s)s.textContent='Playing - '+mpg(c.name)+'  //  MTV ch. '+c.num;};
document.getElementById('jd-mtv-icon').addEventListener('click',function(){window.__lmnMtvOpen();});
document.getElementById('jd-mtv-close').addEventListener('click',function(){window.__lmnMtvClose();});
var mb=document.getElementById('jd-mob-mtv');if(mb)mb.addEventListener('click',function(e){e.preventDefault();window.__lmnMtvOpen();});
})();</script>`;
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
  // An empty list means the artist hasn't set the room up: JD's posters come
  // down and one honest UNDER CONSTRUCTION sign goes up in the big left spot.
  if (content.posters) {
    const posterList = content.posters.length
      ? content.posters
      : [{ id: "placeholder", src: "/room/placeholder-poster.svg" }];
    const slots = content.posters.length ? POSTER_SLOTS : [POSTER_SLOTS[2]];
    const posters = posterList
      .slice(0, slots.length)
      .map((pp, i) => {
        const slot = slots[i];
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
  // The drag engine (footer bundle) restores the owner's desk layout and saves
  // new ones to /api/room/layout, keyed by the artist id.
  html += `\n<script>window.__ROOM_KEY__=${JSON.stringify(content.artistId)};window.__ROOM_LAYOUT__=${JSON.stringify(content.layout ?? null).replace(/</g, "\\u003c")};</script>`;

  // The cabinet selector reads the catalog + whose room this is (the artist id
  // rides the embed URL so Flash Match can deal from their flash wall).
  const games = GAME_CATALOG.map((g) => ({ id: g.id, label: g.label, exe: g.exe }));
  html += `\n<script>window.__ARCADE_GAMES__=${JSON.stringify(games).replace(/</g, "\\u003c")};window.__ARCADE_ARTIST__=${JSON.stringify(content.artistId)};window.__ARCADE_ACCENT__=${JSON.stringify(content.accentColor)};</script>`;

  return webpifyLegacyAssets(html);
}
