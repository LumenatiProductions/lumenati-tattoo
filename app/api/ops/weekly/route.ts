import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWeekReview } from "@/lib/automation/week-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sunday-evening fan-out (vercel.json: Monday 01:00 UTC = Sunday evening shop
// time). Same shape as /api/ops/daily: CRON_SECRET-gated, each job isolated.
// One job today — the artist week-in-review push — but the fan-out shape means
// the next weekly thing (review velocity, waitlist digest) just joins the list.
//
// QA levers (still secret-gated): ?at=<ISO> replays the run as of that
// instant, ?dry=1 composes every push line without sending.
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

  const url = new URL(req.url);
  const atRaw = url.searchParams.get("at");
  const at = atRaw ? new Date(atRaw) : undefined;
  const dry = url.searchParams.get("dry") === "1";

  const ran: Record<string, unknown> = {};
  try {
    ran.week_review = await runWeekReview(admin, { at: at && !Number.isNaN(at.getTime()) ? at : undefined, dry });
  } catch (e) {
    ran.week_review = { error: e instanceof Error ? e.message : "failed" };
  }
  return NextResponse.json({ ok: true, ran });
}
