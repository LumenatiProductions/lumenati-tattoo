import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { enqueueForBooking } from "@/lib/followups/job";

export const dynamic = "force-dynamic";

// The one-tap close-out (page-walk note 8): the payment just landed, the
// artist confirms which booking it was, and ONE tap does the whole ritual —
// booking completed, held deposit applied, aftercare drip queued immediately
// (no waiting for the nightly scan). Admins can close out anything; an artist
// only their own chair. Idempotent: re-running on a completed booking just
// re-asserts the drip (upsert dedupes).
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { bookingId?: string };
  if (!b.bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  // On the Bearer path me.db is the service-role client — every read/write
  // pins the caller's shop explicitly (same contract as the other routes).
  const { data: booking } = await me.db
    .from("bookings")
    .select("id, artist_id, client_id, status, deposit_status")
    .eq("id", b.bookingId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (me.role !== "owner" && booking.artist_id !== me.artistId) {
    return NextResponse.json({ error: "Not your booking" }, { status: 403 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "This booking was cancelled." }, { status: 409 });
  }

  if (booking.status !== "completed") {
    const patch: Record<string, unknown> = { status: "completed" };
    if (booking.deposit_status === "held") patch.deposit_status = "applied";
    const { error } = await me.db
      .from("bookings")
      .update(patch)
      .eq("id", booking.id)
      .eq("shop_id", me.shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const drip = await enqueueForBooking(me.db, booking.id as string, me.shopId);
  return NextResponse.json({
    ok: true,
    completed: true,
    depositApplied: booking.deposit_status === "held",
    queued: drip.queued,
    dripNote: drip.reason ?? null,
  });
}
