import { readFileSync } from "node:fs";
import path from "node:path";
import { GAME_CATALOG, VISIBLE_GAMES } from "@/lib/arcade/catalog";

// Two flavors of a standalone, playable arcade window:
// - /arcade/<game>            — the try-the-games screen with a switcher row.
// - /arcade/<game>?embed=1    — a bare cartridge: fills its viewport, no site
//   chrome, loaded in an iframe by the room cabinet's selector screen.
// Same shell ids the games expect either way.

function gameSource(id: string): string {
  return readFileSync(path.join(process.cwd(), "legacy", "games", `${id}.js`), "utf8");
}

// The shared wall module rides inline ahead of the game: LegacyBlock re-runs
// scripts by cloning them, and an external src would load after the inline
// game had already asked for window.ArcadeBoard.
function boardSource(): string {
  return readFileSync(path.join(process.cwd(), "public", "arcade-board.js"), "utf8");
}

export function buildArcadePreviewHtml(
  gameId: string,
  opts: { embed?: boolean; flashSrcs?: string[]; crew?: string[] } = {},
): string | null {
  const game = GAME_CATALOG.find((g) => g.id === gameId);
  if (!game) return null;

  const statA = "statA" in game ? game.statA : "Score";
  const statB = "statB" in game ? game.statB : "Lives";
  const livesInit = "livesInit" in game ? game.livesInit : "3";

  const libs = "libs" in game ? game.libs.map((u) => `<script src="${u}"></script>`).join("\n") : "";
  const crew = opts.crew?.length
    ? `<script>window.__ARCADE_CREW__=${JSON.stringify(opts.crew).replace(/</g, "\\u003c")};</script>\n`
    : "";
  const flash =
    gameId === "flashmatch" && opts.flashSrcs?.length
      ? `<script>window.__ROOM_FLASH__=${JSON.stringify(opts.flashSrcs.slice(0, 8)).replace(/</g, "\\u003c")};</script>\n`
      : "";

  if (opts.embed) {
    // The cartridge: canvas sized to the exact drawn rect (never object-fit —
    // the games map taps over the element box, letterboxing would skew them),
    // status strip below, fire buttons via the cabinet script on touch.
    return `
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;}</style>
<div style="height:100vh;display:flex;flex-direction:column;background:#000;">
  <div id="jd-game-overlay" style="display:none;flex:1;min-height:0;align-items:center;justify-content:center;position:relative;background-color:#5a3a22;background-image:repeating-linear-gradient(90deg, rgba(255,220,170,0.05) 0 1px, transparent 1px 6px),repeating-linear-gradient(88deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 11px),repeating-linear-gradient(92deg, rgba(0,0,0,0.10) 0 3px, transparent 3px 23px),linear-gradient(90deg, #6b4527 0%, #55331b 30%, #6b4527 55%, #4c2e18 80%, #61401f 100%);">
    <canvas id="jd-skate-canvas" width="400" height="320" style="display:block;image-rendering:pixelated;touch-action:none;background:#000;box-shadow:0 0 0 8px #0c0c0c, 0 0 30px rgba(0,0,0,0.65);"></canvas>
  </div>
  <div style="padding:4px 8px;background:#ece9d8;font-family:Tahoma,sans-serif;font-size:10px;color:#444;display:flex;justify-content:space-between;">
    <span><span id="jd-stat-a">${statA}</span>: <span id="jd-br-score">0</span></span>
    <span><span id="jd-stat-b">${statB}</span>: <span id="jd-br-lives">${livesInit}</span></span>
    <span id="jd-game-hint">${game.hint}</span>
  </div>
</div>
<script>window.__ARCADE_EMBED__=${JSON.stringify(gameId)};</script>
<script>
  // Phone play: in landscape the screen is as wide as the phone (same height in
  // logical pixels), so a game that reads __ARCADE_VIEW__ draws a wider world
  // instead of bars. Decided once at load; a rotation reloads the cartridge.
  (function () {
    var touch = 'ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /[?&]touch=1/.test(location.search);
    if (!touch) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var land = vw > vh;
    var w = land ? Math.max(400, Math.min(720, Math.round(320 * vw / vh))) : 400;
    window.__ARCADE_VIEW__ = { w: w, h: 320, phone: true, portrait: !land };
    var c = document.getElementById('jd-skate-canvas');
    if (c) { c.width = w; c.height = 320; }
    var was = land;
    window.addEventListener('resize', function () {
      var nowLand = window.innerWidth > window.innerHeight;
      if (nowLand !== was) { was = nowLand; setTimeout(function () { location.reload(); }, 250); }
    });
  })();
</script>
${libs}
${crew}${flash}<script id="jd-arcade-board">
${boardSource()}
</script>
<script id="jd-arcade-game">
${gameSource(gameId)}
</script>
<script src="/arcade-cabinet.js"></script>
<script>
  (function(){
    var c = document.getElementById('jd-skate-canvas');
    var wrap = c.parentElement;
    function fit() {
      var v = window.__ARCADE_VIEW__;
      var lw = v ? v.w : 400, lh = v ? v.h : 320;
      if (v && v.phone && !v.portrait) {
        // Phone landscape: the screen is the whole display, no bezel.
        c.style.width = wrap.clientWidth + 'px';
        c.style.height = wrap.clientHeight + 'px';
        return;
      }
      // -20 leaves room for the bezel shadow so it never bleeds off the wrap.
      var s = Math.min((wrap.clientWidth - 20) / lw, (wrap.clientHeight - 20) / lh);
      c.style.width = Math.max(1, Math.floor(lw * s)) + 'px';
      c.style.height = Math.max(1, Math.floor(lh * s)) + 'px';
    }
    window.addEventListener('resize', fit);
    // the games boot when the overlay's style attribute changes; the wrap
    // must be visible before fit() can measure it
    wrap.style.display = 'flex';
    fit();
  })();
</script>`;
  }

  const switcher = VISIBLE_GAMES.map((g) =>
    g.id === gameId
      ? `<span style="padding:4px 8px;background:#FF1493;color:#fff;font-weight:bold;">${g.label}</span>`
      : `<a href="/arcade/${g.id}" style="padding:4px 8px;color:#9ef;text-decoration:none;">${g.label}</a>`,
  ).join("") + `<a href="/arcade" style="padding:4px 8px;color:#FFD700;text-decoration:none;font-weight:bold;">Hall of Fame</a>`;

  return `
<div style="min-height:100vh;background:#14101c;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,sans-serif;">
  <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;font-size:12px;max-width:640px;">${switcher}</div>
  <div style="background:#ece9d8;border:2px solid;border-color:#fff #808080 #808080 #fff;box-shadow:3px 3px 0 rgba(0,0,0,0.3);max-width:95vw;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;background:linear-gradient(180deg,#FF1493 0%,#c8006e 100%);height:24px;">
      <span style="font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 rgba(0,0,0,0.3);">${game.exe} // Try the Arcade</span>
      <span style="display:flex;gap:4px;align-items:center;">
        <a href="/arcade/${gameId}/wall" style="font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;text-decoration:none;padding:1px 8px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.5);">WALL</a>
        <a href="/arcade" style="font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;text-decoration:none;padding:1px 8px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.5);">GAMES</a>
        <a href="/" title="Exit to Lumenati OnLine" style="font-family:Tahoma,sans-serif;font-size:12px;font-weight:bold;color:#000;text-decoration:none;width:18px;height:16px;line-height:16px;text-align:center;background:#ece9d8;border:1px solid;border-color:#fff #808080 #808080 #fff;">&#10005;</a>
      </span>
    </div>
    <div id="jd-game-overlay" style="display:none;padding:4px;background:#ece9d8;">
      <canvas id="jd-skate-canvas" width="400" height="320" style="display:block;width:600px;max-width:100%;height:auto;image-rendering:pixelated;touch-action:none;border:1px solid;border-color:#808080 #fff #fff #808080;background:#000;"></canvas>
    </div>
    <div style="padding:4px 8px;background:#ece9d8;border-top:1px solid #aca899;font-family:Tahoma,sans-serif;font-size:10px;color:#444;display:flex;justify-content:space-between;">
      <span><span id="jd-stat-a">${statA}</span>: <span id="jd-br-score">0</span></span>
      <span><span id="jd-stat-b">${statB}</span>: <span id="jd-br-lives">${livesInit}</span></span>
      <span id="jd-game-hint">${game.hint}</span>
    </div>
  </div>
  <div style="margin-top:12px;color:#9aa;font-size:12px;">Every page has the full cabinet. This is just the test bench. Scores post to the <a href="/arcade" style="color:#FFD700;">shop wall</a>.</div>
</div>
${libs}
${crew}${flash}<script>window.__ARCADE_DEVICE__='preview';</script>
<script id="jd-arcade-board">
${boardSource()}
</script>
<script id="jd-arcade-game">
${gameSource(gameId)}
</script>
<script src="/arcade-cabinet.js"></script>
<script>
  // the games boot when the overlay's style attribute changes
  document.getElementById('jd-game-overlay').style.display = 'flex';
</script>`;
}
