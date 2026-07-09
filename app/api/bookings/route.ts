import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { findConflict } from "@/lib/bookings/conflict";

export const dynamic = "force-dynamic";

// The desk runs the calendar; artists read their own day (RLS scopes them to
// artist_id = my_artist(), and we gate here for clean 401/403s).
const WRITE_ROLES = ["owner"] as const;
const READ_ROLES = ["owner", "artist"] as const;

// An artist works one client at a time, so two scheduled bookings on the same
// artist that overlap in time is almost always a mistake. We block it (409 with
// conflict:true) unless the desk passes force — sometimes they really do want a
// guest or back-to-back. A booking with no end time is treated as one hour, the
// same assumption the week grid draws.
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

function conflictResponse(at: string) {
  const when = new Date(at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TZ,
  });
  return NextResponse.json(
    { error: `This overlaps another booking for that artist at ${when}. Book anyway?`, conflict: true },
    { status: 409 },
  );
}

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

// Create a booking by hand. Admins.
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
    force?: boolean;
  };
  if (!b.startsAt) {
    return NextResponse.json({ error: "A start date/time is required." }, { status: 400 });
  }

  // Double-booking guard (an artist + a time). Skipped for unassigned bookings.
  if (b.artistId && !b.force) {
    const clash = await findConflict(supabase, b.artistId, b.startsAt, b.endsAt || null);
    if (clash) return conflictResponse(clash.startsAt);
  }

  const deposit = Math.max(0, Math.round(b.depositCents ?? 0));
  // A deposit amount with no explicit status implies it's held.
  const VALID_DEPOSIT = ["none", "held", "applied", "forfeited", "refunded"];
  if (b.depositStatus !== undefined && !VALID_DEPOSIT.includes(b.depositStatus)) {
    return NextResponse.json({ error: "Invalid deposit status" }, { status: 400 });
  }
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

// Edit a booking and/or run a status transition. Admins.
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
    confirmedAt?: string | null;
    force?: boolean;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const VALID_STATUS = ["scheduled", "completed", "no_show", "cancelled"];
  if (b.status && !VALID_STATUS.includes(b.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const VALID_DEPOSIT = ["none", "held", "applied", "forfeited", "refunded"];
  if (b.depositStatus !== undefined && !VALID_DEPOSIT.includes(b.depositStatus)) {
    return NextResponse.json({ error: "Invalid deposit status" }, { status: 400 });
  }

  // A move (time or artist change) re-runs the double-booking guard against the
  // effective slot — current values fill in whatever the patch leaves alone.
  // Status-only edits (complete/no-show) never trip it.
  const movesSlot = b.startsAt !== undefined || b.endsAt !== undefined || b.artistId !== undefined;
  if (movesSlot && (b.status === undefined || b.status === "scheduled") && !b.force) {
    const { data: cur } = await supabase
      .from("bookings")
      .select("artist_id, starts_at, ends_at")
      .eq("id", b.id)
      .maybeSingle();
    const artistId = b.artistId !== undefined ? b.artistId : (cur?.artist_id as string | null);
    const startsAt = b.startsAt !== undefined ? b.startsAt : (cur?.starts_at as string | undefined);
    const endsAt = b.endsAt !== undefined ? b.endsAt : (cur?.ends_at as string | null);
    if (artistId && startsAt) {
      const clash = await findConflict(supabase, artistId, startsAt, endsAt ?? null, b.id);
      if (clash) return conflictResponse(clash.startsAt);
    }
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
  // Manual confirm: the desk confirming for a client who said yes by phone/in
  // person (the SMS "reply C" loop sets this too). null clears it.
  if (b.confirmedAt !== undefined) patch.confirmed_at = b.confirmedAt;

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
