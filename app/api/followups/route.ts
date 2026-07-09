import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueFollowups, loadTemplates } from "@/lib/followups/job";

export const dynamic = "force-dynamic";

// The desk runs outreach; artists don't touch the queue.
const STAFF_ROLES = ["owner"] as const;

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

const can = (role: string | null) => !!role && (STAFF_ROLES as readonly string[]).includes(role);

// List follow-ups, newest-scheduled first, optionally filtered by status or kind.
export async function GET(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const kind = sp.get("kind");

  let query = supabase.from("followups").select("*");
  if (status) query = query.eq("status", status);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, followups: [] }, { status: 500 });
  return NextResponse.json({ followups: data ?? [] });
}

// Scan completed bookings + lapsed/birthday clients and enqueue any new
// follow-ups now (the same work the daily cron does, on demand). Never sends.
export async function POST() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  try {
    const tpl = await loadTemplates(supabase);
    const result = await enqueueFollowups(supabase, tpl);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Change a follow-up's status by hand — skip one the desk doesn't want sent, or
// re-queue a skipped/failed one back to pending.
export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { id, status } = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (status !== "skipped" && status !== "pending") {
    return NextResponse.json({ error: "Status must be 'skipped' or 'pending'." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status,
    result: status === "skipped" ? "Skipped by staff" : null,
  };
  if (status === "pending") patch.sent_at = null;

  const { data, error } = await supabase
    .from("followups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ followup: data });
}
