import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { GAME_CATALOG, formatScore } from "@/lib/arcade/catalog";
import { readWall, type Wall } from "@/lib/arcade/scores";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// The arcade floor at /arcade: nine cabinets in a dark room, each with its
// marquee lit, the game on its screen and the wall's top run glowing on the
// glass. Tap a cabinet's screen for its full wall, PLAY to drop a coin. Live
// on every load.
export const dynamic = "force-dynamic";

const PINK = "#FF1493";
const LIME = "#7FFF00";
const CYAN = "#00FFFF";
const YELLOW = "#FFD700";
const TRIM = [PINK, CYAN, LIME, YELLOW, "#B026FF", "#FF6347", CYAN, PINK, LIME];

export default async function ArcadeFloorPage() {
  const admin = createAdminClient();
  const walls: Record<string, Wall> = {};
  if (admin) {
    const all = await Promise.all(GAME_CATALOG.map((g) => readWall(admin, LUMENATI_SHOP_ID, g.id).catch(() => null)));
    for (const w of all) if (w) walls[w.game] = w;
  }
  const totalPlays = Object.values(walls).reduce((n, w) => n + w.plays, 0);
  const todayPlays = Object.values(walls).reduce((n, w) => n + w.playsToday, 0);

  return (
    <main className="floor">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />
      <style>{`
        .floor{min-height:100vh;background:#050308;color:#fff;font-family:'Press Start 2P',monospace;position:relative;overflow:hidden;padding:0 0 70px;}
        .floor::before{content:"";position:absolute;inset:0;pointer-events:none;background:
          radial-gradient(ellipse 40% 30% at 15% 10%,rgba(255,20,147,0.22),transparent 70%),
          radial-gradient(ellipse 35% 30% at 85% 15%,rgba(0,255,255,0.16),transparent 70%),
          radial-gradient(ellipse 50% 30% at 50% 100%,rgba(176,38,255,0.18),transparent 70%);}
        .floor::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0.35;background-image:
          repeating-linear-gradient(45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 28px),
          repeating-linear-gradient(-45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 28px);}
        .fl-top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;font-size:8px;color:rgba(255,255,255,0.5);}
        .fl-top a{color:${CYAN};text-decoration:none;border:1px solid ${CYAN};padding:9px 12px;background:rgba(0,0,0,0.6);}
        .fl-top a:hover{color:#fff;border-color:#fff;}
        .fl-sign{position:relative;z-index:2;text-align:center;padding:22px 16px 6px;}
        .fl-sign h1{margin:0;font-size:clamp(16px,3.6vw,30px);color:${PINK};letter-spacing:2px;text-shadow:0 0 8px rgba(255,20,147,0.9),0 0 26px rgba(255,20,147,0.6),0 0 60px rgba(255,20,147,0.4);animation:fl-buzz 4s infinite;}
        @keyframes fl-buzz{0%,92%,100%{opacity:1}93%{opacity:0.55}95%{opacity:1}97%{opacity:0.7}}
        .fl-sign p{margin:12px 0 0;font-size:8px;color:rgba(255,255,255,0.55);line-height:2;}
        .fl-sign p b{color:${YELLOW};font-weight:normal;}
        .fl-row{position:relative;z-index:2;max-width:1240px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:34px 22px;padding:0 20px;}
        @media (min-width:700px){.fl-row{grid-template-columns:repeat(3,1fr);}}
        .cab{display:flex;flex-direction:column;position:relative;filter:drop-shadow(0 18px 24px rgba(0,0,0,0.7));}
        .cab-marquee{margin:0 6px;padding:12px 8px 10px;text-align:center;font-size:clamp(8px,1.2vw,10px);color:#fff;border:3px solid #1c1c24;border-bottom:0;border-radius:6px 6px 0 0;background:linear-gradient(180deg,rgba(255,255,255,0.12),rgba(0,0,0,0.2)),var(--trim);text-shadow:0 0 8px rgba(0,0,0,0.8),0 0 14px rgba(255,255,255,0.5);letter-spacing:1px;box-shadow:0 0 22px var(--trim),inset 0 0 18px rgba(0,0,0,0.35);}
        .cab-body{background:linear-gradient(180deg,#1b1b24,#0e0e14);border:3px solid #1c1c24;border-left-color:var(--trim);border-right-color:var(--trim);padding:12px 14px 14px;}
        .cab-screen{display:block;position:relative;background:#000;border:6px solid #06060a;box-shadow:inset 0 0 0 2px #2a2a33,0 0 18px rgba(0,0,0,0.9);aspect-ratio:400/320;overflow:hidden;text-decoration:none;color:#fff;}
        .cab-screen img{display:block;width:100%;height:100%;object-fit:cover;opacity:0.94;transition:opacity .2s;}
        .cab-screen:hover img{opacity:1;}
        .cab-screen::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.25) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,0.5) 100%);pointer-events:none;}
        .cab-line{margin-top:10px;font-size:7px;line-height:1.8;color:${YELLOW};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cab-line b{font-weight:normal;color:rgba(255,255,255,0.5);margin-right:4px;}
        .cab-line i{font-style:normal;color:rgba(255,255,255,0.5);}
        .cab-panel{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;background:linear-gradient(180deg,#2a2a36,#15151c);border:2px solid #101016;border-radius:4px;}
        .cab-play{font-family:inherit;font-size:8px;text-align:center;color:#fff;background:${PINK};text-decoration:none;padding:10px 8px;border:2px solid;border-color:#ff8ad0 #8a004a #8a004a #ff8ad0;box-shadow:2px 2px 0 rgba(0,0,0,0.5);}
        .cab-scores{font-family:inherit;font-size:8px;text-align:center;color:${CYAN};background:#000;text-decoration:none;padding:10px 8px;border:2px solid ${CYAN};box-shadow:2px 2px 0 rgba(0,0,0,0.5);}
        .cab-scores:hover{color:#fff;border-color:#fff;}
        .cab-play:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(0,0,0,0.5);}
        .cab-coin{margin:0 10px;padding:8px 10px;display:flex;justify-content:space-between;font-size:7px;color:rgba(255,255,255,0.5);background:#0a0a0f;border:2px solid #1c1c24;border-top:0;}
        .cab-coin b{color:${YELLOW};font-weight:normal;}
        .cab-coin a{color:${CYAN};text-decoration:none;}
        .cab-legs{height:10px;margin:0 22px;background:#0a0a0f;border:2px solid #1c1c24;border-top:0;}
        .fl-foot{position:relative;z-index:2;margin-top:44px;text-align:center;font-size:7px;color:rgba(255,255,255,0.4);line-height:2.2;}
        .fl-foot a{color:${CYAN};text-decoration:none;}
      `}</style>

      <nav className="fl-top">
        <a href="/">&#9664; EXIT TO LUMENATI ONLINE</a>
        <span><b style={{ color: YELLOW, fontWeight: "normal" }}>{todayPlays.toLocaleString("en-US")}</b> PLAYS TODAY // <b style={{ color: YELLOW, fontWeight: "normal" }}>{totalPlays.toLocaleString("en-US")}</b> ALL TIME</span>
      </nav>

      <header className="fl-sign">
        <h1>LUMENATI ARCADE</h1>
        <p>SIGN THE WALL AT ANY GAME OVER</p>
      </header>

      <div className="fl-row">
        {GAME_CATALOG.map((g, i) => {
          const w = walls[g.id];
          const top = w?.alltime[0];
          const today = w?.today[0];
          return (
            <section className="cab" key={g.id} id={g.id} style={{ ["--trim" as string]: TRIM[i] }}>
              <div className="cab-marquee">{g.label.toUpperCase()}</div>
              <div className="cab-body">
                <Link className="cab-screen" href={`/arcade/${g.id}/wall`} title={`${g.label} high scores`}>
                  <img src={`/arcade/thumbs/${g.id}.png`} alt={`${g.label} screen`} loading="lazy" />
                </Link>
                <div className="cab-line">
                  {top ? (
                    <><b>HI</b> {top.n} {formatScore(g.id, top.s).toUpperCase()}{today ? <i>  TODAY {today.n} {formatScore(g.id, today.s).toUpperCase()}</i> : null}</>
                  ) : (
                    <i>WALL OPEN. BE FIRST.</i>
                  )}
                </div>
                <div className="cab-panel">
                  <Link className="cab-play" href={`/arcade/${g.id}`}>PLAY</Link>
                  <Link className="cab-scores" href={`/arcade/${g.id}/wall`}>HIGH SCORES</Link>
                </div>
              </div>
              <div className="cab-coin">
                <span><b>{(w?.plays ?? 0).toLocaleString("en-US")}</b> PLAYS</span>
                <span>{(w?.playsToday ?? 0).toLocaleString("en-US")} TODAY</span>
              </div>
              <div className="cab-legs" />
            </section>
          );
        })}
      </div>

      <div className="fl-foot">
        EVERY ARTIST PAGE AND THE FRONT DESK IPAD RUN THE SAME CABINET<br />
        <a href="/">BACK TO LUMENATI ONLINE</a>
      </div>
    </main>
  );
}
