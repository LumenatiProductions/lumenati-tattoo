import type { SupabaseClient } from "@supabase/supabase-js";
import { isLow } from "@/lib/inventory/job";
import { findNoShowCandidates } from "./no-show";
import { sendExpoPush, tokensForRoles, tokensForArtist } from "@/lib/push/send";

// Daily push reminders (POS-STARTER-6, last mile). Runs from the ops fan-out.
// Nudges owners on their phone with the one-line "what needs you today" — only
// when there IS something, so it's never noise. No-op until devices register a
// push token (needs an EAS projectId / dev build on the app side).

export async function runPushReminders(admin: unknown, shopId: string) {
  const client = admin as SupabaseClient;

  const [invRes, compRes, noShows] = await Promise.all([
    client.from("inventory_items").select("qty, reorder_at").eq("shop_id", shopId),
    client
      .from("compliance_items")
      .select("id")
      .in("status", ["expiring", "expired"])
      .eq("shop_id", shopId),
    findNoShowCandidates(client),
  ]);

  const low = (invRes.data ?? []).filter((i) => isLow(Number(i.qty), Number(i.reorder_at))).length;
  const expiring = (compRes.data ?? []).length;
  // findNoShowCandidates is shop-agnostic; keep only this shop's bookings.
  const noShow = await countInShop(client, shopId, noShows.map((n) => n.id));

  const parts: string[] = [];
  if (low) parts.push(`${low} to reorder`);
  if (expiring) parts.push(`${expiring} license${expiring === 1 ? "" : "s"} expiring`);
  if (noShow) parts.push(`${noShow} no-show${noShow === 1 ? "" : "s"} to review`);

  let pushed = 0;
  if (parts.length) {
    const tokens = await tokensForRoles(client, ["owner"], shopId);
    if (tokens.length) {
      const res = await sendExpoPush(tokens, "Lumenati — today", parts.join(" · "));
      pushed += res.sent;
    }
  }

  // Day-ahead nudge per artist: "you're booked tomorrow" with count + first time.
  pushed += await pushTomorrowsBookings(client, shopId);

  return { feature: "push_reminders", pushed, note: parts.length ? undefined : "shop all clear" };
}

const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

// How many of these booking ids belong to this shop.
async function countInShop(client: SupabaseClient, shopId: string, bookingIds: string[]): Promise<number> {
  if (!bookingIds.length) return 0;
  const { data } = await client.from("bookings").select("id").eq("shop_id", shopId).in("id", bookingIds);
  return (data ?? []).length;
}

async function pushTomorrowsBookings(client: SupabaseClient, shopId: string): Promise<number> {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data: tomorrow } = await client
    .from("bookings")
    .select("artist_id, starts_at")
    .eq("shop_id", shopId)
    .eq("status", "scheduled")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .not("artist_id", "is", null);

  const byArtist = new Map<string, string[]>();
  for (const b of (tomorrow ?? []) as { artist_id: string; starts_at: string }[]) {
    (byArtist.get(b.artist_id) ?? byArtist.set(b.artist_id, []).get(b.artist_id)!).push(b.starts_at);
  }

  let sent = 0;
  for (const [artistId, starts] of byArtist) {
    const tokens = await tokensForArtist(client, artistId);
    if (!tokens.length) continue;
    starts.sort();
    const first = new Date(starts[0]).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: SHOP_TZ,
    });
    const res = await sendExpoPush(
      tokens,
      "Tomorrow at the shop",
      `${starts.length} session${starts.length === 1 ? "" : "s"}, first at ${first}.`,
    );
    sent += res.sent;
  }
  return sent;
}
