import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush, tokensForArtist } from "@/lib/push/send";

// Week-in-review push (artist-favorite #4). Fires Sunday evening shop time
// from /api/ops/weekly: "Your week: $1,240 · 6 clients · 3 rebooked · best
// day Friday." Everything an artist wants to feel about their week, one
// glance, right when the week actually ends. Quiet weeks send nothing — a
// $0 push on Sunday night is a downer, not a product.

const SHOP_TZ = "America/Denver";
const DAY_MS = 86_400_000;

// The classic minute-precision trick: re-read "now" in shop-local wall time,
// keep the delta, and do week math in that frame. A summary push tolerates
// the DST edge minutes this ignores.
function shopWeek(now: Date): { startISO: string; nowShop: Date; toUtc: (d: Date) => Date } {
  const nowShop = new Date(now.toLocaleString("en-US", { timeZone: SHOP_TZ }));
  const delta = now.getTime() - nowShop.getTime();
  const monday = new Date(nowShop);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // back to Monday
  const toUtc = (d: Date) => new Date(d.getTime() + delta);
  return { startISO: toUtc(monday).toISOString(), nowShop, toUtc };
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// opts.at replays the job as if it ran at that instant (cron QA); opts.dry
// composes every line but sends nothing.
export async function runWeekReview(admin: unknown, opts: { at?: Date; dry?: boolean } = {}) {
  const client = admin as SupabaseClient;
  const now = opts.at ?? new Date();
  const { startISO } = shopWeek(now);

  const [{ data: artists }, { data: sales }, { data: weekBookings }, { data: madeThisWeek }] = await Promise.all([
    client.from("artists").select("id, name").eq("active", true),
    client
      .from("sales")
      .select("artist_id, service_cents, tip_cents, created_at")
      .gte("created_at", startISO)
      .lte("created_at", now.toISOString()),
    // Sessions that happened this week — the distinct-client count.
    client
      .from("bookings")
      .select("artist_id, client_id, starts_at")
      .gte("starts_at", startISO)
      .lte("starts_at", now.toISOString())
      .neq("status", "cancelled"),
    // Bookings CREATED this week for a future date — the rebook count. This
    // is the number the rebook-at-the-paid-moment button exists to move.
    client
      .from("bookings")
      .select("artist_id, created_at, starts_at")
      .gte("created_at", startISO)
      .lte("created_at", now.toISOString())
      .gt("starts_at", now.toISOString())
      .neq("status", "cancelled"),
  ]);

  const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: SHOP_TZ });

  let pushed = 0;
  const lines: Record<string, string> = {};
  for (const a of (artists ?? []) as { id: string; name: string }[]) {
    const mySales = ((sales ?? []) as { artist_id: string | null; service_cents: number; tip_cents: number; created_at: string }[]).filter(
      (s) => s.artist_id === a.id,
    );
    const cents = mySales.reduce((t, s) => t + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
    if (cents <= 0) continue; // quiet week, no push

    const seen = ((weekBookings ?? []) as { artist_id: string | null; client_id: string | null }[]).filter(
      (b) => b.artist_id === a.id,
    );
    const clients = new Set(seen.map((b) => b.client_id).filter(Boolean)).size;
    const rebooked = ((madeThisWeek ?? []) as { artist_id: string | null }[]).filter((b) => b.artist_id === a.id).length;

    // Best day by earnings, named in shop time.
    const byDay = new Map<string, number>();
    for (const s of mySales) {
      const d = dayName.format(new Date(s.created_at));
      byDay.set(d, (byDay.get(d) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
    }
    const best = [...byDay.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];

    const bits = [money(cents)];
    if (clients) bits.push(`${clients} client${clients === 1 ? "" : "s"}`);
    else if (mySales.length) bits.push(`${mySales.length} ticket${mySales.length === 1 ? "" : "s"}`);
    if (rebooked) bits.push(`${rebooked} rebooked`);
    if (best && byDay.size > 1) bits.push(`best day ${best}`);
    const body = `Your week: ${bits.join(" · ")}.`;

    if (opts.dry) {
      lines[a.name] = body;
      continue;
    }
    const tokens = await tokensForArtist(client, a.id);
    if (!tokens.length) continue;
    const res = await sendExpoPush(tokens, "Week in review", body);
    if (res.ok) {
      pushed += res.sent;
      lines[a.name] = body;
    }
  }

  return { pushed, lines };
}
