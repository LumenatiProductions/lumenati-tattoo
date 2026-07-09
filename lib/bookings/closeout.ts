import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueForBooking } from "@/lib/followups/job";

// The shared close-out ritual (page-walk note 8): booking completed, held
// deposit applied, aftercare drip queued right now. Used by the card close-out
// (/api/bookings/closeout) and the cash close-out (/api/cash/closeout).
// Idempotent end to end — safe to re-run.
export async function completeAndDrip(
  db: SupabaseClient,
  shopId: string,
  booking: { id: string; status: string; deposit_status: string | null },
): Promise<{ depositApplied: boolean; queued: string[]; dripNote: string | null; error?: string }> {
  if (booking.status !== "completed") {
    const patch: Record<string, unknown> = { status: "completed" };
    if (booking.deposit_status === "held") patch.deposit_status = "applied";
    const { error } = await db.from("bookings").update(patch).eq("id", booking.id).eq("shop_id", shopId);
    if (error) return { depositApplied: false, queued: [], dripNote: null, error: error.message };
  }
  const drip = await enqueueForBooking(db, booking.id, shopId);
  return {
    depositApplied: booking.deposit_status === "held",
    queued: drip.queued,
    dripNote: drip.reason ?? null,
  };
}
