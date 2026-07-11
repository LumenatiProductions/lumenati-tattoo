import { NextRequest, NextResponse } from "next/server";
import { buildArcadePreviewHtml } from "@/lib/arcade-preview";
import { getSupabase } from "@/lib/supabase";

// Bare game cartridge for the room cabinet's selector iframe. A route handler
// (not a page) on purpose: pages under the (site) group inherit the Y2K
// chrome — Winamp, Clippy, dial-up — and a second Winamp inside every
// cartridge is one Winamp too many.
export const dynamic = "force-dynamic";

// Flash Match deals its cards from the artist's flash wall (newest first).
async function fetchFlashSrcs(artistId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("flash_pieces")
    .select("src")
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false })
    .limit(8);
  return ((data ?? []) as { src: string }[]).map((r) => r.src);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ game: string }> },
) {
  const { game } = await ctx.params;
  const artist = req.nextUrl.searchParams.get("artist") || "";
  const flashSrcs =
    game === "flashmatch" && artist ? await fetchFlashSrcs(artist) : [];
  const body = buildArcadePreviewHtml(game, { embed: true, flashSrcs });
  if (!body) return new NextResponse("not found", { status: 404 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${game}</title></head><body>${body}</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
