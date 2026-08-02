import { supabase } from "./supabase";

// Artist money + personal data. Sales/bookings are RLS-scoped (an artist sees
// only their own), so no artist_id is needed. Goals/expenses are keyed to the
// auth user and private to them.

export type Range = "week" | "month" | "year";

export const startOf = (range: Range): string => {
  const d = new Date();
  if (range === "year") return `${d.getFullYear()}-01-01`;
  if (range === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  // week: back to Monday
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - day * 86400000);
  return new Date(monday.getTime() - monday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export type SaleRow = { created_at: string; service_cents: number; tip_cents: number };
export type BookingRow = { starts_at: string; ends_at: string | null; status: string; client_id: string | null };

export type MoneySnapshot = {
  sales: SaleRow[];
  bookings: BookingRow[];
};

// PostgREST clamps every response at 1000 rows no matter the limit — any pull
// that feeds money math has to page or it silently undercounts (20k stop).
export async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < 20000; start += 1000) {
    const { data } = await build(start, start + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// Pull the raw rows once; the screen derives every range from them. An artist's
// RLS already scopes to their own rows; pass artistId only when an OWNER is
// previewing an artist's home (their RLS sees everything, so filter explicitly).
export async function loadMoney(artistId?: string): Promise<MoneySnapshot> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [sales, bookings] = await Promise.all([
    pageAll<SaleRow>((from, to) => {
      let s = supabase
        // ledger_sales so chair-logged cash counts in You earned / goals / tax.
        .from("ledger_sales")
        .select("created_at, service_cents, tip_cents")
        .gte("created_at", yearStart)
        .order("created_at", { ascending: true })
        .order("id"); // stable tiebreaker so timestamp ties can't shift page boundaries
      if (artistId) s = s.eq("artist_id", artistId);
      return s.range(from, to);
    }),
    // All non-cancelled bookings this year INCLUDING future ones — the coach
    // reads rebooking and open-days from them; hourly filters to completed itself.
    pageAll<BookingRow>((from, to) => {
      let b = supabase
        .from("bookings")
        .select("starts_at, ends_at, status, client_id")
        .gte("starts_at", yearStart)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .order("id"); // stable tiebreaker so timestamp ties can't shift page boundaries
      if (artistId) b = b.eq("artist_id", artistId);
      return b.range(from, to);
    }),
  ]);
  return { sales, bookings };
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
    if (b.status !== "completed") continue; // loadMoney now returns future/scheduled too
    if ((b.starts_at || "").slice(0, 10) < from || !b.ends_at) continue;
    const ms = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    if (ms > 0) hours += ms / 3_600_000;
  }
  if (hours <= 0) return null;
  return Math.round(service / hours);
}

// Cumulative earnings per day from the range start through today (the chart).
export function cumulativeSeries(sales: SaleRow[], range: Range): number[] {
  const from = startOf(range);
  const today = new Date();
  const start = new Date(`${from}T00:00:00`);
  const days = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
  const perDay = new Array<number>(days).fill(0);
  for (const s of sales) {
    const d = (s.created_at || "").slice(0, 10);
    if (d < from) continue;
    const idx = Math.round((new Date(`${d}T00:00:00`).getTime() - start.getTime()) / 86400000);
    if (idx >= 0 && idx < days) perDay[idx] += (s.service_cents ?? 0) + (s.tip_cents ?? 0);
  }
  let run = 0;
  return perDay.map((v) => (run += v));
}

// Consecutive weeks at/over the weekly goal, counting back from this week
// (this week counts as soon as it crosses the line).
export function weeklyStreak(sales: SaleRow[], weeklyCents: number): number {
  if (weeklyCents <= 0) return 0;
  const weekTotal = (mondayMs: number) => {
    const from = new Date(mondayMs - new Date(mondayMs).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const to = new Date(mondayMs + 7 * 86400000 - new Date(mondayMs).getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    return sales
      .filter((s) => {
        const d = (s.created_at || "").slice(0, 10);
        return d >= from && d < to;
      })
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  };
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).getTime();
  let streak = 0;
  let monday = thisMonday;
  if (weekTotal(monday) >= weeklyCents) streak++;
  monday -= 7 * 86400000;
  while (weekTotal(monday) >= weeklyCents && streak < 52) {
    streak++;
    monday -= 7 * 86400000;
  }
  return streak;
}

// Last 7 days, oldest→newest, total cents per day (for the bar strip).
export function last7Days(sales: SaleRow[]): { label: string; cents: number }[] {
  const days: { label: string; cents: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const cents = sales
      .filter((s) => {
        // Match on the sale's LOCAL date, not its raw UTC date, so an evening
        // sale lands on the right bar (bar dates are local).
        const t = new Date(s.created_at || "");
        const sd = isNaN(t.getTime())
          ? (s.created_at || "").slice(0, 10)
          : new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        return sd === iso;
      })
      .reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
    days.push({ label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()], cents });
  }
  return days;
}

// ── Today's book (the "your day" card) ──
export type TodayBooking = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  service_desc: string | null;
  clientName: string; // resolved best-effort; RLS may hide clients from artists
};

