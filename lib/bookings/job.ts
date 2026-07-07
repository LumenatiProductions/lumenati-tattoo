import type { SupabaseClient } from "@supabase/supabase-js";
import { isSquareConfigured, listAppointments, type SquareAppointment } from "./square";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// How far back / forward to mirror Square Appointments each run. Square caps a
// single Bookings query window at ~31 days, so we page by ~30-day chunks.
const LOOKBACK_DAYS = 60;
const LOOKAHEAD_DAYS = 90;
const CHUNK_DAYS = 30;

type ExistingRow = {
  id: string;
  status: string;
  notes: string | null;
  est_price_cents: number | null;
  deposit_cents: number | null;
  deposit_status: string | null;
  deposit_payment_id: string | null;
  sale_id: string | null;
};

const TERMINAL = new Set(["completed", "no_show", "cancelled"]);

// Reconcile the locally-known status with what Square reports. Once the desk has
// settled a booking (completed / no_show / cancelled) we don't let a Square
// "still accepted" un-settle it — but a Square cancellation always propagates.
function reconcileStatus(prior: string | undefined, fromSquare: string): string {
  if (fromSquare === "cancelled") return "cancelled";
  if (prior && TERMINAL.has(prior)) return prior;
  return fromSquare;
}

// Build month-sized [min,max] windows covering the lookback..lookahead range.
function windows(now: number): Array<[string, string]> {
  const start = now - LOOKBACK_DAYS * 86_400_000;
  const end = now + LOOKAHEAD_DAYS * 86_400_000;
  const step = CHUNK_DAYS * 86_400_000;
  const out: Array<[string, string]> = [];
  for (let t = start; t < end; t += step) {
    out.push([new Date(t).toISOString(), new Date(Math.min(t + step, end)).toISOString()]);
  }
  return out;
}

/**
 * Mirrors Square Appointments into `bookings` and auto-flags overdue ones.
 *
 * Square owns scheduling facts (when, who, the customer); the desk owns money +
 * outcome (deposit fields, sale link, est price, hand notes) — those are
 * preserved across syncs and never clobbered, and a locally-settled outcome is
 * never un-settled by Square. Idempotent: upserts on the appointment id.
 *
 * Independently (and even when Square isn't connected), any `scheduled` booking
 * whose start time is in the past is flipped to `no_show` for the desk to
 * review, forfeiting a held deposit. Runs with whichever client is passed — the
 * service-role client from cron, or an owner client from "Sync now".
 */
export async function syncBookings(client: SupabaseClient) {
  const now = Date.now();
  let mirrored = 0;

  if (isSquareConfigured) {
    // Map Square team-member id -> our artist id (the desk maintains this in the
    // square_team_members table; appointments reference a team member).
    const { data: tm } = await client
      .from("square_team_members")
      .select("square_id, artist_id")
      .eq("shop_id", LUMENATI_SHOP_ID);
    const artistOf = new Map<string, string | null>(
      (tm || []).map((r: { square_id: string; artist_id: string | null }) => [r.square_id, r.artist_id]),
    );

    // Pull every window, de-duping by appointment id (windows can't overlap, but
    // be defensive).
    const seen = new Map<string, SquareAppointment>();
    for (const [min, max] of windows(now)) {
      for (const a of await listAppointments(min, max)) seen.set(a.id, a);
    }
    const appts = [...seen.values()];

    if (appts.length) {
      // Preserve desk-owned fields + the prior status across the upsert.
      const ids = appts.map((a) => a.id);
      const preserved = new Map<string, ExistingRow>();
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await client
          .from("bookings")
          .select(
            "id, status, notes, est_price_cents, deposit_cents, deposit_status, deposit_payment_id, sale_id",
          )
          .in("id", ids.slice(i, i + 300));
        for (const r of (data || []) as ExistingRow[]) preserved.set(r.id, r);
      }

      const nowIso = new Date(now).toISOString();
      const rows = appts.map((a) => {
        const prior = preserved.get(a.id);
        return {
          id: a.id,
          // Square is physically Lumenati's; the mirror always lands there.
          shop_id: LUMENATI_SHOP_ID,
          square_appointment_id: a.id,
          client_id: a.customerId,
          artist_id: a.teamMemberId ? artistOf.get(a.teamMemberId) ?? null : null,
          starts_at: a.startAt,
          ends_at: a.endAt,
          status: reconcileStatus(prior?.status, a.status),
          // Desk note wins; fall back to the Square note on first import.
          notes: prior?.notes ?? a.note,
          est_price_cents: prior?.est_price_cents ?? 0,
          deposit_cents: prior?.deposit_cents ?? 0,
          deposit_status: prior?.deposit_status ?? "none",
          deposit_payment_id: prior?.deposit_payment_id ?? null,
          sale_id: prior?.sale_id ?? null,
          source: "square",
          synced_at: nowIso,
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await client.from("bookings").upsert(batch, { onConflict: "id" });
        if (error) throw new Error(error.message);
        mirrored += batch.length;
      }
    }
  }

  // Auto-flag overdue appointments as no_show for review (runs regardless of
  // Square). A held deposit on a no-show is forfeited in the same write.
  const nowIso = new Date(now).toISOString();
  // Derived from Square-synced data, so it stays pinned to Lumenati's shop.
  const { data: overdue } = await client
    .from("bookings")
    .select("id, deposit_status")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .eq("status", "scheduled")
    .lt("starts_at", nowIso);

  let flagged = 0;
  for (const b of (overdue || []) as { id: string; deposit_status: string | null }[]) {
    const patch: Record<string, unknown> = { status: "no_show" };
    if (b.deposit_status === "held") patch.deposit_status = "forfeited";
    const { error } = await client
      .from("bookings")
      .update(patch)
      .eq("id", b.id)
      .eq("shop_id", LUMENATI_SHOP_ID);
    if (error) throw new Error(error.message);
    flagged += 1;
  }

  return {
    feature: "bookings",
    square: isSquareConfigured ? "connected" : "not connected",
    mirrored,
    autoFlaggedNoShow: flagged,
  };
}

// Called by /api/ops/daily inside its own try/catch. `admin` is the service-role
// Supabase client (bypasses RLS). No-ops the Square pull cleanly when Square
// isn't connected, but still runs the overdue auto-flag.
export async function runDailyJob(admin: unknown) {
  return syncBookings(admin as SupabaseClient);
}
