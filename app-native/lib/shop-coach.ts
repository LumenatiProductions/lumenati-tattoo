import { supabase } from "./supabase";
import { pageAll } from "./personal";
import { todayLocal } from "./dates";

// The SHOP coach: the artist coach's older sibling. Same philosophy — plain
// English, deterministic math on the shop's own rows, no AI, no guessing —
// but read across every chair at once: where the shop's next dollar is
// (rebooking, empty chairs, quiet days, deposits) and where it's leaking
// (rent outstanding, follow-ups going cold, one artist carrying the room).

export type ShopSale = {
  created_at: string;
  service_cents: number;
  tip_cents: number;
  method: string;
  artist_id: string | null;
};

export type ShopBooking = {
  starts_at: string;
  status: string;
  client_id: string | null;
  artist_id: string | null;
  deposit_status: string;
};

export type ShopMoney = { sales: ShopSale[]; bookings: ShopBooking[] };

// The year's rows, shop-wide (owner RLS sees everything). Paged — the 1000-row
// PostgREST clamp silently undercounts money otherwise.
export async function loadShopMoney(): Promise<ShopMoney> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [sales, bookings] = await Promise.all([
    pageAll<ShopSale>((from, to) =>
      supabase
        .from("ledger_sales")
        .select("created_at, service_cents, tip_cents, method, artist_id")
        .gte("created_at", yearStart)
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
    pageAll<ShopBooking>((from, to) =>
      supabase
        .from("bookings")
        .select("starts_at, status, client_id, artist_id, deposit_status")
        .gte("starts_at", yearStart)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .range(from, to),
    ),
  ]);
  return { sales, bookings };
}

export type ShopTip = { title: string; body: string; href?: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const usd = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const weekKey = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getTime() - day * 86400000).toISOString().slice(0, 10);
};

