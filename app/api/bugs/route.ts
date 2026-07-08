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

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as {
    note?: string;
    url?: string;
    surface?: string;
    screenshot?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
  };
  const note = (b.note ?? "").trim();
  if (note.length < 2) return NextResponse.json({ error: "Add a quick note about what went wrong." }, { status: 400 });

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
      url: b.url ?? null,
      surface: b.surface ?? null,
      screenshot: b.screenshot ?? null,
      userAgent: b.userAgent ?? req.headers.get("user-agent"),
      reporterEmail,
      reporterRole,
      shopId,
      meta: b.meta ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not file that — try again." }, { status: 500 });
  }
}
