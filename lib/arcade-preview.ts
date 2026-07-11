import { readFileSync } from "node:fs";
import path from "node:path";
import { readLegacyBlock } from "@/lib/legacy";
import { GAME_CATALOG } from "@/lib/admin/render-room";

// A standalone, playable arcade window for /arcade/<game> — the try-before-
// you-pick screen the app's game chooser links to. Same shell ids the games
// expect, same clips, no room required.

function gameSource(id: string): string {
  if (id === "skate") {
    const tpl = readLegacyBlock("artist-page-y2k.html");
    const m = tpl.match(/<script id="jd-arcade-game">\n([\s\S]*?)<\/script>/);
    return m ? m[1] : "";
  }
  return readFileSync(path.join(process.cwd(), "legacy", "games", `${id}.js`), "utf8");
}

export function buildArcadePreviewHtml(gameId: string): string | null {
  const game = GAME_CATALOG.find((g) => g.id === gameId);
  if (!game) return null;

  const statA = "statA" in game ? game.statA : "Score";
  const statB = "statB" in game ? game.statB : "Lives";
  const livesInit = "livesInit" in game ? game.livesInit : "3";

  const switcher = GAME_CATALOG.map((g) =>
    g.id === gameId
      ? `<span style="padding:4px 8px;background:#FF1493;color:#fff;font-weight:bold;">${g.label}</span>`
      : `<a href="/arcade/${g.id}" style="padding:4px 8px;color:#9ef;text-decoration:none;">${g.label}</a>`,
  ).join("");

  return `
<div style="min-height:100vh;background:#14101c;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,sans-serif;">
  <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;font-size:12px;max-width:640px;">${switcher}</div>
  <div style="background:#ece9d8;border:2px solid;border-color:#fff #808080 #808080 #fff;box-shadow:3px 3px 0 rgba(0,0,0,0.3);max-width:95vw;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;background:linear-gradient(180deg,#FF1493 0%,#c8006e 100%);height:24px;">
      <span style="font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 rgba(0,0,0,0.3);">${game.exe} — Try the Arcade</span>
      <span style="font-family:Tahoma,sans-serif;font-size:11px;color:#fff;padding:0 4px;">preview</span>
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
  <div style="margin-top:12px;color:#9aa;font-size:12px;">Pick this one in My Page and it lives on your public page.</div>
</div>
<script id="jd-arcade-game">
${gameSource(gameId)}
</script>
<script>
  // the games boot when the overlay's style attribute changes
  document.getElementById('jd-game-overlay').style.display = 'flex';
</script>`;
}
