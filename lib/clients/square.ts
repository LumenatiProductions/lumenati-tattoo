// In-lane Square reader for the Clients feature. The shared lib/square/client.ts
// exposes team members + payments, but not customers (and its payment shape drops
// customer_id), so the CRM owns this thin read-only client rather than editing the
// shared file. Same server-only token, same "we only ever GET, never write back".

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const ENV = process.env.SQUARE_ENV || "production";
const VERSION = process.env.SQUARE_VERSION || "2025-04-16";

const BASE =
  ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

export const isSquareConfigured = Boolean(TOKEN);

async function sq(path: string) {
  if (!TOKEN) throw new Error("Square not configured");
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
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

export interface SquareCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  birthdate: string | null; // ISO date, or null when Square has no usable year
  createdAt: string; // ISO timestamp
}

interface RawCustomer {
  id: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
  birthday?: string; // "1998-09-21" or "0000-09-21" when the year is unknown
  created_at?: string;
}

// Square stores birthdays as YYYY-MM-DD but uses 0000 when the year is unknown,
// which isn't a valid date for us. Keep only birthdays with a real year.
function usableBirthdate(birthday?: string): string | null {
  if (!birthday) return null;
  const year = Number(birthday.slice(0, 4));
  return year >= 1900 ? birthday : null;
}

/** All Square customers, paging through every result. */
export async function listCustomers(): Promise<SquareCustomer[]> {
  const out: SquareCustomer[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100", sort_field: "CREATED_AT", sort_order: "ASC" });
    if (cursor) params.set("cursor", cursor);
    const body = await sq(`/v2/customers?${params.toString()}`);
    for (const c of (body.customers || []) as RawCustomer[]) {
      out.push({
        id: c.id,
        firstName: c.given_name || "",
        lastName: c.family_name || "",
        email: c.email_address || null,
        phone: c.phone_number || null,
        instagram: null, // Square has no IG field; staff fill this in by hand
        birthdate: usableBirthdate(c.birthday),
        createdAt: c.created_at || new Date().toISOString(),
      });
    }
    cursor = body.cursor;
  } while (cursor);
  return out;
}

export interface CustomerSpend {
  customerId: string;
  totalCents: number;
  firstAt: string; // ISO timestamp of earliest completed payment
  lastAt: string; // ISO timestamp of latest completed payment
}

interface RawPayment {
  customer_id?: string;
  created_at: string;
  total_money?: { amount?: number };
  amount_money?: { amount?: number };
  status: string;
}

/**
 * Rolls completed Square payments up per customer since `beginTime` (ISO).
 * Used to refresh `total_spent_cents`/`first_seen`/`last_seen` on clients. Pass a
 * far-back begin time for a lifetime rollup (a single shop's history pages fast).
 */
export async function customerSpendSince(beginTime: string): Promise<Map<string, CustomerSpend>> {
  const spend = new Map<string, CustomerSpend>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ begin_time: beginTime, sort_order: "ASC", limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const body = await sq(`/v2/payments?${params.toString()}`);
    for (const p of (body.payments || []) as RawPayment[]) {
      if (!p.customer_id || p.status !== "COMPLETED") continue;
      const amount = p.total_money?.amount ?? p.amount_money?.amount ?? 0;
      const prev = spend.get(p.customer_id);
      if (!prev) {
        spend.set(p.customer_id, {
          customerId: p.customer_id,
          totalCents: amount,
          firstAt: p.created_at,
          lastAt: p.created_at,
        });
      } else {
        prev.totalCents += amount;
        if (p.created_at < prev.firstAt) prev.firstAt = p.created_at;
        if (p.created_at > prev.lastAt) prev.lastAt = p.created_at;
      }
    }
    cursor = body.cursor;
  } while (cursor);
  return spend;
}
