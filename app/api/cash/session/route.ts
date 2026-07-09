import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Drawer sessions (cash-sessions-schema.sql). One open session at a time.
//   GET   — the open session (if any) + the last few closed ones + expected-so-far
//   POST  — open the drawer: { openingFloatCents }
//   PATCH — close it: { countedCents, note? } (expected computed server-side)

const STAFF = ["owner"] as const;

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
const ok = (r: string | null) => !!r && STAFF.includes(r as (typeof STAFF)[number]);
const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

// Cash logged while the session has been open — the live "expected" number.
async function loggedSince(supabase: Awaited<ReturnType<typeof createClient>>, openedAt: string) {
  const { data } = await supabase
    .from("cash_entries")
    .select("amount_cents")
    .gte("created_at", openedAt);
  return (data ?? []).reduce((a, r) => a + (r.amount_cents as number), 0);
}

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data: open, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ configured: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: recent } = await supabase
    .from("cash_sessions")
    .select("*")
    .not("closed_at", "is", null)
    .order("opened_at", { ascending: false })
    .limit(7);

  let expectedSoFar: number | null = null;
  if (open) {
    expectedSoFar =
      (open.opening_float_cents as number) + (await loggedSince(supabase, open.opened_at as string));
  }

  return NextResponse.json({ configured: true, open: open ?? null, expectedSoFar, recent: recent ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { openingFloatCents?: number };
  const float = Math.round(Number(b.openingFloatCents ?? 0));
  if (!Number.isFinite(float) || float < 0) {
    return NextResponse.json({ error: "Opening float must be 0 or more." }, { status: 400 });
  }

  // One drawer at a time.
  const { data: open, error: openErr } = await supabase
    .from("cash_sessions")
    .select("id")
    .is("closed_at", null)
    .maybeSingle();
  if (openErr && isMissingTable(openErr.message)) {
    return NextResponse.json(
      { error: "Drawer sessions aren't set up yet — run cash-sessions-schema.sql in Supabase." },
      { status: 503 },
    );
  }
  if (open) return NextResponse.json({ error: "The drawer is already open — close it first." }, { status: 409 });

  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({ opening_float_cents: float, opened_by: user.email ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { countedCents?: number; note?: string };
  const counted = Math.round(Number(b.countedCents));
  if (!Number.isFinite(counted) || counted < 0) {
    return NextResponse.json({ error: "Enter what you counted in the drawer." }, { status: 400 });
  }

  const { data: open } = await supabase
    .from("cash_sessions")
    .select("*")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .maybeSingle();
  if (!open) return NextResponse.json({ error: "No open drawer to close." }, { status: 409 });

  const expected =
    (open.opening_float_cents as number) + (await loggedSince(supabase, open.opened_at as string));

  const { data, error } = await supabase
    .from("cash_sessions")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: user.email ?? null,
      expected_cents: expected,
      counted_cents: counted,
      over_short_cents: counted - expected,
      note: (b.note ?? "").trim(),
    })
    .eq("id", open.id)
    .is("closed_at", null) // double-close guard
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
