// Per-shop on/off switches for automated message streams that aren't already
// covered by followup_templates.enabled. Absent row (or absent table, before
// the migration lands) means ON — the env master switches still gate real
// delivery, so default-on is safe and matches how the jobs behaved before.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageStream = "rent_nudges" | "weekly_summary";

export async function streamEnabled(
  client: SupabaseClient,
  shopId: string,
  stream: MessageStream,
): Promise<boolean> {
  const { data, error } = await client
    .from("message_streams")
    .select("enabled")
    .eq("shop_id", shopId)
    .eq("stream", stream)
    .maybeSingle();
  if (error) return true;
  return data ? !!data.enabled : true;
}

/** One round-trip version for job loops: shopId -> enabled, absent = true. */
export async function streamEnabledMap(
  client: SupabaseClient,
  stream: MessageStream,
): Promise<Map<string, boolean>> {
  const { data, error } = await client
    .from("message_streams")
    .select("shop_id, enabled")
    .eq("stream", stream);
  const map = new Map<string, boolean>();
  if (error || !data) return map;
  for (const r of data) map.set(r.shop_id as string, !!r.enabled);
  return map;
}
