import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { GAME_CATALOG, formatScore } from "@/lib/arcade/catalog";
import { readWall, type Wall } from "@/lib/arcade/scores";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// The Hall of Fame: every game's shop wall, out in the open at /arcade. What
// the cabinets show at game over, for anyone with the link. Live on every
// load (a fresh high score should be on the wall before the player finds
// their phone).
export const dynamic = "force-dynamic";

const PINK = "#FF1493";
const LIME = "#7FFF00";
const CYAN = "#00FFFF";
const YELLOW = "#FFD700";

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });
}

export default async function ArcadeHallPage() {
  const admin = createAdminClient();
  const walls: Record<string, Wall> = {};
  if (admin) {
    const all = await Promise.all(GAME_CATALOG.map((g) => readWall(admin, LUMENATI_SHOP_ID, g.id).catch(() => null)));
    for (const w of all) if (w) walls[w.game] = w;
  }
  const totalPlays = Object.values(walls).reduce((n, w) => n + w.plays, 0);
  const todayPlays = Object.values(walls).reduce((n, w) => n + w.playsToday, 0);
  const legends = GAME_CATALOG.map((g) => ({ g, top: walls[g.id]?.alltime[0] ?? null })).filter((x) => x.top);

  return (
    <main className="hof">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />
      <style>{`
        .hof{min-height:100vh;background:#14101c;color:#fff;font-family:Tahoma,Verdana,sans-serif;padding:28px 16px 80px;}
        .hof .px{font-family:'Press Start 2P',monospace;}
        .hof-nav{max-width:1180px;margin:0 auto 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-family:'Press Start 2P',monospace;font-size:8px;color:rgba(255,255,255,0.45);}
        .hof-nav a{color:${CYAN};text-decoration:none;background:#000;border:1px solid ${CYAN};padding:9px 12px;}
        .hof-nav a:hover{color:#fff;border-color:#fff;}
        .hof-head{max-width:1180px;margin:0 auto 18px;text-align:center;}
        .hof-head h1{font-family:'Press Start 2P',monospace;font-size:clamp(16px,3vw,28px);color:${PINK};margin:0 0 10px;letter-spacing:1px;text-shadow:0 0 18px rgba(255,20,147,0.45);}
        .hof-head h1 span{color:#fff;}
        .hof-sub{font-family:'Press Start 2P',monospace;font-size:9px;color:rgba(255,255,255,0.55);line-height:2;}
        .hof-sub b{color:${YELLOW};font-weight:normal;}
        .hof-legends{max-width:1180px;margin:18px auto 26px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;}
        .hof-legend{background:#000;border:1px solid rgba(255,255,255,0.18);padding:7px 10px;font-family:'Press Start 2P',monospace;font-size:8px;color:rgba(255,255,255,0.7);display:flex;gap:10px;align-items:center;}
        .hof-legend b{color:${YELLOW};font-weight:normal;}
        .hof-legend i{color:${CYAN};font-style:normal;}
        .hof-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:18px;}
        @media (min-width:1000px){.hof-grid{grid-template-columns:repeat(3,1fr);}}
        .hof-win{background:#ece9d8;border:2px solid;border-color:#fff #808080 #808080 #fff;box-shadow:3px 3px 0 rgba(0,0,0,0.35);color:#111;display:flex;flex-direction:column;}
        .hof-bar{display:flex;justify-content:space-between;align-items:center;padding:3px 6px;background:linear-gradient(180deg,${PINK} 0%,#c8006e 100%);height:24px;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 rgba(0,0,0,0.3);}
        .hof-bar span:last-child{font-weight:normal;opacity:0.85;}
        .hof-shot{position:relative;margin:4px;background:#000;border:1px solid;border-color:#808080 #fff #fff #808080;overflow:hidden;aspect-ratio:400/320;}
        .hof-shot img{display:block;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;}
        .hof-shot::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22) 0 1px,transparent 1px 3px);pointer-events:none;}
        .hof-name{position:absolute;left:0;right:0;bottom:0;padding:8px 10px;background:linear-gradient(0deg,rgba(0,0,0,0.85),rgba(0,0,0,0));font-family:'Press Start 2P',monospace;font-size:11px;color:#fff;}
        .hof-name small{display:block;margin-top:5px;font-size:7px;color:${CYAN};}
        .hof-blurb{padding:6px 10px 0;font-size:11px;color:#333;line-height:1.45;}
        .hof-boards{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 10px 10px;font-family:'Press Start 2P',monospace;}
        .hof-board h3{margin:0 0 6px;font-size:8px;font-weight:normal;color:#666;letter-spacing:0.5px;}
        .hof-board h3.wall{color:#0a7f8a;}
        .hof-board h3.today{color:#4b8f00;}
        .hof-board ol{list-style:none;margin:0;padding:0;background:#000;border:1px solid;border-color:#808080 #fff #fff #808080;}
        .hof-board li{display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:baseline;padding:4px 7px;font-size:8px;color:rgba(255,255,255,0.85);border-bottom:1px solid rgba(255,255,255,0.06);}
        .hof-board li:last-child{border-bottom:0;}
        .hof-board li.top{color:#fff;}
        .hof-board li.top .n{color:${YELLOW};}
        .hof-board li.empty{color:rgba(255,255,255,0.22);}
        .hof-board li .r{color:rgba(255,255,255,0.45);text-align:right;}
        .hof-board li .s{color:${LIME};}
        .hof-board li .d{grid-column:2/4;font-size:6px;color:rgba(255,255,255,0.35);margin-top:-2px;}
        .hof-foot{display:flex;justify-content:flex-end;gap:8px;align-items:center;padding:0 10px 10px;font-size:10px;color:#555;}
        .hof-play.ghost{background:#000;color:${CYAN};border-color:#555 #000 #000 #555;}
        .hof-play{display:inline-block;background:${PINK};color:#fff;text-decoration:none;font-family:'Press Start 2P',monospace;font-size:9px;padding:8px 14px;border:2px solid;border-color:#ff8ad0 #8a004a #8a004a #ff8ad0;box-shadow:2px 2px 0 rgba(0,0,0,0.35);}
        .hof-play:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(0,0,0,0.35);}
        .hof-back{display:block;max-width:1180px;margin:30px auto 0;text-align:center;font-family:'Press Start 2P',monospace;font-size:8px;color:rgba(255,255,255,0.45);}
        .hof-back a{color:${CYAN};text-decoration:none;}
      `}</style>

      <nav className="hof-nav">
        <a href="/">&#9664; EXIT TO LUMENATI ONLINE</a>
        <span>PICK A CABINET. EVERY WALL IS ITS OWN SCREEN.</span>
      </nav>
      <header className="hof-head">
        <h1>LUMENATI ARCADE <span>// HALL OF FAME</span></h1>
        <div className="hof-sub">
          NINE CABINETS. ONE WALL. SIGN IT AT ANY GAME OVER.
          <br />
          <b>{todayPlays.toLocaleString("en-US")}</b> PLAYS TODAY // <b>{totalPlays.toLocaleString("en-US")}</b> ALL TIME // TODAY RESETS AT MIDNIGHT, DENVER
        </div>
      </header>

      {legends.length > 0 && (
        <div className="hof-legends">
          {legends.map(({ g, top }) => (
            <div className="hof-legend" key={g.id}>
              <i>{g.label.toUpperCase()}</i>
              <b>{top!.n}</b>
              <span>{formatScore(g.id, top!.s)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="hof-grid">
        {GAME_CATALOG.map((g) => {
          const w = walls[g.id];
          const alltime = w?.alltime ?? [];
          const today = w?.today ?? [];
          return (
            <section className="hof-win" key={g.id} id={g.id}>
              <div className="hof-bar">
                <span>{g.exe}</span>
                <span>{(w?.plays ?? 0).toLocaleString("en-US")} plays</span>
              </div>
              <div className="hof-shot">
                <img src={`/arcade/thumbs/${g.id}.jpg`} alt={`${g.label} screenshot`} loading="lazy" />
                <div className="hof-name">
                  {g.label.toUpperCase()}
                  <small>{alltime[0] ? `WALL: ${alltime[0].n} ${formatScore(g.id, alltime[0].s).toUpperCase()}` : "WALL IS EMPTY. BE FIRST."}</small>
                </div>
              </div>
              <p className="hof-blurb">{g.blurb}</p>
              <div className="hof-boards">
                <div className="hof-board">
                  <h3 className="wall">SHOP WALL</h3>
                  <ol>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const e = alltime[i];
                      return (
                        <li key={i} className={e ? (i === 0 ? "top" : "") : "empty"}>
                          <span className="r">{i + 1}</span>
                          <span className="n">{e ? e.n : "---"}</span>
                          <span className="s">{e ? formatScore(g.id, e.s) : "-"}</span>
                          {e && <span className="d">{when(e.at)}{e.l > 1 ? ` // LVL ${e.l}` : ""}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="hof-board">
                  <h3 className="today">TODAY</h3>
                  <ol>
                    {Array.from({ length: 3 }).map((_, i) => {
                      const e = today[i];
                      return (
                        <li key={i} className={e ? (i === 0 ? "top" : "") : "empty"}>
                          <span className="r">{i + 1}</span>
                          <span className="n">{e ? e.n : "---"}</span>
                          <span className="s">{e ? formatScore(g.id, e.s) : "-"}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <h3 className="today" style={{ marginTop: 10 }}>{(w?.playsToday ?? 0).toLocaleString("en-US")} PLAYS TODAY</h3>
                </div>
              </div>
              <div className="hof-foot">
                <Link className="hof-play ghost" href={`/arcade/${g.id}/wall`}>FULL WALL</Link>
                <Link className="hof-play" href={`/arcade/${g.id}`}>PLAY</Link>
              </div>
            </section>
          );
        })}
      </div>

      <div className="hof-back">
        EVERY ARTIST PAGE AND THE FRONT DESK IPAD RUN THE SAME CABINET // <a href="/">BACK TO LUMENATI ONLINE</a>
      </div>
    </main>
  );
}
