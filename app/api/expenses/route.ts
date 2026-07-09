import { NextResponse } from "next/server";
import { storeProofPhoto } from "@/lib/storage/proof";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Shop expenses are the books — admins only (RLS enforces it too).
const BOOKS = ["owner"] as const;
const CATEGORIES = ["supplies", "rent", "utilities", "software", "equipment", "fees", "other"] as const;

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null, shopId: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("email", user.email!)
    .maybeSingle();
  return {
    supabase,
    user,
    role: profile?.role ?? null,
    shopId: (profile?.shop_id as string | null) ?? null,
  };
}
const ok = (r: string | null) => !!r && BOOKS.includes(r as (typeof BOOKS)[number]);
const orNull = (v: string | null | undefined) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message, expenses: [] }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, role, shopId } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role) || !shopId) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    date?: string;
    category?: string;
    vendor?: string;
    amountCents?: number;
    note?: string;
    receiptUrl?: string;
    receiptBase64?: string;
    // Optional restock link: a supplies purchase can land in inventory too.
    restockItemId?: string;
    restockQty?: number;
  };
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number]) ? b.category : "other";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : new Date().toISOString().slice(0, 10);

  // Restock side-effect (validated before the expense lands so a typo'd qty
  // doesn't book an expense without the stock). Service-role write: the books
  // crew may not have inventory RLS rights, but a restock attached to a real
  // expense is a books action — by_email keeps the audit trail honest.
  let restock: { itemId: string; qty: number; name: string } | null = null;
  if (b.restockItemId && b.restockQty !== undefined) {
    const qty = Math.round(Number(b.restockQty));
    if (!Number.isFinite(qty) || qty < 1) {
      return NextResponse.json({ error: "Restock quantity must be at least 1." }, { status: 400 });
    }
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
    const { data: item } = await admin
      .from("inventory_items")
      .select("id, name, qty")
      .eq("id", b.restockItemId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "That inventory item doesn't exist." }, { status: 400 });
    restock = { itemId: item.id as string, qty, name: item.name as string };
  }

  const note = [(b.note ?? "").trim(), restock ? `Restocked ${restock.qty} × ${restock.name}.` : ""]
    .filter(Boolean)
    .join(" ");

  // Receipt photo (note 13): store the snap privately, keep the path on the row.
  let receiptPath: string | null = null;
  if (b.receiptBase64) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    if (admin) {
      const stored = await storeProofPhoto(admin, "receipts", b.receiptBase64);
      if (stored.error) return NextResponse.json({ error: stored.error }, { status: 400 });
      receiptPath = stored.path ?? null;
    }
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      date,
      category,
      vendor: orNull(b.vendor),
      amount_cents: amountCents,
      note,
      receipt_url: receiptPath ?? orNull(b.receiptUrl),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (restock) {
    const admin = createAdminClient()!;
    const { data: item } = await admin
      .from("inventory_items")
      .select("qty")
      .eq("id", restock.itemId)
      .eq("shop_id", shopId)
      .maybeSingle();
    await admin
      .from("inventory_items")
      .update({ qty: Number(item?.qty ?? 0) + restock.qty })
      .eq("id", restock.itemId)
      .eq("shop_id", shopId);
    await admin.from("inventory_log").insert({
      shop_id: shopId,
      item_id: restock.itemId,
      delta: restock.qty,
      reason: `restock · expense ${data.id}${b.vendor ? ` · ${b.vendor}` : ""}`,
      by_email: user.email ?? null,
    });
  }

  return NextResponse.json({ expense: data, restocked: restock ? restock.qty : 0 });
}

export async function DELETE(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
