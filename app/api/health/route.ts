import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The early-warning read side. Owner-only. Returns recent operational failures
// (this shop's, plus infra-level events with no shop) so the Health page can
// show what's gone wrong and let the owner mark things handled.
//   GET  : { events, unresolved } for the last 30 days
//   POST : { action: 'resolve', id } | { action: 'resolve_all' }

const WINDOW_DAYS = 30;

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ events: [], unresolved: 0 });

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("ops_events")
    .select("id, kind, severity, summary, detail, created_at, resolved_at")
    .or(`shop_id.eq.${ctx.shopId},shop_id.is.null`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  // Table not created yet: the page shows an all-clear empty state.
  if (error) return NextResponse.json({ events: [], unresolved: 0 });

  const events = data ?? [];
  const unresolved = events.filter((e) => !e.resolved_at).length;
  return NextResponse.json({ events, unresolved });
}

export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string };
  const now = new Date().toISOString();
  // Only ever touch this shop's own rows (or its shared infra rows).
  const scoped = `shop_id.eq.${ctx.shopId},shop_id.is.null`;

  if (b.action === "resolve" && b.id) {
    const { error } = await admin
      .from("ops_events")
      .update({ resolved_at: now })
      .eq("id", b.id)
      .or(scoped);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resolve_all") {
    const { error } = await admin
      .from("ops_events")
      .update({ resolved_at: now })
      .is("resolved_at", null)
      .or(scoped);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
