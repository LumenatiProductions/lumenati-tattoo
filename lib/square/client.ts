// Minimal server-side Square REST client (read-only). The access token is a
// server secret (SQUARE_ACCESS_TOKEN) — never exposed to the browser. We only
// ever GET/search; we never write to Square.

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const ENV = process.env.SQUARE_ENV || "production";
const VERSION = process.env.SQUARE_VERSION || "2025-04-16";

const BASE =
  ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

export const isSquareConfigured = Boolean(TOKEN);

async function sq(path: string, init?: RequestInit) {
  if (!TOKEN) throw new Error("Square not configured");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.errors?.[0]?.detail || res.statusText;
    throw new Error(`Square ${res.status}: ${msg}`);
  }
  return body;
}

export interface SquareLocation {
  id: string;
  name: string;
}
export async function listLocations(): Promise<SquareLocation[]> {
  const body = await sq("/v2/locations");
  return (body.locations || []).map((l: { id: string; name: string }) => ({
    id: l.id,
    name: l.name,
  }));
}

export interface SquareTeamMember {
  id: string;
  name: string;
  status: string;
}
export async function listTeamMembers(): Promise<SquareTeamMember[]> {
  const body = await sq("/v2/team-members/search", {
    method: "POST",
    body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 200 }),
  });
  return (body.team_members || []).map(
    (m: { id: string; given_name?: string; family_name?: string; status: string }) => ({
      id: m.id,
      name: [m.given_name, m.family_name].filter(Boolean).join(" ") || m.id,
      status: m.status,
    }),
  );
}

export interface SquarePayment {
  id: string;
  createdAt: string;
  totalCents: number;
  tipCents: number;
  serviceCents: number; // total - tip (and - tax, if present)
  method: "card" | "cash" | "other";
  teamMemberId: string | null;
  locationId: string | null;
  status: string;
}

interface RawMoney {
  amount?: number;
}
interface RawPayment {
  id: string;
  created_at: string;
  amount_money?: RawMoney;
  tip_money?: RawMoney;
  total_money?: RawMoney;
  tax_money?: RawMoney;
  card_details?: unknown;
  cash_details?: unknown;
  team_member_id?: string;
  employee_id?: string;
  location_id?: string;
  status: string;
}

/** Lists payments since `beginTime` (ISO), paging through all results. */
export async function listPayments(
  beginTime: string,
  locationId?: string,
): Promise<SquarePayment[]> {
  const out: SquarePayment[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      begin_time: beginTime,
      sort_order: "ASC",
      limit: "100",
    });
    if (locationId) params.set("location_id", locationId);
    if (cursor) params.set("cursor", cursor);
    const body = await sq(`/v2/payments?${params.toString()}`);
    for (const p of (body.payments || []) as RawPayment[]) {
      const total = p.total_money?.amount ?? p.amount_money?.amount ?? 0;
      const tip = p.tip_money?.amount ?? 0;
      const tax = p.tax_money?.amount ?? 0;
      out.push({
        id: p.id,
        createdAt: p.created_at,
        totalCents: total,
        tipCents: tip,
        serviceCents: Math.max(0, total - tip - tax),
        method: p.card_details ? "card" : p.cash_details ? "cash" : "other",
        teamMemberId: p.team_member_id || p.employee_id || null,
        locationId: p.location_id || null,
        status: p.status,
      });
    }
    cursor = body.cursor;
  } while (cursor);
  return out;
}

// ── Rent invoices ──
// The shop's booth-rent invoices are titled "...rent...". We surface those with
// a normalized status so the dashboard can show who's paid vs behind.
export interface RentInvoice {
  id: string;
  name: string; // recipient (the artist the rent is for)
  title: string;
  amountCents: number;
  status: string; // PAID | UNPAID | SCHEDULED | PARTIALLY_PAID | CANCELED | ...
  dueDate: string | null;
  paid: boolean;
  overdue: boolean;
}

export async function fetchRentInvoices(): Promise<RentInvoice[]> {
  const locs = await listLocations();
  const locationId = process.env.SQUARE_LOCATION_ID || locs[0]?.id;
  const todayISO = new Date().toISOString().slice(0, 10);
  const month = todayISO.slice(0, 7); // current YYYY-MM

  // Newest first; one page is plenty for the current cycle (no deep history).
  const body = await sq("/v2/invoices/search", {
    method: "POST",
    body: JSON.stringify({
      query: { filter: { location_ids: [locationId] } },
      limit: 100,
    }),
  });

  const out: RentInvoice[] = [];
  for (const inv of body.invoices || []) {
    const title: string = inv.title || "";
    if (!/rent/i.test(title)) continue; // rent invoices only
    const status: string = inv.status || "";
    if (["CANCELED", "DRAFT"].includes(status)) continue;
    const pr = (inv.payment_requests || [])[0] || {};
    const dueDate: string | null = pr.due_date || null;
    const paid = status === "PAID";
    const overdue = !paid && !!dueDate && dueDate < todayISO && status !== "SCHEDULED";
    // Keep this cycle (due in the current month) + any lingering unpaid/overdue.
    const currentCycle = dueDate ? dueDate.startsWith(month) : false;
    if (!currentCycle && paid) continue;
    out.push({
      id: inv.id,
      name:
        [inv.primary_recipient?.given_name, inv.primary_recipient?.family_name]
          .filter(Boolean)
          .join(" ")
          .trim() || title,
      title,
      amountCents: pr.computed_amount_money?.amount ?? 0,
      status,
      dueDate,
      paid,
      overdue,
    });
  }
  return out;
}

// ── Sales summary for a window (for the weekly digest) ──
export interface SalesSummary {
  count: number;
  grossCents: number;
  serviceCents: number;
  tipCents: number;
  cardCents: number;
  cashCents: number;
}
export async function salesSummary(beginTime: string): Promise<SalesSummary> {
  const payments = (await listPayments(beginTime)).filter((p) => p.status === "COMPLETED");
  const s: SalesSummary = { count: 0, grossCents: 0, serviceCents: 0, tipCents: 0, cardCents: 0, cashCents: 0 };
  for (const p of payments) {
    s.count++;
    s.grossCents += p.totalCents;
    s.serviceCents += p.serviceCents;
    s.tipCents += p.tipCents;
    if (p.method === "cash") s.cashCents += p.totalCents;
    else s.cardCents += p.totalCents;
  }
  return s;
}
