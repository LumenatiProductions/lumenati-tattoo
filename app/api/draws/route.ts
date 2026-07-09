import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Owner draws — money the owner takes out of the business. A distribution,
// not an expense: it sits below the profit line on the P&L. Books crew only.
const BOOKS = ["owner"] as const;
const METHODS = ["cash", "check", "transfer", "other"] as const;

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

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data, error } = await supabase
    .from("owner_draws")
    .select("*")
    .order("date", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message, draws: [] }, { status: 500 });
  return NextResponse.json({ draws: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    date?: string;
    amountCents?: number;
    method?: string;
    note?: string;
  };
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("owner_draws")
    .insert({
      date,
      amount_cents: amountCents,
      method: METHODS.includes(b.method as (typeof METHODS)[number]) ? b.method : "transfer",
      note: (b.note ?? "").trim(),
      entered_by: user.email ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draw: data });
}

export async function DELETE(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("owner_draws").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