export function shopCoachTips(opts: {
  sales: ShopSale[];
  bookings: ShopBooking[];
  artistNames: Map<string, string>;
  activeArtists: number;
  rentOutstandingCents: number;
  followupsDue: number;
  waitlistCount: number;
}): ShopTip[] {
  const tips: ShopTip[] = [];
  const todayKey = todayLocal();
  const sixtyAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const recent = opts.sales.filter((s) => (s.created_at || "").slice(0, 10) >= sixtyAgo);
  const recentTotal = recent.reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const avgTicket = recent.length ? Math.round(recentTotal / recent.length) : 0;

  // 1. Rebooking, shop-wide — the biggest lever, multiplied by every chair.
  const seen = new Set<string>();
  const rebooked = new Set<string>();
  for (const b of opts.bookings) {
    if (!b.client_id) continue;
    const d = (b.starts_at || "").slice(0, 10);
    if (d >= sixtyAgo && d < todayKey) seen.add(b.client_id);
  }
  for (const b of opts.bookings) {
    if (!b.client_id || !seen.has(b.client_id)) continue;
    if ((b.starts_at || "").slice(0, 10) >= todayKey) rebooked.add(b.client_id);
  }
  if (seen.size >= 8 && rebooked.size / seen.size < 0.5) {
    const missing = seen.size - rebooked.size;
    tips.push({
      title: "The shop's rebook rate is the whole ballgame",
      body: `${rebooked.size} of the ${seen.size} clients the shop has seen in the last two months have a next session booked. Those ${missing} unbooked clients are ${usd(
        avgTicket * missing,
      )} of near-certain work at your ${usd(avgTicket)} average ticket. Make "book the next one in the chair" a house rule and this number moves in a week.`,
      href: "/followups",
    });
  }

  // 2. Rent outstanding — money the shop already earned but hasn't collected.
  if (opts.rentOutstandingCents > 0) {
    tips.push({
      title: `${usd(opts.rentOutstandingCents)} in booth rent is outstanding`,
      body: "That's not revenue to chase, it's revenue already owed. Artists can now pay by card straight from their phone (or log cash in the app), and the nudge ladder keeps reminding them so you never have to be the bad guy.",
      href: "/rent",
    });
  }

  // 3. One chair carrying the room — concentration is fragility.
  const byArtist = new Map<string, number>();
  for (const s of recent) {
    if (!s.artist_id) continue;
    byArtist.set(s.artist_id, (byArtist.get(s.artist_id) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
  }
  const ranked = [...byArtist.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length >= 2 && recentTotal > 0) {
    const [topId, topCents] = ranked[0];
    const share = topCents / recentTotal;
    if (share > 0.55) {
      tips.push({
        title: `${opts.artistNames.get(topId) ?? "One artist"} is ${Math.round(share * 100)}% of the shop`,
        body: `Great for them, fragile for you. One vacation, one poached chair, and the month caves. The fix isn't slowing them down, it's filling the other books: push the quieter artists' flash walls and healed shots, and route walk-ins their way first.`,
      });
    }
  }

  // 4. The quiet-day pattern, shop-wide.
  const byDow = new Map<number, { total: number; days: Set<string> }>();
  for (const s of recent) {
    const d = (s.created_at || "").slice(0, 10);
    if (!d) continue;
    const k = new Date(`${d}T00:00:00`).getDay();
    const cell = byDow.get(k) ?? { total: 0, days: new Set<string>() };
    cell.total += (s.service_cents ?? 0) + (s.tip_cents ?? 0);
    cell.days.add(d);
    byDow.set(k, cell);
  }
  const dayAvgs = [...byDow.entries()]
    .filter(([, v]) => v.days.size >= 2)
    .map(([k, v]) => ({ dow: k, avg: Math.round(v.total / v.days.size) }))
    .sort((a, b) => b.avg - a.avg);
  if (dayAvgs.length >= 4) {
    const top = dayAvgs[0];
    const low = dayAvgs[dayAvgs.length - 1];
    if (top.avg > low.avg * 2.5 && low.avg >= 0) {
      tips.push({
        title: `${DAY_NAMES[low.dow]}s run at ${Math.round((low.avg / top.avg) * 100)}% of a ${DAY_NAMES[top.dow]}`,
        body: `An average ${DAY_NAMES[top.dow]} brings the shop ${usd(top.avg)}; a ${DAY_NAMES[low.dow]} brings ${usd(
          low.avg,
        )}. Quiet days are where flash events, walk-in specials, and guest spots pay for themselves. You're not inventing demand, you're moving it to where the chairs are empty.`,
      });
    }
  }

  // 5. Deposit discipline — the no-show shield.
  const upcoming = opts.bookings.filter(
    (b) => b.status === "scheduled" && (b.starts_at || "").slice(0, 10) >= todayKey,
  );
  const bare = upcoming.filter((b) => b.deposit_status === "none" || !b.deposit_status);
  if (upcoming.length >= 6 && bare.length / upcoming.length > 0.6) {
    tips.push({
      title: `${bare.length} of ${upcoming.length} upcoming bookings hold no deposit`,
      body: `A deposit is the difference between a no-show costing the client something and costing YOU the chair. Shops that require even $50 down see no-shows drop by half. The booking form takes a deposit in one field.`,
      href: "/bookings",
    });
  }

  // 6. Follow-ups going cold — the cheapest ticket the shop can book.
  if (opts.followupsDue >= 3) {
    tips.push({
      title: `${opts.followupsDue} follow-ups are sitting due`,
      body: `Aftercare check-ins and healed-shot asks reopen conversations that end in bookings, and they're already written, waiting for a send. A follow-up costs nothing; a cold client costs the next piece.`,
      href: "/followups",
    });
  }

  // 7. Best-week chase, shop-wide, late-week only.
  const thisWeek = weekKey(todayKey);
  const byWeek = new Map<string, number>();
  for (const s of opts.sales) {
    const d = (s.created_at || "").slice(0, 10);
    if (d) byWeek.set(weekKey(d), (byWeek.get(weekKey(d)) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
  }
  const cur = byWeek.get(thisWeek) ?? 0;
  const best = Math.max(0, ...[...byWeek.entries()].filter(([k]) => k !== thisWeek).map(([, v]) => v));
  const dow = new Date().getDay();
  if (best > 0 && cur > best * 0.6 && cur < best && (dow >= 4 || dow === 0)) {
    tips.push({
      title: `The shop is ${usd(best - cur)} from its best week this year`,
      body: `Best week so far: ${usd(best)}. This week: ${usd(cur)}, with days left. ${
        opts.waitlistCount > 0
          ? `There are ${opts.waitlistCount} people on the waitlist. Offer an open slot and this record falls.`
          : "One flash day or a couple of walk-ins closes it."
      }`,
    });
  }

  return tips;
}
