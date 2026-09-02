import { NextRequest, NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Where things sit on an artist's desk. The site's drag engine PATCHes here on
// every drop; the shop owner (or the artist, signed in) makes it the layout
// everyone sees. Anyone else gets a 401 and keeps their arrangement in their
// own browser only.
type Pos = { l: number; t: number };

export async function PATCH(req: NextRequest) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { artistId?: string; layout?: Record<string, Pos> | null } | null;
  const artistId = body?.artistId;
  if (!artistId || typeof artistId !== "string") return NextResponse.json({ error: "artistId required" }, { status: 400 });
  if (ctx.role !== "owner" && ctx.artistId !== artistId) return NextResponse.json({ error: "Not your room" }, { status: 403 });

  let layout: Record<string, Pos> | null = null;
  if (body?.layout && typeof body.layout === "object") {
    layout = {};
    for (const [k, v] of Object.entries(body.layout).slice(0, 80)) {
      if (!/^[a-z]+-\d{1,3}$/.test(k) || !v || typeof v.l !== "number" || typeof v.t !== "number") continue;
      if (!Number.isFinite(v.l) || !Number.isFinite(v.t)) continue;
      layout[k] = { l: Math.round(v.l * 100) / 100, t: Math.round(v.t) };
    }
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "No admin client" }, { status: 500 });
  const { error } = await admin
    .from("room_content")
    .update({ layout, updated_at: new Date().toISOString() })
    .eq("artist_id", artistId)
    .eq("shop_id", ctx.shopId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: layout ? Object.keys(layout).length : 0 });
}
