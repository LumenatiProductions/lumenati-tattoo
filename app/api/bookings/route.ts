import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The desk runs the calendar; artists read their own day (RLS scopes them to
// artist_id = my_artist(), and we gate here for clean 401/403s).
const WRITE_ROLES = ["owner", "bookkeeper", "frontdesk"] as const;
const READ_ROLES = ["owner", "bookkeeper", "frontdesk", "artist"] as const;

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

const can = (role: string | null, roles: readonly string[]) =>
  !!role && roles.includes(role);

// List bookings, optionally within a [from,to] window and/or filtered by status
// or artist. Defaults to a wide window (60d back, 90d forward) so the agenda has
// something to show without params. RLS also scopes an artist to their own rows.
export async function GET(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, READ_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const now = Date.now();
  const from = sp.get("from") || new Date(now - 60 * 86_400_000).toISOString();
  const to = sp.get("to") || new Date(now + 90 * 86_400_000).toISOString();
  const status = sp.get("status");
  const artistId = sp.get("artist_id");

  let query = supabase
    .from("bookings")
    .select("*")
    .gte("starts_at", from)
    .lte("starts_at", to);
  if (status) query = query.eq("status", status);
  if (artistId) query = query.eq("artist_id", artistId);

  const { data, error } = await query.order("starts_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, bookings: [] }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}

// Create a booking by hand. Owner / bookkeeper / front desk.
// Body: { startsAt, endsAt?, clientId?, artistId?, serviceDesc?, estPriceCents?,
//         depositCents?, depositStatus?, depositPaymentId?, notes?, source? }
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, WRITE_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    startsAt?: string;
    endsAt?: string;
    clientId?: string | null;
    artistId?: string | null;
    serviceDesc?: string;
    estPriceCents?: number;
    depositCents?: number;
    depositStatus?: string;
    depositPaymentId?: string;
    notes?: string;
    source?: string;
  };
  if (!b.startsAt) {
    return NextResponse.json({ error: "A start date/time is required." }, { status: 400 });
  }

  const deposit = Math.max(0, Math.round(b.depositCents ?? 0));
  // A deposit amount with no explicit status implies it's held.
  const depositStatus = b.depositStatus ?? (deposit > 0 ? "held" : "none");
  const source = b.source === "web_request" ? "web_request" : "manual";

  const row = {
    id: `bk-${randomUUID()}`,
    square_appointment_id: null,
    client_id: b.clientId || null,
    artist_id: b.artistId || null,
    starts_at: b.startsAt,
    ends_at: b.endsAt || null,
    status: "scheduled",
    service_desc: (b.serviceDesc ?? "").trim(),
    est_price_cents: Math.max(0, Math.round(b.estPriceCents ?? 0)),
    deposit_cents: deposit,
    deposit_status: depositStatus,
    deposit_payment_id: b.depositPaymentId || null,
    notes: (b.notes ?? "").trim(),
    source,
  };
  const { data, error } = await supabase.from("bookings").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}

// Edit a booking and/or run a status transition. Owner / bookkeeper / front desk.
// Plain field edits: clientId, artistId, startsAt, endsAt, serviceDesc,
// estPriceCents, depositCents, depositPaymentId, notes.
// Status transition: pass `status` (scheduled|completed|no_show|cancelled). The
// deposit cascades unless `depositStatus` is given explicitly:
//   completed -> a held deposit is APPLIED   (+ optional saleId links the ticket)
//   no_show   -> a held deposit is FORFEITED
//   cancelled -> a held deposit is REFUNDED
export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, WRITE_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    clientId?: string | null;
    artistId?: string | null;
    startsAt?: string;
    endsAt?: string | null;
    serviceDesc?: string;
    estPriceCents?: number;
    depositCents?: number;
    depositStatus?: string;
    depositPaymentId?: string | null;
    saleId?: string | null;
    notes?: string;
    status?: string;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const VALID_STATUS = ["scheduled", "completed", "no_show", "cancelled"];
  if (b.status && !VALID_STATUS.includes(b.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (b.clientId !== undefined) patch.client_id = b.clientId || null;
  if (b.artistId !== undefined) patch.artist_id = b.artistId || null;
  if (b.startsAt !== undefined) patch.starts_at = b.startsAt;
  if (b.endsAt !== undefined) patch.ends_at = b.endsAt || null;
  if (b.serviceDesc !== undefined) patch.service_desc = b.serviceDesc.trim();
  if (b.estPriceCents !== undefined) patch.est_price_cents = Math.max(0, Math.round(b.estPriceCents));
  if (b.depositCents !== undefined) patch.deposit_cents = Math.max(0, Math.round(b.depositCents));
  if (b.depositPaymentId !== undefined) patch.deposit_payment_id = b.depositPaymentId || null;
  if (b.saleId !== undefined) patch.sale_id = b.saleId || null;
  if (b.notes !== undefined) patch.notes = b.notes.trim();

  // Status transition + deposit cascade. We read the current deposit_status so a
  // cascade only acts on a held deposit (idempotent if re-run).
  if (b.status) {
    patch.status = b.status;
    if (b.depositStatus === undefined) {
      const { data: cur } = await supabase
        .from("bookings")
        .select("deposit_status")
        .eq("id", b.id)
        .maybeSingle();
      const held = cur?.deposit_status === "held";
      if (held && b.status === "completed") patch.deposit_status = "applied";
      else if (held && b.status === "no_show") patch.deposit_status = "forfeited";
      else if (held && b.status === "cancelled") patch.deposit_status = "refunded";
    }
  }
  if (b.depositStatus !== undefined) patch.deposit_status = b.depositStatus;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}
