import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Shop expenses are the books — owner / bookkeeper only (RLS enforces it too).
const BOOKS = ["owner", "bookkeeper"] as const;
const CATEGORIES = ["supplies", "rent", "utilities", "software", "equipment", "fees", "other"] as const;

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
const orNull = (v: string | null | undefined) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message, expenses: [] }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    date?: string;
    category?: string;
    vendor?: string;
    amountCents?: number;
    note?: string;
    receiptUrl?: string;
  };
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number]) ? b.category : "other";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      date,
      category,
      vendor: orNull(b.vendor),
      amount_cents: amountCents,
      note: (b.note ?? "").trim(),
      receipt_url: orNull(b.receiptUrl),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
