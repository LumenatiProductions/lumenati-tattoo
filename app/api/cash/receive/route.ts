import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { storeProofPhoto } from "@/lib/storage/proof";

export const dynamic = "force-dynamic";

// The second tap of the cash handoff (page-walk note 12): the admin has the
// stack in hand and taps "Got it". Marks the line received; if the line is a
// cash rent payment, the rent invoice flips to paid in the same breath.
// Admins only — receiving money into the box is the box-owner's move.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { entryId?: string; photoPath?: string; imageBase64?: string };
  if (!b.entryId) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });

  const { data: entry } = await me.db
    .from("cash_entries")
    .select("id, received_at, rent_invoice_id, amount_cents, artist_id")
    .eq("id", b.entryId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "Cash line not found" }, { status: 404 });
  if (entry.received_at) return NextResponse.json({ ok: true, already: true });

  const patch: Record<string, unknown> = {
    received_at: new Date().toISOString(),
    received_by: me.email,
    // A receive implies the handoff happened even if the artist never tapped.
    handed_off_at: new Date().toISOString(),
  };
  if (b.photoPath) patch.photo_path = b.photoPath;
  // Snap-the-stack (note 13): the photo rides the same request as the tap.
  if (b.imageBase64) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    const stored = await storeProofPhoto(admin, "cash", b.imageBase64);
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: 400 });
    patch.photo_path = stored.path;
  }
  const { error } = await me.db
    .from("cash_entries")
    .update(patch)
    .eq("id", entry.id)
    .eq("shop_id", me.shopId)
    .is("received_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cash rent: confirming the stack IS confirming the rent.
  let rentPaid = false;
  if (entry.rent_invoice_id) {
    const { error: rentErr } = await me.db
      .from("rent_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", entry.rent_invoice_id)
      .eq("shop_id", me.shopId)
      .eq("status", "pending");
    rentPaid = !rentErr;
  }

  return NextResponse.json({ ok: true, rentPaid });
}
