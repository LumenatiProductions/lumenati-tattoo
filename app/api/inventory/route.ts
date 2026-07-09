import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The supply closet is run by the front of house.
const STAFF = ["owner"] as const;

// Resolve the signed-in user's role, or null. Shared by every handler.
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

const isStaff = (role: string | null) =>
  !!role && STAFF.includes(role as (typeof STAFF)[number]);

const CATEGORIES = ["needle", "ink", "glove", "tube", "aftercare", "disposable", "other"] as const;
const UNITS = ["each", "box", "bottle"] as const;

type Body = {
  id?: string;
  name?: string;
  category?: string;
  brand?: string | null;
  color?: string | null;
  unit?: string;
  qty?: number | string;
  reorderAt?: number | string;
  reorderQty?: number | string;
  costCents?: number | string;
  priceCents?: number | string | null;
  supplier?: string | null;
  supplierUrl?: string | null;
  // quick-adjust only:
  delta?: number | string;
  reason?: string;
};

// Empty string -> null (text inputs post "" not null).
const orNull = (v: string | null | undefined) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
// Coerce a numeric field to a finite number, clamped to >= 0. Bad input -> 0.
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// List the whole stock list, A→Z within the grouping the page does itself.
export async function GET() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, items: [] }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// Add a stock item. Admins.
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Body;
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])
    ? b.category
    : "other";
  const unit = UNITS.includes(b.unit as (typeof UNITS)[number]) ? b.unit : "each";

  const row = {
    name,
    category,
    brand: orNull(b.brand),
    color: orNull(b.color),
    unit,
    qty: num(b.qty),
    reorder_at: num(b.reorderAt),
    reorder_qty: num(b.reorderQty),
    cost_cents: Math.round(num(b.costCents)),
    // Retail price: > 0 makes the item sellable at the POS; 0/empty stays null.
    price_cents: Math.round(num(b.priceCents)) > 0 ? Math.round(num(b.priceCents)) : null,
    supplier: orNull(b.supplier),
    supplier_url: orNull(b.supplierUrl),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("inventory_items").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// Edit an item, OR quick-adjust its quantity by a signed `delta`. Owner / front
// desk. When `delta` is present we read-modify-write the qty and append an
// `inventory_log` row (who/what/why); otherwise we patch the supplied fields.
export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // ── Quick adjust path ──
  if (b.delta !== undefined && b.delta !== null && `${b.delta}` !== "") {
    const delta = Number(b.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "delta must be a non-zero number" }, { status: 400 });
    }
    const { data: cur, error: readErr } = await supabase
      .from("inventory_items")
      .select("qty")
      .eq("id", b.id)
      .single();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const nextQty = Math.max(0, Number(cur.qty) + delta); // never let stock go negative
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ qty: nextQty, updated_at: new Date().toISOString() })
      .eq("id", b.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit trail is best-effort — a failed log never fails the adjust.
    await supabase.from("inventory_log").insert({
      item_id: b.id,
      delta,
      reason: (b.reason ?? "").trim(),
      by_email: user.email ?? null,
    });
    return NextResponse.json({ item: data });
  }

  // ── Field edit path ──
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = (b.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    patch.name = name;
  }
  if (b.category !== undefined) {
    patch.category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])
      ? b.category
      : "other";
  }
  if (b.unit !== undefined) {
    patch.unit = UNITS.includes(b.unit as (typeof UNITS)[number]) ? b.unit : "each";
  }
  if (b.brand !== undefined) patch.brand = orNull(b.brand);
  if (b.color !== undefined) patch.color = orNull(b.color);
  if (b.qty !== undefined) patch.qty = num(b.qty);
  if (b.reorderAt !== undefined) patch.reorder_at = num(b.reorderAt);
  if (b.reorderQty !== undefined) patch.reorder_qty = num(b.reorderQty);
  if (b.costCents !== undefined) patch.cost_cents = Math.round(num(b.costCents));
  if (b.priceCents !== undefined) {
    patch.price_cents = Math.round(num(b.priceCents)) > 0 ? Math.round(num(b.priceCents)) : null;
  }
  if (b.supplier !== undefined) patch.supplier = orNull(b.supplier);
  if (b.supplierUrl !== undefined) patch.supplier_url = orNull(b.supplierUrl);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("inventory_items")
    .update(patch)
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// Remove an item. Admins. Pass ?id=<uuid>. Log rows cascade-delete.
export async function DELETE(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
