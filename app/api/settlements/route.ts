import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Settlements record "we squared up with this artist through DATE" — see
// supabase/settlements-schema.sql. Owner / bookkeeper write; an artist's own
// rows are readable under RLS. If the table hasn't been applied yet the GET
// reports { configured: false } so the Payouts page can hide the buttons
// instead of erroring (same graceful-gate pattern as Stripe/Square).
const BOOKS = ["owner", "bookkeeper"] as const;
const READ = ["owner", "bookkeeper", "artist"] as const;
const METHODS = ["check", "cash", "stripe", "other"] as const;

async function gate() {
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
const can = (role: string | null, roles: readonly string[]) => !!role && roles.includes(role);

// Postgres "relation does not exist" — schema not applied yet.
const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

// List recent settlements + each artist's latest settled_through.
export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, READ)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ configured: false, settlements: [], settledThrough: {} });
    }
    return NextResponse.json({ error: error.message, settlements: [] }, { status: 500 });
  }

  // Latest settled_through per artist (rows are newest-first).
  const settledThrough: Record<string, string> = {};
  for (const s of data ?? []) {
    const a = s.artist_id as string;
    const t = s.settled_through as string;
    if (!settledThrough[a] || t > settledThrough[a]) settledThrough[a] = t;
  }

  return NextResponse.json({ configured: true, settlements: data ?? [], settledThrough });
}

// Record a settlement. Owner / bookkeeper.
// Body: { artistId, amountCents, settledThrough?, method?, note? }
export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(role, BOOKS)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    amountCents?: number;
    settledThrough?: string;
    method?: string;
    note?: string;
  };
  if (!b.artistId) return NextResponse.json({ error: "Missing artistId" }, { status: 400 });
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents)) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  const settledThrough = /^\d{4}-\d{2}-\d{2}$/.test(b.settledThrough ?? "")
    ? b.settledThrough
    : new Date().toISOString().slice(0, 10);
  const method = METHODS.includes(b.method as (typeof METHODS)[number]) ? b.method : "other";

  const { data, error } = await supabase
    .from("settlements")
    .insert({
      artist_id: b.artistId,
      amount_cents: amountCents,
      settled_through: settledThrough,
      method,
      note: (b.note ?? "").trim(),
      created_by: user.email ?? null,
    })
    .select()
    .single();
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "Settlements aren't set up yet — run settlements-schema.sql in Supabase." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ settlement: data });
}
