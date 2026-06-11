import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { syncSquare } from "@/lib/square/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // honored on paid plans; Square paging can take a moment

// Automatic sync — triggered by Vercel Cron (see vercel.json) or manually with
// the CRON_SECRET. No user session, so it writes with the service-role client.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }
  try {
    const result = await syncSquare(admin);
    return NextResponse.json({ ok: true, via: "cron", ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Owner-triggered "Sync now" — from the web admin (cookie) or the app (Bearer).
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "owner") {
    return NextResponse.json({ error: "Owners only" }, { status: 403 });
  }

  try {
    const result = await syncSquare(me.db);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
