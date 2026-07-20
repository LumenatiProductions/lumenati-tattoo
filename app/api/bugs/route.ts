import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileBug } from "@/lib/bugs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bug reporter intake for both surfaces (web admin + phone app). Accepts a note,
// the screen the reporter was on, and an optional screenshot; stores it and
// pings Slack. The reporter's identity is resolved best-effort for context but
// a report is never refused for being unauthenticated — a broken sign-in is
// exactly the kind of thing worth reporting.

// The endpoint is intentionally public, so bound it: a hard size cap keeps a
// multi-megabyte screenshot from bloating the DB, and a per-instance throttle
// keeps an anonymous loop from flooding the table + Slack. Best-effort (memory
// resets per cold start), same pattern as report-error.
const MAX_NOTE = 4_000;
const MAX_SCREENSHOT = 3_000_000; // ~3MB base64 data URI
const MAX_META = 8_000;
const hits = new Map<string, number[]>();
const RATE_LIMIT = 10; // per IP per window
const WINDOW_MS = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear(); // crude unbounded-growth guard
  return recent.length > RATE_LIMIT;
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });

  const b = (await req.json().catch(() => ({}))) as {
    note?: string;
    url?: string;
    surface?: string;
    screenshot?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
  };
  const note = (b.note ?? "").trim().slice(0, MAX_NOTE);
  if (note.length < 2) return NextResponse.json({ error: "Add a quick note about what went wrong." }, { status: 400 });
  const screenshot =
    typeof b.screenshot === "string" && b.screenshot.length <= MAX_SCREENSHOT ? b.screenshot : null;
  const meta = b.meta && JSON.stringify(b.meta).length <= MAX_META ? b.meta : null;

  // Context, best-effort: cookie session (web) or Bearer (app). Reads the
  // reporter's own profile only, so this never leaks across shops.
  let reporterEmail: string | null = null;
  let reporterRole: string | null = null;
  let shopId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const bearer = req.headers.get("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
    const email = user?.email ?? (token ? (await admin.auth.getUser(token)).data.user?.email ?? null : null);
    if (email) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role, shop_id")
        .eq("email", email)
        .maybeSingle();
      reporterEmail = email;
      reporterRole = (profile?.role as string | null) ?? null;
      shopId = (profile?.shop_id as string | null) ?? null;
    }
  } catch {
    /* anonymous report is fine */
  }

  try {
    const result = await fileBug(admin, {
      note,
      url: (b.url ?? "").slice(0, 2_000) || null,
      surface: (b.surface ?? "").slice(0, 200) || null,
      screenshot,
      userAgent: b.userAgent ?? req.headers.get("user-agent"),
      reporterEmail,
      reporterRole,
      shopId,
      meta,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not file that — try again." }, { status: 500 });
  }
}
