import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { signPhoto } from "@/lib/storage/photos";

export const dynamic = "force-dynamic";

// Signed views into the PRIVATE healed-photos bucket (2026-07-26 lockdown).
//   GET ?id=<healed_photo id>            -> { url }   (or 302 with &redirect=1)
//   GET ?ids=a,b,c                       -> { urls: { id: url } }  (app grids)
// Cookie or Bearer. Owners see the shop's photos; an artist only their own —
// the same wall the table's RLS draws, mirrored here because the service-role
// client does the reads. Links live 15 minutes; refetch on view, never store.

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const params = new URL(req.url).searchParams;
  const ids = (params.get("ids") ?? params.get("id") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!ids.length) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let q = admin.from("healed_photos").select("id, url").in("id", ids).eq("shop_id", ctx.shopId);
  if (ctx.role !== "owner") {
    if (!ctx.artistId) return NextResponse.json({ urls: {} });
    q = q.eq("artist_id", ctx.artistId);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const urls: Record<string, string> = {};
  for (const row of data ?? []) {
    const signed = await signPhoto(admin, "healed-photos", row.url as string);
    if (signed) urls[row.id as string] = signed;
  }

  if (params.get("redirect") === "1") {
    const one = urls[ids[0]];
    if (!one) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    return NextResponse.redirect(one, 302);
  }
  if (params.get("id") && ids.length === 1) {
    const one = urls[ids[0]];
    if (!one) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    return NextResponse.json({ url: one });
  }
  return NextResponse.json({ urls });
}
