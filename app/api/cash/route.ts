import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The cash drawer log — see supabase/cash-schema.sql. Desk logs entries, books
// reconcile them. Admins (RLS enforces it too). If the
// table hasn't been applied yet, GET reports { configured: false } so the page
// can show its setup hint instead of erroring.
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

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("cash_entries")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ configured: false, entries: [] });
    }
    return NextResponse.json({ error: error.message, entries: [] }, { status: 500 });
  }
  return NextResponse.json({ configured: true, entries: data ?? [] });
}

// Log cash. Body: { date?, artistId?, amountCents, taxCents?, note? }
export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    date?: string;
    artistId?: string | null;
    amountCents?: number;
    taxCents?: number;
    note?: string;
  };
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  // A cash entry can be negative (an "out" adjustment) but a single one over
  // $20k is a mistake, not a tattoo. Bound the magnitude to keep garbage /
  // hostile values out of the ledger.
  if (Math.abs(amountCents) > 2_000_000) {
    return NextResponse.json({ error: "Amount is out of range." }, { status: 400 });
  }
  // Sales tax INCLUDED in the amount (taxable product sales). It's the state's
  // money, not income: the ledger books the sale net of it, and the tax as its
  // own row so the remittance figure is one SUM.
  const taxRaw = Math.round(Number(b.taxCents ?? 0));
  const taxCents = Number.isFinite(taxRaw) && taxRaw > 0 && amountCents > 0 ? taxRaw : 0;
  if (taxCents >= amountCents && taxCents > 0) {
    return NextResponse.json({ error: "Tax can't be the whole amount." }, { status: 400 });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("cash_entries")
    .insert({
      date,
      artist_id: b.artistId || null,
      amount_cents: amountCents,
      tax_cents: taxCents,
      note: (b.note ?? "").trim(),
      entered_by: user.email ?? null,
    })
    .select()
    .single();
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "The cash log isn't set up yet — run cash-schema.sql in Supabase." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dual-write to the canonical ledger (money source of truth, staged rollout).
  // Cash is entered by staff and stamped with who logged it; RLS lets staff
  // insert only source='cash' rows. Best-effort — a ledger hiccup must not block
  // logging cash; the reconcile step catches any drift.
  const ledgerRows: Record<string, unknown>[] = [
    {
      source: "cash",
      kind: amountCents >= 0 ? "sale" : "adjustment",
      direction: amountCents >= 0 ? "in" : "out",
      amount_cents: Math.abs(amountCents) - taxCents, // sale net of tax
      artist_id: b.artistId || null,
      occurred_at: date,
      created_by: user.email ?? null,
      external_id: `cash_${data.id}`,
      note: (b.note ?? "").trim() || null,
    },
  ];
  if (taxCents > 0) {
    ledgerRows.push({
      source: "cash",
      kind: "tax",
      direction: "in",
      amount_cents: taxCents,
      artist_id: b.artistId || null,
      occurred_at: date,
      created_by: user.email ?? null,
      external_id: `cash_${data.id}_tax`,
      note: "sales tax collected",
    });
  }
  await supabase.from("ledger").insert(ledgerRows);

  return NextResponse.json({ entry: data });
}

// Toggle reconciled. Body: { id, reconciled }
export async function PATCH(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; reconciled?: boolean };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const reconciled = b.reconciled === true;
  const { data, error } = await supabase
    .from("cash_entries")
    .update({ reconciled, reconciled_at: reconciled ? new Date().toISOString() : null })
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The ledger is append-only, so a deleted cash entry is reversed with a
  // compensating row rather than removed — the money history stays intact.
  // A taxed entry has TWO rows (sale + tax); both get reversed. The tax
  // reversal keeps kind='tax' so the remittance figure nets out too.
  const { data: origs } = await supabase
    .from("ledger")
    .select("id, kind, amount_cents, direction, artist_id, external_id")
    .in("external_id", [`cash_${id}`, `cash_${id}_tax`]);
  for (const orig of origs ?? []) {
    await supabase.from("ledger").insert({
      source: "cash",
      kind: orig.kind === "tax" ? "tax" : "adjustment",
      direction: orig.direction === "in" ? "out" : "in",
      amount_cents: orig.amount_cents,
      artist_id: orig.artist_id,
      reverses: orig.id,
      external_id: `${orig.external_id}_rev`,
      created_by: user.email ?? null,
      note: "Reversed deleted cash entry",
    });
  }
  return NextResponse.json({ ok: true });
}