// Today's bookings, oldest first. RLS scopes an artist to their own book; an
// owner previewing passes artistId explicitly. Client names resolve when the
// role can read clients; otherwise the card says "Client".
export async function loadToday(artistId?: string): Promise<TodayBooking[]> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  let q = supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, service_desc, client_id")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (artistId) q = q.eq("artist_id", artistId);
  const { data } = await q;
  const rows = (data ?? []) as (Omit<TodayBooking, "clientName"> & { client_id: string | null })[];

  const cIds = [...new Set(rows.map((b) => b.client_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (cIds.length) {
    const { data: cs } = await supabase.from("clients").select("id, first_name, last_name").in("id", cIds);
    for (const c of (cs ?? []) as { id: string; first_name: string; last_name: string }[]) {
      names.set(c.id, `${c.first_name} ${c.last_name}`.trim());
    }
  }
  return rows.map((b) => ({
    id: b.id,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    status: b.status,
    service_desc: b.service_desc,
    clientName: b.client_id ? names.get(b.client_id) || "Client" : "Walk-in",
  }));
}

// ── Pay setup + booth rent ──
export type RentStatus = {
  payType: string; // payroll_salary | payroll_split | booth_rent
  rentCents: number; // monthly rent from their terms (booth_rent only)
  unpaid: { id: string; period: string; amount_cents: number; due_date: string | null }[];
  history: { period: string; status: string; paid_at: string | null; due_date: string | null }[];
};

// Tax situation follows the pay setup: renters are contractors (1099); anyone
// on Gusto payroll is W-2. Used by the coach + goals so advice never drifts
// from how the artist is actually paid.
export const taxStatusForPayType = (payType: string | null | undefined): TaxStatus | null =>
  payType === "booth_rent" ? "1099" : payType ? "w2" : null;

// Resolve "my" artist unless previewing (owner passes the artist explicitly).
async function myArtistId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.email) return null;
  const { data } = await supabase.from("profiles").select("artist_id").eq("email", u.user.email).maybeSingle();
  return (data?.artist_id as string | null) ?? null;
}

export async function loadRent(artistId?: string): Promise<RentStatus | null> {
  const id = artistId ?? (await myArtistId());
  if (!id) return null;
  const [{ data: a }, { data: inv }, { data: hist }] = await Promise.all([
    supabase.from("artists").select("pay_type, rent_cents").eq("id", id).maybeSingle(),
    supabase
      .from("rent_invoices")
      .select("id, period, amount_cents, due_date")
      .eq("artist_id", id)
      .eq("status", "pending")
      .order("period"),
    // Recent history feeds the on-time streak (rent coach).
    supabase
      .from("rent_invoices")
      .select("period, status, paid_at, due_date")
      .eq("artist_id", id)
      .order("period", { ascending: false })
      .limit(12),
  ]);
  if (!a) return null;
  return {
    payType: (a.pay_type as string) ?? "payroll_split",
    rentCents: (a.rent_cents as number) ?? 0,
    unpaid: (inv ?? []) as RentStatus["unpaid"],
    history: (hist ?? []) as RentStatus["history"],
  };
}

// Consecutive months of rent paid by its due date, newest first. The current
// month doesn't break the streak while it's still pending and not yet due.
export function rentOnTimeStreak(history: RentStatus["history"], todayISO?: string): number {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  let streak = 0;
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (i === 0 && h.status === "pending" && (!h.due_date || h.due_date >= today)) continue;
    if (h.status === "paid" && h.paid_at && h.due_date && h.paid_at.slice(0, 10) <= h.due_date) {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

// ── Goals (one row per user) ──
export type TaxStatus = "1099" | "w2";
export type Goals = {
  weekly_cents: number;
  monthly_cents: number;
  tax_setaside_pct: number;
  tax_status: TaxStatus;
};
const DEFAULT_GOALS: Goals = { weekly_cents: 0, monthly_cents: 0, tax_setaside_pct: 0.3, tax_status: "1099" };

// Default set-aside follows the pay setup (Scott, 2026-07-09): Gusto already
// withholds from W-2 paychecks, so payroll artists only need a small cushion
// for cash tips and side work. Renters are 1099 — nothing is withheld
// anywhere, so 30% stays their starting point. A saved goals row always wins.
export const defaultTaxPctFor = (s: TaxStatus): number => (s === "w2" ? 0.1 : 0.3);

export type GoalsLoad = Goals & { saved: boolean };
export async function loadGoals(): Promise<GoalsLoad> {
  const { data } = await supabase
    .from("artist_goals")
    .select("weekly_cents, monthly_cents, tax_setaside_pct, tax_status")
    .maybeSingle();
  return data ? { ...DEFAULT_GOALS, ...data, saved: true } : { ...DEFAULT_GOALS, saved: false };
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
  // Feeds the YTD deduction sum (taxable income) — page, don't cap.
  return pageAll<Expense>((from, to) =>
    supabase
      .from("artist_expenses")
      .select("id, date, category, vendor, amount_cents, note")
      .order("date", { ascending: false })
      .range(from, to),
  );
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
