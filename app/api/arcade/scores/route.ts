import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GAME_CATALOG, VISIBLE_GAMES, isGameId } from "@/lib/arcade/catalog";
import { BLOCKED_INITIALS, hashIp, readWall, shopForArtist, type Wall } from "@/lib/arcade/scores";

// The arcade's shared wall. GET reads a game's boards; POST files a finished
// run. Signed runs (three initials) go on the boards, unsigned ones only count
// as plays. Everything is service-role behind this route; the games never
// touch the table.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const hits = new Map<string, number[]>();
const RATE_LIMIT = 12; // posts per IP per minute: a fast player restarts every ~5s
const WINDOW_MS = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > RATE_LIMIT;
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  const url = new URL(req.url);
  const artist = url.searchParams.get("artist");
  const shopId = await shopForArtist(admin, artist);
  const game = url.searchParams.get("game") ?? "";

  // ?all=1: the cabinet menu's one-line-per-game teaser (top score + plays).
  if (url.searchParams.get("all")) {
    const walls = await Promise.all(VISIBLE_GAMES.map((g) => readWall(admin, shopId, g.id)));
    const summary: Record<string, { top: Wall["alltime"][number] | null; plays: number; playsToday: number }> = {};
    for (const w of walls) summary[w.game] = { top: w.alltime[0] ?? null, plays: w.plays, playsToday: w.playsToday };
    return NextResponse.json({ games: summary }, { headers: NO_STORE });
  }

  if (!isGameId(game)) return NextResponse.json({ error: "Unknown game." }, { status: 404, headers: NO_STORE });
  const wall = await readWall(admin, shopId, game);
  return NextResponse.json(wall, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  const ip = clientIp(req);
  if (rateLimited(ip)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: NO_STORE });

  const b = (await req.json().catch(() => ({}))) as {
    game?: string; name?: string | null; score?: number; level?: number;
    duration?: number; device?: string; artist?: string | null; meta?: Record<string, unknown>;
  };
  const game = String(b.game ?? "");
  if (!isGameId(game)) return NextResponse.json({ error: "Unknown game." }, { status: 400, headers: NO_STORE });
  const spec = GAME_CATALOG.find((g) => g.id === game)!;

  const score = Math.floor(Number(b.score));
  if (!Number.isFinite(score) || score < 0) return NextResponse.json({ error: "Bad score." }, { status: 400, headers: NO_STORE });
  if (score > spec.cap) return NextResponse.json({ error: "That score is off the wall." }, { status: 400, headers: NO_STORE });

  let name: string | null = null;
  if (b.name != null && b.name !== "") {
    name = String(b.name).toUpperCase().replace(/[^A-Z]/g, "");
    if (name.length !== 3) return NextResponse.json({ error: "Three letters." }, { status: 400, headers: NO_STORE });
    if (BLOCKED_INITIALS.has(name)) return NextResponse.json({ error: "Pick other letters.", blocked: true }, { status: 400, headers: NO_STORE });
  }
  const level = Math.max(1, Math.min(999, Math.floor(Number(b.level) || 1)));
  const duration = Math.max(0, Math.min(86_400, Math.floor(Number(b.duration) || 0)));
  // A signed score with no play time behind it is a script, not a run.
  if (name && score > 0 && duration < 2) return NextResponse.json({ error: "Play the game first." }, { status: 400, headers: NO_STORE });
  const device = /^[a-z]{2,12}$/.test(String(b.device ?? "")) ? String(b.device) : "web";
  const artist = typeof b.artist === "string" && /^[0-9a-f-]{36}$/i.test(b.artist) ? b.artist : null;
  const shopId = await shopForArtist(admin, artist);
  const meta = b.meta && typeof b.meta === "object" ? JSON.parse(JSON.stringify(b.meta).slice(0, 2_000)) : {};

  const { error } = await admin.from("arcade_scores").insert({
    shop_id: shopId, game, name, score, level, duration_s: duration, device, artist_id: artist, meta, ip_hash: hashIp(ip),
  });
  if (error) return NextResponse.json({ error: "Could not save that run." }, { status: 500, headers: NO_STORE });

  const wall = await readWall(admin, shopId, game);
  // Ties sort oldest first, so the run just filed is the last of its score.
  const mine = (list: Wall["alltime"]) => { let r = 0; list.forEach((x, i) => { if (x.s === score && x.n === name) r = i + 1; }); return r; };
  const rank = name ? mine(wall.alltime) : 0;
  const todayRank = name ? mine(wall.today) : 0;
  return NextResponse.json({ ...wall, rank, todayRank }, { headers: NO_STORE });
}
