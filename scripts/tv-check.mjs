// Kiosk TV channel check: does a YouTube video actually play inside our embed?
// A video can play on youtube.com and still throw player error 150 in our
// embed (deleted, or embedding denied), and oEmbed / yt-dlp can't see that. This loads each id inside the real kiosk page
// in headless Chrome and reads the IFrame API's own error/play events.
//
//   node scripts/tv-check.mjs <videoId> [<videoId> ...]
//
// Host page defaults to the LIVE kiosk (HOST_PAGE env overrides). Never judge a
// channel from localhost: YouTube refuses licensed videos to embeds on localhost.
//
// Needs playwright: set PLAYWRIGHT_DIR to a node_modules/playwright folder
// (e.g. another project's) or install it here. Uses the installed Google Chrome.
const { chromium } = await import(`${process.env.PLAYWRIGHT_DIR ?? "playwright"}/index.mjs`);
const ids = process.argv.slice(2);
const ms = 15000;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(process.env.HOST_PAGE ?? "https://lumenatitattoo.com/kiosk", { waitUntil: "domcontentloaded" });
const res = await page.evaluate(async ({ ids, ms }) => {
  const g = document.createElement("div");
  g.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#111;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;gap:2px";
  const frames = []; const res = {};
  for (const id of ids) { const f = document.createElement("iframe"); f.style.cssText = "width:100%;height:100%;border:0"; f.allow = "autoplay"; f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&mute=1&controls=0&enablejsapi=1"; g.append(f); frames.push([f, id]); res[id] = "?"; }
  document.body.append(g);
  window.addEventListener("message", (e) => { if (typeof e.data !== "string" || !String(e.origin).includes("youtube")) return; let m; try { m = JSON.parse(e.data); } catch { return; } const hit = frames.find(([f]) => f.contentWindow === e.source); if (!hit) return; const id = hit[1]; if (m.event === "onError") res[id] = "ERR" + m.info; else if (m.event === "onStateChange" && (m.info === 1 || m.info === 3)) { if (!String(res[id]).startsWith("ERR")) res[id] = "PLAY"; } else if (m.event === "infoDelivery" && m.info) { const ps = m.info.playerState; if (ps === 1 || ps === 3) { if (!String(res[id]).startsWith("ERR")) res[id] = "PLAY"; } else if (res[id] === "?" && ps !== undefined) res[id] = "LOADED"; } });
  const hs = setInterval(() => { for (const [f] of frames) f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "t", channel: "widget" }), "*"); }, 500);
  await new Promise((r) => setTimeout(r, ms)); clearInterval(hs); return res;
}, { ids, ms });

await browser.close();
console.log(JSON.stringify(res, null, 1));
