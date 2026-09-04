import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// The shop's side of the guestbook: read everything, approve, delete. Admin
// only; the table has no RLS policies so this route is the only door.
export const dynamic = "force-dynamic";

async function gate(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx || ctx.role !== "owner") return null;
  const admin = createAdminClient();
  return admin ? { admin, shopId: ctx.shopId } : null;
}

export async function GET(req: Request) {
  const g = await gate(req);
  if (!g) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await g.admin
    .from("guestbook_entries")
    .select("id, name, from_where, message, approved, created_at")
    .eq("shop_id", g.shopId)
    .order("created_at", { ascending: false })
    .limit(300);
  return NextResponse.json({ entries: data ?? [] });
}

export async function PATCH(req: Request) {
  const g = await gate(req);
  if (!g) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; approved?: boolean };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await g.admin.from("guestbook_entries").update({ approved: !!b.approved }).eq("id", b.id).eq("shop_id", g.shopId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await gate(req);
  if (!g) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await g.admin.from("guestbook_entries").delete().eq("id", id).eq("shop_id", g.shopId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
