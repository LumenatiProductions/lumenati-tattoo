import type { SaleRow, BookingRow, Expense } from "./personal";
import { todayLocal } from "@/lib/dates";

// The coach: plain-English, numbers-from-their-own-work suggestions for
// artists. Two layers, practice first:
//   1. PRACTICE — where their next dollar actually is (rebooking, open days,
//      their best day, tips, the best-week chase). Fresh, specific, computed
//      from their own sales + bookings. These lead.
//   2. MONEY TRUTHS — taxes, goals, deductions. Important but repetitive, so
//      they follow the practice reads.
// Everything is deterministic math on their RLS-scoped rows — no AI, no
// guessing, and it NEVER claims withholding that isn't happening. Tax advice
// follows the pay setup: booth renters are 1099 contractors who move their own
// tax money; payroll artists have Gusto withhold on their wages.

const weekKey = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - day * 86400000);
  return monday.toISOString().slice(0, 10);
};

/** Average weekly take over the last `weeks` COMPLETE weeks (0 if no history). */
export function avgWeeklyCents(sales: SaleRow[], weeks = 8): number {
  const thisWeek = weekKey(todayLocal());
  const byWeek = new Map<string, number>();
  for (const s of sales) {
    const d = (s.created_at || "").slice(0, 10);
    if (!d) continue;
    const wk = weekKey(d);
    if (wk === thisWeek) continue; // current week is incomplete
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
  }
  const totals = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, weeks).map(([, v]) => v);
  if (!totals.length) return 0;
  return Math.round(totals.reduce((a, v) => a + v, 0) / totals.length);
}

/** A goal worth chasing: ~10% over their real average, rounded up to $50. */
export function suggestedWeeklyCents(sales: SaleRow[]): number {
  const avg = avgWeeklyCents(sales);
  if (!avg) return 0;
  return Math.ceil((avg * 1.1) / 5000) * 5000;
}

export type CoachTip = { title: string; body: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const localDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/**
 * Practice reads — where the next dollar is, from their own sales + bookings.
 * Ordered by how much money each one usually moves. Each fires only when the
 * data is real (enough volume) and the read is actionable, so a good week can
 * legitimately produce none.
 */
export function practiceInsights(sales: SaleRow[], bookings: BookingRow[]): CoachTip[] {
  const tips: CoachTip[] = [];
  const todayKey = todayLocal();

  // Shared: last-60-day ticket economics.
  const sixtyAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const recent = sales.filter((s) => (s.created_at || "").slice(0, 10) >= sixtyAgo);
  const recentTotal = recent.reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const avgTicket = recent.length ? Math.round(recentTotal / recent.length) : 0;

  // 1. Rebooking — the single biggest lever a tattoo artist has.
  const seen = new Set<string>();
  const rebooked = new Set<string>();
  for (const b of bookings) {
    if (!b.client_id) continue;
    const d = (b.starts_at || "").slice(0, 10);
    if (d >= sixtyAgo && d < todayKey) seen.add(b.client_id);
  }
  for (const b of bookings) {
    if (!b.client_id || !seen.has(b.client_id)) continue;
    if ((b.starts_at || "").slice(0, 10) >= todayKey) rebooked.add(b.client_id);
  }
  if (seen.size >= 5 && rebooked.size / seen.size < 0.5) {
    tips.push({
      title: "The rebook happens in the chair",
      body: `${rebooked.size} of the ${seen.size} clients you've seen in the last two months have their next session on the books. The artists who stay booked ask while they're wrapping the piece — the client is never more sold than that moment. At your ${usd(
        avgTicket,
      )} average ticket, one extra rebook a week is real money you don't have to chase.`,
    });
  }

  // 2. Open days ahead — empty chair math at their own daily average.
  const bookedAhead = new Set<string>();
  for (const b of bookings) {
    const d = (b.starts_at || "").slice(0, 10);
    if (d >= todayKey) bookedAhead.add(d);
  }
  const daysWorked = new Set(recent.map((s) => (s.created_at || "").slice(0, 10))).size;
  const dailyAvg = daysWorked ? Math.round(recentTotal / daysWorked) : 0;
  let openAhead = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    if (!bookedAhead.has(d)) openAhead++;
  }
  if (openAhead >= 4 && dailyAvg > 0 && recent.length >= 5) {
    tips.push({
      title: `${openAhead} of your next 7 days are open`,
      body: `On a day you work, you average ${usd(dailyAvg)}. That's ${usd(
        dailyAvg * openAhead,
      )} of open chair this week. Two healed shots on your page (Healed shots tab — caption's already written) is the cheapest way to fill one.`,
    });
  }

  // 3. The best-week chase — only when it's genuinely close and late-week.
  const thisWeek = weekKey(todayKey);
  const byWeek = new Map<string, number>();
  for (const s of sales) {
    const d = (s.created_at || "").slice(0, 10);
    if (d) byWeek.set(weekKey(d), (byWeek.get(weekKey(d)) ?? 0) + (s.service_cents ?? 0) + (s.tip_cents ?? 0));
  }
  const cur = byWeek.get(thisWeek) ?? 0;
  const best = Math.max(0, ...[...byWeek.entries()].filter(([k]) => k !== thisWeek).map(([, v]) => v));
  const dow = new Date().getDay(); // Thu–Sun = chase window
  if (best > 0 && cur > best * 0.6 && cur < best && (dow >= 4 || dow === 0)) {
    tips.push({
      title: `${usd(best - cur)} from your best week this year`,
      body: `Your best week so far is ${usd(best)}. You're at ${usd(cur)} with days left. One walk-in or a flash piece closes it — weeks like this are how the average moves.`,
    });
  }

  // 4. Their strongest day — pattern they can protect and stack.
  const byDow = new Map<number, { total: number; days: Set<string> }>();
  for (const s of recent) {
    const d = (s.created_at || "").slice(0, 10);
    if (!d) continue;
    const k = localDay(d).getDay();
    const cell = byDow.get(k) ?? { total: 0, days: new Set<string>() };
    cell.total += (s.service_cents ?? 0) + (s.tip_cents ?? 0);
    cell.days.add(d);
    byDow.set(k, cell);
  }
  const dayAvgs = [...byDow.entries()]
    .filter(([, v]) => v.days.size >= 2)
    .map(([k, v]) => ({ dow: k, avg: Math.round(v.total / v.days.size) }))
    .sort((a, b) => b.avg - a.avg);
  if (dayAvgs.length >= 3 && dayAvgs[0].avg > dayAvgs[dayAvgs.length - 1].avg * 1.75) {
    const top = dayAvgs[0];
    tips.push({
      title: `${DAY_NAMES[top.dow]}s are your engine`,
      body: `An average ${DAY_NAMES[top.dow]} brings you ${usd(top.avg)} — well above your quiet days. Protect it: put your biggest pieces there, and treat a ${DAY_NAMES[top.dow]} cancellation as a fire to put out same-day.`,
    });
  }

  // 5. Tip rate — only when there's enough volume to mean something.
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const month = sales.filter((s) => (s.created_at || "").slice(0, 10) >= thirtyAgo);
  const svc = month.reduce((a, s) => a + (s.service_cents ?? 0), 0);
  const tip = month.reduce((a, s) => a + (s.tip_cents ?? 0), 0);
  if (month.length >= 5 && svc > 0 && tip / svc < 0.12) {
    tips.push({
      title: "Your tip rate is leaving money behind",
      body: `Tips added ${usd(tip)} in the last month — about ${Math.round(
        (tip / svc) * 100,
      )}% on top of service. Most artists land 15–20% when every card goes through the tap screen, because it asks so you don't have to. And log cash tips — they count toward every number in here.`,
    });
  }

  return tips;
}

