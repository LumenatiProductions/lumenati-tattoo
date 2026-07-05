import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The shop's sales tax rate, stored in basis points (725 = 7.25%) on the shop
// row. Used to suggest the tax split when logging taxable sales (aftercare
// products); the remittance figure on the P&L sums what was actually captured.
const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const BOOKS = ["owner", "bookkeeper"] as const;

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return profile?.role ?? null;
}

export async function GET() {
  const role = await gate();
  if (!role) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
  const { data, error } = await db.from("shops").select("sales_tax_bps").eq("id", SHOP_ID).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bps: data?.sales_tax_bps ?? 0 });
}

export async function POST(req: Request) {
  const role = await gate();
  if (!role) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!BOOKS.includes(role as (typeof BOOKS)[number])) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { bps?: number };
  const bps = Math.round(Number(b.bps));
  if (!Number.isFinite(bps) || bps < 0 || bps > 2000) {
    return NextResponse.json({ error: "Enter the rate as a percent between 0 and 20." }, { status: 400 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
  const { error } = await db.from("shops").update({ sales_tax_bps: bps }).eq("id", SHOP_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bps });
}
