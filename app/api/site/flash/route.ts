import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// The shop's flash, for the site's own chrome (the wallpaper picker tiles it,
// the screensaver flies it past). Public read of already-public images; anon
// client. `flash` carries titles for the picker, `srcs` is the bare list.
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ flash: [], srcs: [] }, { headers: { "Cache-Control": "no-store" } });
  const { data } = await sb
    .from("flash_pieces")
    .select("src, title")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .order("created_at", { ascending: false })
    .limit(24);
  const flash = ((data ?? []) as { src: string; title: string | null }[])
    .filter((r) => r.src)
    .map((r) => ({ src: r.src, title: r.title ?? "" }));
  return NextResponse.json({ flash, srcs: flash.map((f) => f.src) }, { headers: { "Cache-Control": "no-store" } });
}
