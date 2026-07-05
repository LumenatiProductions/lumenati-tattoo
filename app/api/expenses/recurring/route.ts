import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Recurring bills (shop lease, utilities, software) — templates that post real
// expense rows when due. Books crew only (RLS enforces it too).
const BOOKS = ["owner", "bookkeeper"] as const;
const CATEGORIES = ["supplies", "rent", "utilities", "software", "equipment", "fees", "other"] as const;
const CADENCES = ["weekly", "monthly", "quarterly", "yearly"] as const;

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
const ok = (r: string | null) => !!r && BOOKS.includes(r as (typeof BOOKS)[number]);
const isISODate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .order("active", { ascending: false })
    .order("next_due", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, bills: [] }, { status: 500 });
  return NextResponse.json({ bills: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    category?: string;
    vendor?: string;
    amountCents?: number;
    cadence?: string;
    nextDue?: string;
    note?: string;
  };
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name the bill (e.g. Shop lease)." }, { status: 400 });
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  if (!isISODate(b.nextDue)) {
    return NextResponse.json({ error: "Pick the next due date." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("recurring_expenses")
    .insert({
      name,
      category: CATEGORIES.includes(b.category as (typeof CATEGORIES)[number]) ? b.category : "other",
      vendor: (b.vendor ?? "").trim() || null,
      amount_cents: amountCents,
      cadence: CADENCES.includes(b.cadence as (typeof CADENCES)[number]) ? b.cadence : "monthly",
      next_due: b.nextDue,
      note: (b.note ?? "").trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bill: data });
}

// Edit a bill. Body: { id, ...fields }. `active:false` pauses it.
export async function PATCH(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    category?: string;
    vendor?: string | null;
    amountCents?: number;
    cadence?: string;
    nextDue?: string;
    active?: boolean;
    note?: string;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])) patch.category = b.category;
  if (b.vendor !== undefined) patch.vendor = (b.vendor ?? "").trim() || null;
  if (b.amountCents !== undefined) {
    const cents = Math.round(Number(b.amountCents));
    if (!Number.isFinite(cents) || cents < 1) return NextResponse.json({ error: "Bad amount." }, { status: 400 });
    patch.amount_cents = cents;
  }
  if (CADENCES.includes(b.cadence as (typeof CADENCES)[number])) patch.cadence = b.cadence;
  if (isISODate(b.nextDue)) patch.next_due = b.nextDue;
  if (typeof b.active === "boolean") patch.active = b.active;
  if (typeof b.note === "string") patch.note = b.note.trim();
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await supabase
    .from("recurring_expenses")
    .update(patch)
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bill: data });
}

export async function DELETE(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
