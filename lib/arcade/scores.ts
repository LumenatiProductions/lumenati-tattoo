import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// The shop wall, read side. Shared by /api/arcade/scores (the games) and the
// /arcade hall of fame page. Everything is service-role: the table has no
// anon or authenticated grants on purpose.

export type WallRow = { n: string; s: number; l: number; at: string };
export type Wall = {
  game: string;
  alltime: WallRow[];
  today: WallRow[];
  plays: number;
  playsToday: number;
};

export const WALL_SIZE = 10;
export const TODAY_SIZE = 5;

// Initials no cabinet has ever let through. Mirrored client-side so the sign-in
// screen nudges you to other letters before the server says no.
export const BLOCKED_INITIALS = new Set([
  "ASS", "FUK", "FUC", "FCK", "FUQ", "CUM", "CUN", "DIK", "DIC", "COK", "COC",
  "TIT", "SEX", "FAG", "KKK", "NIG", "NGR", "NAZ", "JIZ", "WTF", "STD", "HIV",
  "PIS", "POO", "PEE", "XXX", "HOR", "SLT", "RAP", "KYS", "DIE",
]);

// Shop-local calendar day: the wall resets at midnight in Denver, not UTC.
export const WALL_TZ = "America/Denver";
export function startOfShopDayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WALL_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Seconds since local midnight, subtracted from now, gives the instant local
  // midnight happened regardless of the offset.
  const sinceMidnight = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return new Date(now.getTime() - sinceMidnight * 1000 - now.getMilliseconds()).toISOString();
}

export function hashIp(ip: string): string {
  return createHash("sha256").update("lumenati-arcade:" + ip).digest("hex").slice(0, 24);
}

type Row = { name: string | null; score: number; level: number; created_at: string };
const toRow = (r: Row): WallRow => ({ n: r.name ?? "---", s: r.score, l: r.level, at: r.created_at });

export async function readWall(admin: SupabaseClient, shopId: string, game: string): Promise<Wall> {
  const dayStart = startOfShopDayIso();
  const [all, today, plays, playsToday] = await Promise.all([
    admin.from("arcade_scores").select("name, score, level, created_at")
      .eq("shop_id", shopId).eq("game", game).not("name", "is", null)
      .order("score", { ascending: false }).order("created_at", { ascending: true }).limit(WALL_SIZE),
    admin.from("arcade_scores").select("name, score, level, created_at")
      .eq("shop_id", shopId).eq("game", game).not("name", "is", null).gte("created_at", dayStart)
      .order("score", { ascending: false }).order("created_at", { ascending: true }).limit(TODAY_SIZE),
    admin.from("arcade_scores").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("game", game),
    admin.from("arcade_scores").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("game", game).gte("created_at", dayStart),
  ]);
  return {
    game,
    alltime: ((all.data ?? []) as Row[]).map(toRow),
    today: ((today.data ?? []) as Row[]).map(toRow),
    plays: plays.count ?? 0,
    playsToday: playsToday.count ?? 0,
  };
}

// Where a score would land on a list (1-based), or 0 when it misses.
export function rankOn(list: WallRow[], score: number, size: number): number {
  let i = 0;
  while (i < list.length && list[i].s >= score) i++;
  return i < size ? i + 1 : 0;
}

const artistShop = new Map<string, string>();
export async function shopForArtist(admin: SupabaseClient, artistId: string | null): Promise<string> {
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) return LUMENATI_SHOP_ID;
  const hit = artistShop.get(artistId);
  if (hit) return hit;
  const { data } = await admin.from("artists").select("shop_id").eq("id", artistId).maybeSingle();
  const shop = (data?.shop_id as string | undefined) ?? LUMENATI_SHOP_ID;
  artistShop.set(artistId, shop);
  return shop;
}
