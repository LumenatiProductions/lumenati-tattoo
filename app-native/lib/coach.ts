import type { SaleRow, Expense } from "./personal";

// The money coach: plain-English, numbers-from-their-own-work suggestions for
// artists who have never thought about goals or taxes. Everything here is
// deterministic math on their RLS-scoped rows — no AI, no guessing, and it
// NEVER claims the shop withholds anything (it doesn't — artists are 1099 and
// must move their tax money themselves).

const weekKey = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - day * 86400000);
  return monday.toISOString().slice(0, 10);
};

/** Average weekly take over the last `weeks` COMPLETE weeks (0 if no history). */
export function avgWeeklyCents(sales: SaleRow[], weeks = 8): number {
  const thisWeek = weekKey(new Date().toISOString().slice(0, 10));
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

/** Tax + goal tips, most important first. ytdCents = earned this year. */
export function coachTips(opts: {
  sales: SaleRow[];
  expenses: Expense[];
  weeklyGoalCents: number;
  taxPct: number; // 0..1
  ytdCents: number;
  reserveCents: number;
  taxStatus: "1099" | "w2";
}): CoachTip[] {
  const tips: CoachTip[] = [];
  const avg = avgWeeklyCents(opts.sales);
  const suggestion = suggestedWeeklyCents(opts.sales);
  const is1099 = opts.taxStatus !== "w2";

  // The most important card, always first. Different truth per tax status —
  // set yours on the Goals screen.
  if (is1099) {
    tips.push({
      title: "Nobody is withholding for you",
      body: `You're paid as a contractor (1099) — every payout is GROSS, before tax. The shop doesn't hold anything back, and neither does this app. Move ${Math.round(
        opts.taxPct * 100,
      )}% of every payout into a separate savings account the day you get paid. Right now that account should hold about ${usd(
        opts.reserveCents,
      )}. If that's not how you're paid, switch it on the Goals screen.`,
    });
  } else {
    tips.push({
      title: "Payroll covers your wages — not your cash",
      body: "You're a W-2 employee — tax comes out of your paychecks based on the W-4 you set in Gusto (adjust it there if you keep owing or over-paying). But cash tips and side work usually have NOTHING withheld — report them, and keep a set-aside for the tax they'll add. If that's not how you're paid, switch it on the Goals screen.",
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

  if (is1099 && opts.taxPct < 0.2 && opts.ytdCents > 1000000) {
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
