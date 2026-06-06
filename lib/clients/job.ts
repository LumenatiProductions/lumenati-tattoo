import type { SupabaseClient } from "@supabase/supabase-js";
import { isSquareConfigured, listCustomers, customerSpendSince } from "./square";

// Lifetime rollup: pay one deep page of payment history so total_spent_cents is a
// true lifetime figure, not a trailing window. A single shop's history pages fast.
const SPEND_SINCE = "2010-01-01T00:00:00Z";

const dateOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const minDate = (a: string | null, b: string | null) =>
  a && b ? (a < b ? a : b) : a || b;
const maxDate = (a: string | null, b: string | null) =>
  a && b ? (a > b ? a : b) : a || b;

type ExistingRow = {
  id: string;
  instagram: string | null;
  notes: string | null;
  preferred_artist_id: string | null;
  total_spent_cents: number | null;
  first_seen: string | null;
  last_seen: string | null;
};

/**
 * Mirrors Square customers into `clients` and refreshes the spend rollup.
 * Square owns name/contact/birthday; staff-entered fields (instagram, notes,
 * preferred artist) are preserved across syncs and never clobbered. Idempotent:
 * upserts on the Square customer id. Runs with whichever client is passed —
 * the service-role client from the cron, or an owner client from "Sync now".
 */
export async function syncClients(client: SupabaseClient) {
  if (!isSquareConfigured) return { feature: "clients", skipped: "Square not connected" };

  const [customers, spend] = await Promise.all([
    listCustomers(),
    customerSpendSince(SPEND_SINCE),
  ]);
  if (!customers.length) return { feature: "clients", customers: 0, updated: 0 };

  // Preserve hand-entered fields + any earlier first_seen across the upsert.
  const ids = customers.map((c) => c.id);
  const preserved = new Map<string, ExistingRow>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client
      .from("clients")
      .select("id, instagram, notes, preferred_artist_id, total_spent_cents, first_seen, last_seen")
      .in("id", ids.slice(i, i + 300));
    for (const r of (data || []) as ExistingRow[]) preserved.set(r.id, r);
  }

  const nowIso = new Date().toISOString();
  const rows = customers.map((c) => {
    const prior = preserved.get(c.id);
    const s = spend.get(c.id);
    const first = minDate(minDate(dateOf(c.createdAt), dateOf(s?.firstAt)), prior?.first_seen ?? null);
    const last = maxDate(dateOf(s?.lastAt), prior?.last_seen ?? null);
    return {
      id: c.id,
      square_customer_id: c.id,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      // Square has no IG field, so only the manual value ever exists — keep it.
      instagram: prior?.instagram ?? null,
      birthdate: c.birthdate,
      notes: prior?.notes ?? "",
      preferred_artist_id: prior?.preferred_artist_id ?? null,
      total_spent_cents: s ? s.totalCents : prior?.total_spent_cents ?? 0,
      first_seen: first,
      last_seen: last,
      source: "square",
      synced_at: nowIso,
    };
  });

  let updated = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await client.from("clients").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    updated += batch.length;
  }

  return { feature: "clients", customers: customers.length, updated };
}

// Called by /api/ops/daily inside its own try/catch. `admin` is the service-role
// Supabase client (bypasses RLS). No-ops cleanly when Square isn't connected.
export async function runDailyJob(admin: unknown) {
  return syncClients(admin as SupabaseClient);
}
