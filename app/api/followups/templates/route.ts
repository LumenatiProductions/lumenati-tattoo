import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FOLLOWUP_KINDS,
  resolveTemplate,
  type FollowupKind,
} from "@/lib/followups/templates";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["owner"];
const READ_ROLES = ["owner", "artist"];

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

const isKind = (k: unknown): k is FollowupKind =>
  typeof k === "string" && (FOLLOWUP_KINDS as string[]).includes(k);

// All four templates, DB edits merged over the code defaults. Always returns one
// entry per kind so the editor renders even before anything's been saved.
export async function GET() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { data } = await supabase
    .from("followup_templates")
    .select("kind, subject, body, lead_days, enabled");
  const byKind = new Map((data || []).map((r) => [r.kind, r]));
  const templates = FOLLOWUP_KINDS.map((k) => resolveTemplate(k, byKind.get(k)));
  return NextResponse.json({ templates });
}

// Save one template. Body: { kind, subject, body, lead_days, enabled }.
export async function PUT(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    kind?: string;
    subject?: string;
    body?: string;
    lead_days?: number;
    enabled?: boolean;
  };
  if (!isKind(b.kind)) {
    return NextResponse.json({ error: "Unknown template kind" }, { status: 400 });
  }

  const row = {
    kind: b.kind,
    subject: (b.subject ?? "").trim(),
    body: (b.body ?? "").trim(),
    lead_days: Math.max(0, Math.round(b.lead_days ?? 0)),
    enabled: b.enabled ?? true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("followup_templates")
    .upsert(row, { onConflict: "kind" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Echo the resolved template (defaults fill any field left blank).
  return NextResponse.json({ template: resolveTemplate(b.kind, row) });
}
