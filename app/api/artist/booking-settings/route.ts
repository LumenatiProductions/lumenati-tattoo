import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { cleanHours, DAY_KEYS, type Hours } from "@/lib/bookings/slots";

export const dynamic = "force-dynamic";

// The artist's self-serve booking setup: the switch, weekly hours, session
// length, deposit. An artist edits only their own chair; an admin any chair in
// the shop. Service-role write pinned to shop_id (same wall as /api/artist/books).

type Body = {
  artistId?: string;
  selfServe?: boolean;
  hours?: Hours | null;
  sessionMinutes?: number;
  depositCents?: number;
};

async function target(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const url = new URL(req.url);
  const asked = url.searchParams.get("artist") ?? undefined;
  return { me, asked };
}

export async function GET(req: Request) {
  const t = await target(req);
  if ("error" in t) return t.error;
  const artistId = t.me.role === "owner" ? (t.asked ?? t.me.artistId) : t.me.artistId;
  if (!artistId) return NextResponse.json({ error: "No chair linked to this login." }, { status: 400 });
  if (t.me.role !== "owner" && artistId !== t.me.artistId) return NextResponse.json({ error: "Not your chair." }, { status: 403 });
  const { data, error } = await t.me.db
    .from("artists")
    .select("id, self_serve, hours, session_minutes, deposit_cents, books_closed")
    .eq("id", artistId)
    .eq("shop_id", t.me.shopId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That artist isn't in your shop." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    artistId: data.id,
    selfServe: !!data.self_serve,
    hours: cleanHours(data.hours) ?? emptyHours(),
    sessionMinutes: Number(data.session_minutes) || 120,
    depositCents: Number(data.deposit_cents) || 0,
    booksClosed: !!data.books_closed,
  });
}

export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const artistId = me.role === "owner" ? (b.artistId ?? me.artistId) : me.artistId;
  if (!artistId) return NextResponse.json({ error: "No chair linked to this login." }, { status: 400 });
  if (me.role !== "owner" && artistId !== me.artistId) return NextResponse.json({ error: "Not your chair." }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (typeof b.selfServe === "boolean") patch.self_serve = b.selfServe;
  if (b.hours !== undefined) patch.hours = b.hours === null ? null : cleanHours(b.hours);
  if (b.sessionMinutes !== undefined) {
    const m = Math.round(Number(b.sessionMinutes));
    if (!Number.isFinite(m) || m < 30 || m > 12 * 60) return NextResponse.json({ error: "Session length must be 30 minutes to 12 hours." }, { status: 400 });
    patch.session_minutes = m;
  }
  if (b.depositCents !== undefined) {
    const c = Math.round(Number(b.depositCents));
    if (!Number.isFinite(c) || c < 0 || c > 500000) return NextResponse.json({ error: "Deposit must be $0 to $5,000." }, { status: 400 });
    if (c > 0 && c < 50) return NextResponse.json({ error: "A deposit needs to be at least $0.50 (or $0 for none)." }, { status: 400 });
    patch.deposit_cents = c;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
  const { data, error } = await admin
    .from("artists")
    .update(patch)
    .eq("id", artistId)
    .eq("shop_id", me.shopId)
    .select("id, self_serve, hours, session_minutes, deposit_cents")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That artist isn't in your shop." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    selfServe: !!data.self_serve,
    hours: cleanHours(data.hours) ?? emptyHours(),
    sessionMinutes: Number(data.session_minutes) || 120,
    depositCents: Number(data.deposit_cents) || 0,
  });
}

const emptyHours = (): Hours => Object.fromEntries(DAY_KEYS.map((k) => [k, []])) as Hours;
