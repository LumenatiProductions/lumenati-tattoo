import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/report-error";

// The early-warning funnel. Every operational failure worth an owner's
// attention lands here: it writes one ops_events row (best-effort, never throws
// — a broken logger must never break the thing it's watching) and, for real
// errors, also pings the Slack alert webhook for real-time. The Health page
// reads the rows back; Slack is the pager.

export type OpsKind =
  | "payment_failed"
  | "dispute"
  | "sms_failed"
  | "email_failed"
  | "webhook_error"
  | "cron_error"
  | "client_error"
  | "instant_payout_fee";

export type OpsSeverity = "info" | "warn" | "error";

export async function logOpsEvent(
  admin: SupabaseClient | null,
  event: {
    shopId?: string | null;
    kind: OpsKind;
    severity?: OpsSeverity;
    summary: string;
    detail?: string | null;
  },
): Promise<void> {
  const severity = event.severity ?? "warn";
  try {
    if (admin) {
      await admin.from("ops_events").insert({
        shop_id: event.shopId ?? null,
        kind: event.kind,
        severity,
        summary: event.summary.slice(0, 300),
        detail: event.detail ? event.detail.slice(0, 2000) : null,
      });
    }
  } catch {
    /* a failing logger must never take down the caller */
  }
  // Real errors also page us in real time (no-op if ALERT_WEBHOOK_URL is unset).
  if (severity === "error") {
    await reportError(event.kind, new Error(event.detail ? `${event.summary} — ${event.detail}` : event.summary));
  }
}
