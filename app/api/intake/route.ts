import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { ID_TYPES, type IdType } from "@/lib/intake/forms";

export const dynamic = "force-dynamic";

// The desk runs intake; artists can read forms for their own bookings (RLS
// scopes them) so they can confirm consent is on file before they start. We gate
// here too for clean 401/403s.
const WRITE_ROLES = ["owner"] as const;
const READ_ROLES = ["owner", "artist"] as const;
const VALID_ID_TYPES = ID_TYPES.map((t) => t.value);

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

const dayBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
};

// List consent forms (newest first), plus the Overview aggregate `unsignedToday`
// = today's non-cancelled bookings with no signed, non-voided form on file.
export async function GET() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, READ_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("consent_forms")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, forms: [] }, { status: 500 });

  // Aggregate: today's bookings missing a signed form. RLS scopes both tables,
  // so an artist's count naturally reflects only their own day.
  const { start, end } = dayBounds();
  const { data: todays } = await supabase
    .from("bookings")
    .select("id")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .neq("status", "cancelled");
  const todayIds = new Set((todays ?? []).map((b) => b.id as string));
  const coveredIds = new Set(
    (data ?? [])
      .filter((f) => f.signed_at && !f.voided && f.booking_id)
      .map((f) => f.booking_id as string),
  );
  let unsignedToday = 0;
  for (const id of todayIds) if (!coveredIds.has(id)) unsignedToday++;

  return NextResponse.json({ forms: data ?? [], unsignedToday });
}

// Start a consent form. Admins.
// Body: { bookingId?, clientId?, artistId?, placement? }. Missing client/artist
// are inferred from the booking when a bookingId is given. The form starts
// unsigned with a fresh sign_token; the response carries the public signing URL
// (text/email it, or open it on the shop tablet).
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, WRITE_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    bookingId?: string | null;
    clientId?: string | null;
    artistId?: string | null;
    placement?: string;
  };

  let clientId = b.clientId || null;
  let artistId = b.artistId || null;
  if (b.bookingId) {
    const { data: bk } = await supabase
      .from("bookings")
      .select("client_id, artist_id")
      .eq("id", b.bookingId)
      .maybeSingle();
    if (bk) {
      clientId = clientId ?? (bk.client_id as string | null);
      artistId = artistId ?? (bk.artist_id as string | null);
    }
  }

  const token = randomBytes(24).toString("base64url");
  const row = {
    booking_id: b.bookingId || null,
    client_id: clientId,
    artist_id: artistId,
    placement: (b.placement ?? "").trim() || null,
    sign_token: token,
    created_by: user.email ?? null,
  };
  const { data, error } = await supabase.from("consent_forms").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signUrl = `${new URL(req.url).origin}/intake/${token}`;
  return NextResponse.json({ form: data, signUrl });
}

// Update a form's desk-side fields, or void it. Admins.
// Field edits: idChecked, idType, artistId, placement.
// Void: { void: true, voidReason } — a legal record is never hard-deleted, and a
// voided form cannot be un-voided here.
export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, WRITE_ROLES)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    idChecked?: boolean;
    idType?: IdType | null;
    artistId?: string | null;
    placement?: string;
    void?: boolean;
    voidReason?: string;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.void === true) {
    patch.voided = true;
    patch.void_reason = (b.voidReason ?? "").trim() || "Retracted by staff";
    patch.sign_token = null; // kill any outstanding signing link
  }
  if (b.idChecked !== undefined) patch.id_checked = !!b.idChecked;
  if (b.idType !== undefined) {
    if (b.idType !== null && !VALID_ID_TYPES.includes(b.idType)) {
      return NextResponse.json({ error: "Invalid ID type" }, { status: 400 });
    }
    patch.id_type = b.idType;
  }
  if (b.artistId !== undefined) patch.artist_id = b.artistId || null;
  if (b.placement !== undefined) patch.placement = b.placement.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("consent_forms")
    .update(patch)
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ form: data });
}
