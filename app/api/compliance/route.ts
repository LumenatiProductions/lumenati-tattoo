import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStatus } from "@/lib/compliance/job";

export const dynamic = "force-dynamic";

// Compliance is owner-only (sensitive: license numbers, insurance, inspections).
// RLS enforces it too; this is the first gate.
async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { supabase, user: null, role: null as string | null, shopId: null as string | null };
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

const SCOPES = ["artist", "shop"] as const;
const KINDS = ["tattoo_license", "bbp_cert", "shop_permit", "inspection", "insurance"] as const;

type Body = {
  id?: string;
  scope?: string;
  artistId?: string | null;
  kind?: string;
  label?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  documentUrl?: string | null;
  notes?: string;
};

// Normalize an empty string to null (date / text inputs post "" not null).
const orNull = (v: string | null | undefined) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// List every tracked item, soonest-to-expire first (nulls last). Owner only.
export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { data, error } = await supabase
    .from("compliance_items")
    .select("*")
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message, items: [] }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// Add an item. Owner only. Status is computed from the expiry up front so the
// badge is correct immediately (the nightly job keeps it fresh thereafter).
export async function POST(req: Request) {
  const { supabase, user, role, shopId } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (!shopId) return NextResponse.json({ error: "No shop for this account" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const scope = body.scope ?? "";
  const kind = body.kind ?? "";
  if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
    return NextResponse.json({ error: "scope must be 'artist' or 'shop'" }, { status: 400 });
  }
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "Unknown compliance kind" }, { status: 400 });
  }
  const artistId = scope === "artist" ? orNull(body.artistId) : null;
  if (scope === "artist" && !artistId) {
    return NextResponse.json({ error: "Pick an artist for an artist-scoped item" }, { status: 400 });
  }

  const expiresOn = orNull(body.expiresOn);
  const row = {
    shop_id: shopId,
    scope,
    artist_id: artistId,
    kind,
    label: orNull(body.label),
    issued_on: orNull(body.issuedOn),
    expires_on: expiresOn,
    document_url: orNull(body.documentUrl),
    status: computeStatus(expiresOn),
    notes: (body.notes ?? "").trim(),
  };

  const { data, error } = await supabase
    .from("compliance_items")
    .insert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// Edit an item. Owner only. Any change that touches the expiry recomputes status.
export async function PATCH(req: Request) {
  const { supabase, user, role, shopId } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (!shopId) return NextResponse.json({ error: "No shop for this account" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as (typeof KINDS)[number])) {
      return NextResponse.json({ error: "Unknown compliance kind" }, { status: 400 });
    }
    patch.kind = body.kind;
  }
  if (body.label !== undefined) patch.label = orNull(body.label);
  if (body.issuedOn !== undefined) patch.issued_on = orNull(body.issuedOn);
  if (body.expiresOn !== undefined) {
    patch.expires_on = orNull(body.expiresOn);
    patch.status = computeStatus(patch.expires_on as string | null);
  }
  if (body.documentUrl !== undefined) patch.document_url = orNull(body.documentUrl);
  if (body.notes !== undefined) patch.notes = (body.notes ?? "").trim();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("compliance_items")
    .update(patch)
    .eq("id", body.id)
    .eq("shop_id", shopId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// Remove an item. Owner only. Pass ?id=<uuid>.
export async function DELETE(req: Request) {
  const { supabase, user, role, shopId } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (!shopId) return NextResponse.json({ error: "No shop for this account" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("compliance_items")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
