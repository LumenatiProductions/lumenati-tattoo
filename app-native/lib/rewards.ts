import type { MoneySnapshot, GoalsLoad, SaleRow } from "./personal";
import { earnedInRange, weeklyStreak } from "./personal";

// Earned achievements, computed from the artist's OWN numbers. Tasteful, never
// corny: an icon + a short label, unlocked by real milestones. Powers the
// RewardsStrip on the money home. "next" is the closest thing left to chase.

export type BadgeTone = "brand" | "gold" | "good";
export type Badge = { id: string; label: string; icon: string; tone: BadgeTone };

const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

// Local calendar date of a UTC timestamp (evening sales must count as today,
// not tomorrow-UTC) — same anchoring as localToday so buckets line up.
const localDate = (iso: string) => {
  if (!iso) return "";
  const t = new Date(iso);
  return isNaN(t.getTime())
    ? iso.slice(0, 10)
    : new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function dayTotals(sales: SaleRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sales) {
    const d = localDate(s.created_at || "");
    if (!d) continue;
    m.set(d, (m.get(d) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
  }
  return m;
}

const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function computeRewards(
  snap: MoneySnapshot,
  goals: GoalsLoad,
): { earned: Badge[]; next: Badge | null } {
  const sales = snap.sales;
  const tickets = sales.length;
  const ytd = earnedInRange(sales, "year").total;
  const streak = goals.weekly_cents > 0 ? weeklyStreak(sales, goals.weekly_cents) : 0;
  const weekTotal = earnedInRange(sales, "week").total;
  const goalWeekHit = goals.weekly_cents > 0 && weekTotal >= goals.weekly_cents;

  const days = dayTotals(sales);
  const bestDay = days.size ? Math.max(...days.values()) : 0;
  const todayCents = days.get(localToday()) ?? 0;
  const recordDay = todayCents > 0 && todayCents >= bestDay;

  // Ordered easiest → hardest, so `next` surfaces the nearest goal.
  const catalog: (Badge & { earned: boolean })[] = [
    { id: "first", label: "First ticket", icon: "flash", tone: "brand", earned: tickets >= 1 },
    { id: "goalweek", label: "Weekly goal", icon: "checkmark-circle", tone: "good", earned: goalWeekHit },
    { id: "t25", label: "25 tickets", icon: "ribbon", tone: "brand", earned: tickets >= 25 },
    { id: "tax", label: "Tax-ready", icon: "shield-checkmark", tone: "good", earned: goals.saved && goals.tax_setaside_pct > 0 && ytd > 0 },
    { id: "s3", label: "3-week streak", icon: "flame", tone: "gold", earned: streak >= 3 },
    { id: "record", label: "Record day", icon: "star", tone: "gold", earned: recordDay },
    { id: "k10", label: `${money(1_000_000)} year`, icon: "trending-up", tone: "good", earned: ytd >= 1_000_000 },
    { id: "t100", label: "100 tickets", icon: "trophy", tone: "gold", earned: tickets >= 100 },
    { id: "s10", label: "10-week streak", icon: "flame", tone: "gold", earned: streak >= 10 },
    { id: "k50", label: `${money(5_000_000)} year`, icon: "diamond", tone: "gold", earned: ytd >= 5_000_000 },
  ];

  const stripMeta = ({ id, label, icon, tone }: Badge): Badge => ({ id, label, icon, tone });
  return {
    earned: catalog.filter((b) => b.earned).map(stripMeta),
    next: catalog.find((b) => !b.earned) ? stripMeta(catalog.find((b) => !b.earned)!) : null,
  };
}
