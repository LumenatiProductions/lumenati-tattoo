import { NextRequest, NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The QA board bus (Grok Bot <-> Claude). Grok files findings (status=new);
// Claude PATCHes them fixed with a commit; Grok re-verifies. Auth is either an
// admin session (the Admin -> QA page) or the shared x-secret (server-to-server,
// for Grok Bot). Backed by the qa_findings table; server-only via the service
// role. See qa/README.md.

const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const STATUSES = new Set(["new", "fixed", "verified", "reopened", "wontfix"]);
const COLS = "id, ext_id, surface, severity, finding, repro, status, owner, commit_sha, note, updated_at";

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.QA_SERVER_SECRET;
  if (secret && req.headers.get("x-secret") === secret) return true;
  const ctx = await resolveStaff(req);
  return ctx?.role === "owner";
}

// GET — the board. Admin session or x-secret. Newest first.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ findings: [] });
  const { data, error } = await admin
    .from("qa_findings")
    .select(COLS)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ findings: [] });
  return NextResponse.json({ findings: data ?? [] });
}

type FindingInput = {
  surface?: string;
  severity?: string;
  finding?: string;
  repro?: string;
  owner?: string;
  ext_id?: string;
};

// POST — file one or many findings. Body: a finding, or { findings: [...] }.
// Dedupes on ext_id (re-filing the same finding updates it). Files as `new`.
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const raw: FindingInput[] = Array.isArray(body?.findings) ? body.findings : [body];
  const now = new Date().toISOString();

  const rows = [];
  for (const f of raw) {
    if (!f?.surface || !f?.finding) {
      return NextResponse.json({ ok: false, error: "surface and finding are required" }, { status: 400 });
    }
    rows.push({
      surface: String(f.surface),
      severity: SEVERITIES.has(f.severity ?? "") ? f.severity : "P2",
      finding: String(f.finding),
      repro: f.repro ? String(f.repro) : null,
      owner: f.owner ? String(f.owner) : "grokbot",
      ext_id: f.ext_id ? String(f.ext_id) : null,
      status: "new",
      updated_at: now,
    });
  }

  // Upsert rows that carry an ext_id (re-filing updates in place); plain insert
  // for the rest.
  const withExt = rows.filter((r) => r.ext_id);
  const withoutExt = rows.filter((r) => !r.ext_id);
  let filed = 0;
  if (withExt.length) {
    const { error, count } = await admin
      .from("qa_findings")
      .upsert(withExt, { onConflict: "ext_id", ignoreDuplicates: false, count: "exact" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    filed += count ?? withExt.length;
  }
  if (withoutExt.length) {
    const { error, count } = await admin.from("qa_findings").insert(withoutExt, { count: "exact" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    filed += count ?? withoutExt.length;
  }
  return NextResponse.json({ ok: true, filed });
}

// PATCH — advance a finding's lifecycle.
// Body: { id | ext_id, status?, commit_sha?, note?, owner? }.
export async function PATCH(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { id, ext_id, status, commit_sha, note, owner } = body ?? {};
  if (id == null && !ext_id) {
    return NextResponse.json({ ok: false, error: "id or ext_id required" }, { status: 400 });
  }
  if (status != null && !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: `invalid status: ${status}` }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status != null) patch.status = status;
  if (commit_sha != null) patch.commit_sha = commit_sha;
  if (note != null) patch.note = note;
  if (owner != null) patch.owner = owner;

  const q = admin.from("qa_findings").update(patch, { count: "exact" });
  const { error, count } = await (id != null ? q.eq("id", id) : q.eq("ext_id", ext_id));
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
