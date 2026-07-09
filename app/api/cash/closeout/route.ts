import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveStaff } from "@/lib/api-auth";
import { completeAndDrip } from "@/lib/bookings/closeout";

export const dynamic = "force-dynamic";

// "Client paid cash" at the chair (page-walk note 12). One call books the
// money honestly and runs the close-out ritual:
//   - ledger: sale (service) + tip rows, source 'cash' — gross is real for
//     wages math (payroll) and 1099 gross (renters) either way.
//   - payroll artists (split + salary): a cash_entries line for the WHOLE
//     amount — the artist is physically holding the shop's money until the
//     two-tap handoff (whole amount to J.D.; wages ride Gusto — Scott 07-09).
//   - booth renters: cash is THEIRS, no handoff line.
//   - optional bookingId: completed + deposit applied + drip queued.
// Admins may log for any artist; an artist only their own chair.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    bookingId?: string | null;
    serviceCents?: number;
    tipCents?: number;
    date?: string;
  };
  const serviceCents = Math.round(Number(b.serviceCents));
  const tipCents = Math.max(0, Math.round(Number(b.tipCents ?? 0)) || 0);
  if (!Number.isFinite(serviceCents) || serviceCents <= 0) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }

  const artistId = me.role === "owner" ? b.artistId || me.artistId : me.artistId;
  if (!artistId) return NextResponse.json({ error: "No artist on this account." }, { status: 400 });
  if (me.role !== "owner" && artistId !== me.artistId) {
    return NextResponse.json({ error: "Not your chair" }, { status: 403 });
  }

  const { data: artist } = await me.db
    .from("artists")
    .select("id, pay_type")
    .eq("id", artistId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: "Unknown artist" }, { status: 404 });
  const isRenter = artist.pay_type === "booth_rent";

  // Booking (optional) must belong to the artist being logged.
  type Bk = { id: string; artist_id: string | null; status: string; deposit_status: string | null };
  let booking: Bk | null = null;
  if (b.bookingId) {
    const { data: bk } = await me.db
      .from("bookings")
      .select("id, artist_id, status, deposit_status")
      .eq("id", b.bookingId)
      .eq("shop_id", me.shopId)
      .maybeSingle();
    if (!bk) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (bk.artist_id !== artistId) return NextResponse.json({ error: "Not this artist's booking" }, { status: 403 });
    booking = bk as Bk;
  }

  const totalCents = serviceCents + tipCents;
  // The device knows the shop's calendar day (server is UTC — Denver evenings
  // are already tomorrow there); same contract as /api/cash.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? (b.date as string) : new Date().toISOString().slice(0, 10);

  // Payroll cash is shop-held from the first second — one handoff line.
  let entryId: string | null = null;
  if (!isRenter) {
    const { data: entry, error } = await me.db
      .from("cash_entries")
      .insert({
        date,
        artist_id: artistId,
        amount_cents: totalCents,
        tax_cents: 0,
        note: "Service cash at the chair",
        entered_by: me.email,
        booking_id: booking?.id ?? null,
        shop_id: me.shopId,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    entryId = entry.id as string;
  }

  // Ledger is the money truth either way (renter gross stays visible as
  // pass-through; payroll gross feeds Gusto wages math via ledger_sales).
  const base = entryId ? `cash_${entryId}` : `cashclose_${randomUUID()}`;
  const ledgerRows: Record<string, unknown>[] = [
    {
      source: "cash",
      kind: "sale",
      direction: "in",
      amount_cents: serviceCents,
      artist_id: artistId,
      occurred_at: date,
      created_by: me.email,
      external_id: base,
      note: "Service cash at the chair",
      shop_id: me.shopId,
    },
  ];
  if (tipCents > 0) {
    ledgerRows.push({
      source: "cash",
      kind: "tip",
      direction: "in",
      amount_cents: tipCents,
      artist_id: artistId,
      occurred_at: date,
      created_by: me.email,
      external_id: `${base}_tip`,
      note: "Cash tip",
      shop_id: me.shopId,
    });
  }
  const { error: ledgerErr } = await me.db.from("ledger").insert(ledgerRows);
  if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 500 });

  // The ritual, if a booking was confirmed.
  let closeout: Awaited<ReturnType<typeof completeAndDrip>> | null = null;
  if (booking && booking.status !== "cancelled") {
    closeout = await completeAndDrip(me.db, me.shopId, booking);
  }

  return NextResponse.json({
    ok: true,
    holding: isRenter ? 0 : totalCents, // what the artist now physically holds for the shop
    isRenter,
    entryId,
    completed: !!closeout,
    depositApplied: closeout?.depositApplied ?? false,
    queued: closeout?.queued ?? [],
    dripNote: closeout?.dripNote ?? null,
  });
}
