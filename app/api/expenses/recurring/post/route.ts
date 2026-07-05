import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Post due recurring bills as real expense rows. Body: { id? } — one bill, or
// every active bill whose next_due has arrived. Each posted expense is stamped
// (recurring_id, period); a unique index makes a period impossible to
// double-post, so mashing the button is safe. next_due then advances one
// cadence step. A bill several periods behind posts one period per call —
// press again to catch up (each press shows what it did).
const BOOKS = ["owner", "bookkeeper"] as const;

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

type Bill = {
  id: string;
  name: string;
  category: string;
  vendor: string | null;
  amount_cents: number;
  cadence: string;
  next_due: string;
  active: boolean;
  note: string;
};

// The period label an expense is stamped with, from the due date it covers.
// Weekly bills key on the exact date; everything else on the month.
const periodOf = (b: Bill) => (b.cadence === "weekly" ? b.next_due : b.next_due.slice(0, 7));

// next_due advanced one cadence step (UTC math on yyyy-mm-dd, no TZ drift).
function advance(due: string, cadence: string): string {
  const [y, m, d] = due.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (cadence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else {
    const months = cadence === "quarterly" ? 3 : cadence === "yearly" ? 12 : 1;
    // Anchor to the original day-of-month so Jan 31 -> Feb 28 -> Mar 31.
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !BOOKS.includes(role as (typeof BOOKS)[number])) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as { id?: string };
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase.from("recurring_expenses").select("*").eq("active", true).lte("next_due", today);
  if (b.id) q = q.eq("id", b.id);
  const { data: bills, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const posted: { name: string; period: string; amount_cents: number }[] = [];
  const skipped: string[] = [];
  for (const bill of (bills ?? []) as Bill[]) {
    const period = periodOf(bill);
    const { error: insErr } = await supabase.from("expenses").insert({
      date: bill.next_due,
      category: bill.category,
      vendor: bill.vendor,
      amount_cents: bill.amount_cents,
      note: [bill.name, bill.note].filter(Boolean).join(" · "),
      recurring_id: bill.id,
      period,
    });
    if (insErr) {
      // 23505 = this period already posted (double-click, two devices) — fine.
      if (insErr.code !== "23505") {
        return NextResponse.json({ error: `${bill.name}: ${insErr.message}` }, { status: 500 });
      }
      skipped.push(bill.name);
    } else {
      posted.push({ name: bill.name, period, amount_cents: bill.amount_cents });
    }
    // Advance even when the period already existed, so a stuck bill unsticks.
    const { error: advErr } = await supabase
      .from("recurring_expenses")
      .update({ next_due: advance(bill.next_due, bill.cadence) })
      .eq("id", bill.id)
      .eq("next_due", bill.next_due); // no-op if another device advanced it first
    if (advErr) return NextResponse.json({ error: `${bill.name}: ${advErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ posted, skipped });
}
