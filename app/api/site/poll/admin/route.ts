import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clean } from "@/lib/site/guestbook";

// The shop's side of the poll: see every poll with its counts, post a new
// live question (which retires the current one). Admin only.
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
  const { data: polls } = await g.admin
    .from("site_polls")
    .select("id, question, options, active, created_at")
    .eq("shop_id", g.shopId)
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = (polls ?? []).map((p) => p.id);
  const { data: votes } = ids.length ? await g.admin.from("site_poll_votes").select("poll_id, option_key").in("poll_id", ids) : { data: [] };
  const counts: Record<string, Record<string, number>> = {};
  for (const v of (votes ?? []) as { poll_id: string; option_key: string }[]) {
    counts[v.poll_id] ??= {};
    counts[v.poll_id][v.option_key] = (counts[v.poll_id][v.option_key] ?? 0) + 1;
  }
  return NextResponse.json({ polls: (polls ?? []).map((p) => ({ ...p, counts: counts[p.id] ?? {} })) });
}

export async function POST(req: Request) {
  const g = await gate(req);
  if (!g) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { question?: string; options?: string[] };
  const question = clean(b.question, 140);
  const labels = (Array.isArray(b.options) ? b.options : []).map((o) => clean(o, 40)).filter(Boolean).slice(0, 8);
  if (question.length < 5) return NextResponse.json({ error: "Ask a real question." }, { status: 400 });
  if (labels.length < 2) return NextResponse.json({ error: "At least two options." }, { status: 400 });
  const options = labels.map((label, i) => ({ key: (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opt") + "-" + i, label }));
  await g.admin.from("site_polls").update({ active: false }).eq("shop_id", g.shopId).eq("active", true);
  const { error } = await g.admin.from("site_polls").insert({ shop_id: g.shopId, question, options, active: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
