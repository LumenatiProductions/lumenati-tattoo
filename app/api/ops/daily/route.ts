import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyJob as clientsJob } from "@/lib/clients/job";
import { runDailyJob as bookingsJob } from "@/lib/bookings/job";
import { runDailyJob as complianceJob } from "@/lib/compliance/job";
import { runDailyJob as inventoryJob } from "@/lib/inventory/job";
import { runDailyJob as followupsJob } from "@/lib/followups/job";
import { runDailyJob as rentJob } from "@/lib/rent/job";
import { runDailyJob as reviewsJob } from "@/lib/reviews/job";
import { runNoShowForfeit } from "@/lib/automation/no-show";
import { runMorningBrief } from "@/lib/automation/brief";
import { runPushReminders } from "@/lib/automation/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Single daily fan-out (the plan caps cron frequency, so we run ONE entry and
// fan out, rather than one cron per feature). Each feature implements its own
// runDailyJob in its lib; this route just calls them, each isolated in a
// try/catch so one feature failing never blocks the others. CRON_SECRET-gated.
//
// Cross-feature automation (POS-STARTER-4) runs LAST: no-show forfeit before the
// morning brief, so the brief reflects the just-settled state. Order matters.
const JOBS: [string, (admin: unknown) => Promise<unknown>][] = [
  ["clients", clientsJob],
  ["bookings", bookingsJob],
  ["compliance", complianceJob],
  ["inventory", inventoryJob],
  ["followups", followupsJob],
  ["rent_invoices", rentJob],
  ["review_snapshot", reviewsJob],
  ["no_show", runNoShowForfeit],
  ["morning_brief", runMorningBrief],
  ["push_reminders", runPushReminders],
];

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

  const ran: Record<string, unknown> = {};
  for (const [name, job] of JOBS) {
    try {
      ran[name] = await job(admin);
    } catch (e) {
      ran[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ ok: true, ran });
}