/** Practice reads first, then tax + goal truths. ytdCents = earned this year. */
export function coachTips(opts: {
  sales: SaleRow[];
  bookings: BookingRow[];
  expenses: Expense[];
  weeklyGoalCents: number;
  taxPct: number | null; // 0..1, null until the artist saves their own
  ytdCents: number;
  reserveCents: number;
  taxStatus: "1099" | "w2";
}): CoachTip[] {
  // Where the next dollar is — capped so the coach stays a read, not a wall.
  const tips: CoachTip[] = practiceInsights(opts.sales, opts.bookings).slice(0, 3);
  const avg = avgWeeklyCents(opts.sales);
  const suggestion = suggestedWeeklyCents(opts.sales);
  const is1099 = opts.taxStatus !== "w2";

  // The standing money truth — follows the pay setup (renters 1099, Gusto
  // payroll W-2).
  if (is1099) {
    tips.push({
      title: "Nobody is withholding for you",
      body: `As a booth renter you're a contractor (1099) — everything you're handed is GROSS, before tax. The shop holds nothing back (your card sales pass through 100%), and neither does this app. ${
        opts.taxPct != null
          ? `Move ${Math.round(opts.taxPct * 100)}% of every payment into a separate savings account the day you get it. Right now that account should hold about ${usd(opts.reserveCents)}.`
          : "Pick your set-aside % in Goals — 25-30% is a common starting point, but it's your number (your tax pro knows it best)."
      }`,
    });
  } else {
    tips.push({
      title: "Gusto withholds on your wages — not your cash",
      body: "You're paid through Gusto payroll — tax comes out of your paychecks based on the W-4 you set there (adjust it in Gusto if you keep owing or over-paying; check your stub, not this app). But cash tips and side work usually have NOTHING withheld — report them, and keep a set-aside for the tax they'll add.",
    });
  }

  if (!opts.weeklyGoalCents && suggestion) {
    tips.push({
      title: "Set a goal you can feel",
      body: `Your average week over the last two months is ${usd(avg)}. A goal of ${usd(
        suggestion,
      )}/week is a stretch you can actually hit — set it and the chart races you against it.`,
    });
  } else if (opts.weeklyGoalCents && avg && opts.weeklyGoalCents > avg * 2) {
    tips.push({
      title: "That goal might be demoralizing",
      body: `Your goal is ${usd(opts.weeklyGoalCents)}/week but your real average is ${usd(
        avg,
      )}. Goals you never hit stop meaning anything — try ${usd(suggestion)} and raise it when you beat it.`,
    });
  }

  // Unreimbursed employee expenses aren't federally deductible for W-2s —
  // only coach deductions for contractors.
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const recentDeductions = opts.expenses.filter((e) => e.date >= thirtyAgo);
  if (is1099 && opts.ytdCents > 0 && recentDeductions.length === 0) {
    tips.push({
      title: "You're leaving deductions on the table",
      body: "No deductions logged in 30 days. Needles, ink, gloves, machine parts, conventions, even part of your phone — every dollar you log lowers the income you're taxed on. Snap the receipt the moment you buy.",
    });
  }

  if (is1099 && opts.taxPct != null && opts.taxPct < 0.2 && opts.ytdCents > 1000000) {
    tips.push({
      title: "Your set-aside looks thin",
      body: `You're saving ${Math.round(
        opts.taxPct * 100,
      )}% for taxes. For most self-employed artists, federal + state + self-employment tax lands between 25–30%. Worth a chat with a tax pro before it surprises you.`,
    });
  }

  return tips;
}

const usd = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
