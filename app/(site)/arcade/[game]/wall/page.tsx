import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { GAME_CATALOG, formatScore, isGameId } from "@/lib/arcade/catalog";
import { readWall, TODAY_SIZE, WALL_SIZE, type Wall } from "@/lib/arcade/scores";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// One game's wall, drawn the way a cabinet draws it: a black screen, the
// pixel font, RANK / NAME / SCORE, a blinking INSERT COIN. /arcade/<game>/wall.
// Live on every load and it keeps itself fresh (the script below re-reads the
// wall every half minute) so it can sit on a TV.
export const dynamic = "force-dynamic";

const PINK = "#FF1493";
const LIME = "#7FFF00";
const CYAN = "#00FFFF";
const YELLOW = "#FFD700";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" }).toUpperCase();
}

export default async function GameWallPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const spec = GAME_CATALOG.find((g) => g.id === game)!;
  const admin = createAdminClient();
  let wall: Wall = { game, alltime: [], today: [], plays: 0, playsToday: 0 };
  if (admin) {
    try { wall = await readWall(admin, LUMENATI_SHOP_ID, game); } catch { /* the empty wall still draws */ }
  }
  const idx = GAME_CATALOG.findIndex((g) => g.id === game);
  const prev = GAME_CATALOG[(idx + GAME_CATALOG.length - 1) % GAME_CATALOG.length];
  const next = GAME_CATALOG[(idx + 1) % GAME_CATALOG.length];

  const row = (e: Wall["alltime"][number] | undefined, i: number, withDate: boolean) => (
    <li key={i} className={e ? (i === 0 ? "top" : "") : "empty"}>
      <span className="r">{String(i + 1).padStart(2, " ")}</span>
      <span className="n">{e ? e.n : "---"}</span>
      <span className="s">{e ? formatScore(game, e.s).toUpperCase() : "------"}</span>
      {withDate && <span className="d">{e ? `${e.l > 1 ? `LVL ${e.l}  ` : ""}${when(e.at)}` : ""}</span>}
    </li>
  );

  return (
    <main className="cw" data-game={game}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />
      <style>{`
        .cw{min-height:100vh;background:#000;color:#fff;font-family:'Press Start 2P',monospace;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:34px 16px 60px;}
        .cw::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:5;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.28) 0 1px,transparent 1px 3px);}
        .cw::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:6;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,0.65) 100%);}
        .cw-nav{width:100%;max-width:760px;display:flex;justify-content:space-between;align-items:center;font-size:9px;margin-bottom:26px;}
        .cw-nav a{color:${CYAN};text-decoration:none;}
        .cw-nav a:hover{color:#fff;}
        .cw-nav .x{color:${PINK};}
        .cw-title{font-size:clamp(14px,3.4vw,26px);color:${PINK};text-shadow:0 0 16px rgba(255,20,147,0.55);margin:0;text-align:center;letter-spacing:1px;}
        .cw-sub{font-size:9px;color:rgba(255,255,255,0.55);margin:12px 0 30px;text-align:center;line-height:2;}
        .cw-sub b{color:${YELLOW};font-weight:normal;}
        .cw-boards{width:100%;max-width:760px;display:grid;grid-template-columns:1fr;gap:34px;}
        @media (min-width:820px){.cw-boards{grid-template-columns:3fr 2fr;}}
        .cw-board h2{font-size:11px;margin:0 0 14px;font-weight:normal;letter-spacing:1px;}
        .cw-board h2.all{color:${CYAN};}
        .cw-board h2.today{color:${LIME};}
        .cw-board ol{list-style:none;margin:0;padding:0;}
        .cw-board li{display:grid;grid-template-columns:34px 64px 1fr;gap:8px 12px;align-items:baseline;padding:7px 0;font-size:clamp(9px,1.6vw,13px);color:#fff;white-space:pre;}
        .cw-board li .r{color:rgba(255,255,255,0.5);text-align:right;}
        .cw-board li .n{color:#fff;}
        .cw-board li .s{color:${LIME};text-align:right;}
        .cw-board li .d{grid-column:2/4;font-size:7px;color:rgba(255,255,255,0.35);margin-top:-4px;}
        .cw-board li.top .n,.cw-board li.top .r{color:${YELLOW};}
        .cw-board li.top .s{color:${YELLOW};text-shadow:0 0 10px rgba(255,215,0,0.5);}
        .cw-board li.empty{color:rgba(255,255,255,0.22);}
        .cw-board li.empty .s,.cw-board li.empty .n,.cw-board li.empty .r{color:rgba(255,255,255,0.22);}
        .cw-plays{font-size:8px;color:rgba(255,255,255,0.5);margin-top:18px;line-height:2;}
        .cw-coin{margin-top:44px;font-size:12px;color:${YELLOW};animation:cw-blink 1.1s steps(1) infinite;}
        @keyframes cw-blink{50%{opacity:0;}}
        .cw-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:26px;}
        .cw-btn{font-family:inherit;font-size:9px;color:#fff;background:${PINK};text-decoration:none;padding:12px 18px;border:2px solid;border-color:#ff8ad0 #8a004a #8a004a #ff8ad0;box-shadow:3px 3px 0 rgba(255,255,255,0.12);}
        .cw-btn.ghost{background:#000;color:${CYAN};border-color:${CYAN};}
        .cw-btn:active{transform:translate(1px,1px);}
        .cw-foot{margin-top:30px;font-size:7px;color:rgba(255,255,255,0.35);text-align:center;line-height:2;}
      `}</style>

      <nav className="cw-nav">
        <Link href={`/arcade/${prev.id}/wall`}>&#9664; {prev.label.toUpperCase()}</Link>
        <Link href="/arcade">ALL CABINETS</Link>
        <Link href={`/arcade/${next.id}/wall`}>{next.label.toUpperCase()} &#9654;</Link>
      </nav>

      <h1 className="cw-title">{spec.label.toUpperCase()} // HIGH SCORES</h1>
      <div className="cw-sub">
        {spec.exe.toUpperCase()} // THE SHOP WALL
        <br />
        <b data-plays-today>{wall.playsToday.toLocaleString("en-US")}</b> PLAYS TODAY // <b data-plays>{wall.plays.toLocaleString("en-US")}</b> ALL TIME
      </div>

      <div className="cw-boards">
        <section className="cw-board">
          <h2 className="all">ALL TIME</h2>
          <ol data-board="alltime">{Array.from({ length: WALL_SIZE }).map((_, i) => row(wall.alltime[i], i, true))}</ol>
        </section>
        <section className="cw-board">
          <h2 className="today">TODAY</h2>
          <ol data-board="today">{Array.from({ length: TODAY_SIZE }).map((_, i) => row(wall.today[i], i, false))}</ol>
          <div className="cw-plays">RESETS AT MIDNIGHT, DENVER<br />SIGN THE WALL AT ANY GAME OVER</div>
        </section>
      </div>

      <div className="cw-coin">INSERT COIN</div>
      <div className="cw-btns">
        <Link className="cw-btn" href={`/arcade/${game}`}>PLAY {spec.label.toUpperCase()}</Link>
        <Link className="cw-btn ghost" href="/arcade">ALL CABINETS</Link>
        <a className="cw-btn ghost" href="/">EXIT TO LUMENATI ONLINE</a>
      </div>
      <div className="cw-foot">{spec.hint.toUpperCase()}</div>

      {/* Keeps the screen fresh on a TV: re-read the wall every half minute. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var game=${JSON.stringify(game)}, fmt=${JSON.stringify(spec.fmt)};
  function money(n){return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');}
  function score(s){ if(fmt==='dollars') return '$'+money(s); if(fmt==='pong') return s+'/5 BEAT'; return money(s); }
  function when(iso){ try{ return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/Denver'}).toUpperCase(); }catch(e){ return ''; } }
  function fill(sel, rows, withDate){
    var ol=document.querySelector('[data-board="'+sel+'"]'); if(!ol) return;
    var lis=ol.children;
    for(var i=0;i<lis.length;i++){
      var e=rows[i], li=lis[i];
      li.className=e?(i===0?'top':''):'empty';
      li.querySelector('.n').textContent=e?e.n:'---';
      li.querySelector('.s').textContent=e?score(e.s):'------';
      var d=li.querySelector('.d'); if(d) d.textContent=e?((e.l>1?'LVL '+e.l+'  ':'')+when(e.at)):'';
    }
  }
  function tick(){
    fetch('/api/arcade/scores?game='+game,{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
      if(!j||!j.alltime) return;
      fill('alltime', j.alltime, true); fill('today', j.today, false);
      var a=document.querySelector('[data-plays]'); if(a) a.textContent=money(j.plays||0);
      var b=document.querySelector('[data-plays-today]'); if(b) b.textContent=money(j.playsToday||0);
    }).catch(function(){});
  }
  setInterval(tick, 30000);
})();`,
        }}
      />
    </main>
  );
}
