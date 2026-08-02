import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logOpsEvent } from "@/lib/ops-events";

export const dynamic = "force-dynamic";

// Client-side error funnel: the error boundaries POST here; we forward to the
// alert webhook (if configured). Clipped hard so it can't be abused as a relay,
// same-origin only, and throttled per instance so a loop can't flood the alerts.
let sentCount = 0;
let sentWindowStart = 0;

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const host = req.headers.get("host") ?? "";
  // Same-origin only. The error boundary is a browser fetch, which always sends
  // an Origin header, so a MISSING origin means a non-browser caller (curl) and
  // is dropped too — previously an absent Origin skipped the check entirely and
  // let anyone relay text to the alert webhook.
  if (!origin || !host || !origin.endsWith(`//${host}`)) {
    return NextResponse.json({ ok: true });
  }
  const now = Date.now();
  if (now - sentWindowStart > 60_000) {
    sentWindowStart = now;
    sentCount = 0;
  }
  if (sentCount >= 20) return NextResponse.json({ ok: true });
  const b = (await req.json().catch(() => ({}))) as { where?: string; message?: string };
  const where = String(b.where ?? "client").slice(0, 100);
  const message = String(b.message ?? "").slice(0, 800);
  if (message) {
    sentCount++;
    // Record the app crash so it shows on the Health page; error severity also
    // pings the Slack alert webhook in real time.
    await logOpsEvent(createAdminClient(), {
      kind: "client_error",
      severity: "error",
      summary: `App error: ${message.slice(0, 120)}`,
      detail: `where: ${where}\n${message}`,
    });
  }
  return NextResponse.json({ ok: true });
}
