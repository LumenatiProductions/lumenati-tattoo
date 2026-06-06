import { supabase } from "./supabase";

// Artist money + personal data. Sales/bookings are RLS-scoped (an artist sees
// only their own), so no artist_id is needed. Goals/expenses are keyed to the
// auth user and private to them.

export type Range = "week" | "month" | "year";

const startOf = (range: Range): string => {
  const d = new Date();
  if (range === "year") return `${d.getFullYear()}-01-01`;
  if (range === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  // week: back to Monday
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - day * 86400000);
  return new Date(monday.getTime() - monday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export type SaleRow = { created_at: string; service_cents: number; tip_cents: number };
export type BookingRow = { starts_at: string; ends_at: string | null; status: string };

export type MoneySnapshot = {
  sales: SaleRow[];
  bookings: BookingRow[];
};

// Pull the raw rows once; the screen derives every range from them.
export async function loadMoney(): Promise<MoneySnapshot> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [s, b] = await Promise.all([
    supabase.from("sales").select("created_at, service_cents, tip_cents").gte("created_at", yearStart),
    supabase
      .from("bookings")
      .select("starts_at, ends_at, status")
      .gte("starts_at", yearStart)
      .eq("status", "completed"),
  ]);
  return { sales: (s.data ?? []) as SaleRow[], bookings: (b.data ?? []) as BookingRow[] };
}

export function earnedInRange(sales: SaleRow[], range: Range) {
  const from = startOf(range);
  const inR = sales.filter((x) => (x.created_at || "").slice(0, 10) >= from);
  const service = inR.reduce((a, x) => a + (x.service_cents ?? 0), 0);
  const tips = inR.reduce((a, x) => a + (x.tip_cents ?? 0), 0);
  return { service, tips, total: service + tips, tickets: inR.length };
}

// Realized hourly = service earned ÷ booked hours, over the range. Only completed
// bookings with a real duration count toward hours.
export function hourlyInRange(sales: SaleRow[], bookings: BookingRow[], range: Range): number | null {
  const from = startOf(range);
  const service = sales
    .filter((x) => (x.created_at || "").slice(0, 10) >= from)
    .reduce((a, x) => a + (x.service_cents ?? 0), 0);
  let hours = 0;
  for (const b of bookings) {
    if ((b.starts_at || "").slice(0, 10) < from || !b.ends_at) continue;
    const ms = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    if (ms > 0) hours += ms / 3_600_000;
  }
  if (hours <= 0) return null;
  return Math.round(service / hours);
}

// Last 7 days, oldest→newest, total cents per day (for the bar strip).
export function last7Days(sales: SaleRow[]): { label: string; cents: number }[] {
  const days: { label: string; cents: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const cents = sales
      .filter((s) => (s.created_at || "").slice(0, 10) === iso)
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
    days.push({ label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()], cents });
  }
  return days;
}

// ── Goals (one row per user) ──
export type Goals = { weekly_cents: number; monthly_cents: number; tax_setaside_pct: number };
const DEFAULT_GOALS: Goals = { weekly_cents: 0, monthly_cents: 0, tax_setaside_pct: 0.3 };

export async function loadGoals(): Promise<Goals> {
  const { data } = await supabase
    .from("artist_goals")
    .select("weekly_cents, monthly_cents, tax_setaside_pct")
    .maybeSingle();
  return data ? { ...DEFAULT_GOALS, ...data } : DEFAULT_GOALS;
}

export async function saveGoals(g: Goals): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("artist_goals")
    .upsert({ user_id: u.user.id, ...g, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Expenses (deductions) ──
export type Expense = {
  id: string;
  date: string;
  category: string;
  vendor: string | null;
  amount_cents: number;
  note: string;
};

export async function loadExpenses(): Promise<Expense[]> {
  const { data } = await supabase
    .from("artist_expenses")
    .select("id, date, category, vendor, amount_cents, note")
    .order("date", { ascending: false })
    .limit(200);
  return (data ?? []) as Expense[];
}

export async function addExpense(e: {
  date: string;
  category: string;
  vendor?: string;
  amountCents: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("artist_expenses").insert({
    user_id: u.user.id,
    date: e.date,
    category: e.category,
    vendor: e.vendor ?? null,
    amount_cents: e.amountCents,
    note: e.note ?? "",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteExpense(id: string) {
  await supabase.from("artist_expenses").delete().eq("id", id);
}

export const expensesYtd = (expenses: Expense[]) => {
  const year = `${new Date().getFullYear()}-01-01`;
  return expenses.filter((e) => e.date >= year).reduce((a, e) => a + e.amount_cents, 0);
};
