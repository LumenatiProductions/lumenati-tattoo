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
