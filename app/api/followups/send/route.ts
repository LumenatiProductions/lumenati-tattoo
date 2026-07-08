import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadTemplates, sendFollowupRow } from "@/lib/followups/job";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["owner", "bookkeeper", "frontdesk"];

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

// Send one follow-up now (human-initiated, so it ignores the scheduled-for date
// and the autosend gate). Renders the template and emails via Resend, then marks
// the row sent / skipped / failed. Body: { id }.
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row } = await supabase
    .from("followups")
    .select("id, booking_id, client_id, kind, channel, scheduled_for, shop_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });

  const tpl = await loadTemplates(supabase);
  const result = await sendFollowupRow(supabase, row, tpl);

  if (result.status === "failed") {
    return NextResponse.json({ ok: false, error: result.result }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: result.status, result: result.result });
}
