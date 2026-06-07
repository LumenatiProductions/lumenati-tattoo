import type { SupabaseClient } from "@supabase/supabase-js";
import { isLow } from "@/lib/inventory/job";
import { findNoShowCandidates } from "./no-show";
import { sendExpoPush, tokensForRoles } from "@/lib/push/send";

// Daily push reminders (POS-STARTER-6, last mile). Runs from the ops fan-out.
// Nudges owners on their phone with the one-line "what needs you today" — only
// when there IS something, so it's never noise. No-op until devices register a
// push token (needs an EAS projectId / dev build on the app side).

export async function runPushReminders(admin: unknown) {
  const client = admin as SupabaseClient;

  const [invRes, compRes, noShows] = await Promise.all([
    client.from("inventory_items").select("qty, reorder_at"),
    client.from("compliance_items").select("id").in("status", ["expiring", "expired"]),
    findNoShowCandidates(client),
  ]);

  const low = (invRes.data ?? []).filter((i) => isLow(Number(i.qty), Number(i.reorder_at))).length;
  const expiring = (compRes.data ?? []).length;
  const noShow = noShows.length;

  const parts: string[] = [];
  if (low) parts.push(`${low} to reorder`);
  if (expiring) parts.push(`${expiring} license${expiring === 1 ? "" : "s"} expiring`);
  if (noShow) parts.push(`${noShow} no-show${noShow === 1 ? "" : "s"} to review`);
  if (!parts.length) return { feature: "push_reminders", pushed: 0, note: "all clear" };

  const tokens = await tokensForRoles(client, ["owner"]);
  if (!tokens.length) return { feature: "push_reminders", pushed: 0, note: "no registered devices" };

  const res = await sendExpoPush(tokens, "Lumenati — today", parts.join(" · "));
  return { feature: "push_reminders", pushed: res.sent };
}
