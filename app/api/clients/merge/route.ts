import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Merge two client records (owner only). Square sync + walk-ins + kiosk edits
// inevitably create duplicates; this folds `mergeId` into `keepId`:
//   - bookings / consent_forms / payments / followups re-point to the keeper
//   - empty keeper fields fill from the duplicate (never overwrite real data);
//     notes concatenate; spend sums; first/last seen widen
//   - the duplicate row is deleted
// Service-role writes (cross-table), gated hard on the owner role.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("email", user.email!)
    .maybeSingle();
  if (profile?.role !== "owner" || !profile.shop_id) {
    return NextResponse.json({ error: "Owners only" }, { status: 403 });
  }
  // Service-role writes below bypass RLS — everything scopes to the owner's shop.
  const shopId = profile.shop_id as string;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { keepId?: string; mergeId?: string };
  if (!b.keepId || !b.mergeId) return NextResponse.json({ error: "Pick both clients." }, { status: 400 });
  if (b.keepId === b.mergeId) return NextResponse.json({ error: "That's the same client twice." }, { status: 400 });

  const [{ data: keep }, { data: dupe }] = await Promise.all([
    admin.from("clients").select("*").eq("id", b.keepId).eq("shop_id", shopId).maybeSingle(),
    admin.from("clients").select("*").eq("id", b.mergeId).eq("shop_id", shopId).maybeSingle(),
  ]);
  if (!keep || !dupe) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  // Never delete the Square-mirrored row in favor of a hand-typed one — the
  // nightly sync would just recreate the duplicate.
  if (dupe.square_customer_id && !keep.square_customer_id) {
    return NextResponse.json(
      { error: "Keep the Square-linked client and merge the manual one into it (otherwise the sync recreates the duplicate)." },
      { status: 400 },
    );
  }

  // Re-point everything that hangs off the duplicate.
  const repointed: Record<string, number> = {};
  for (const table of ["bookings", "consent_forms", "payments", "followups"] as const) {
    const { data, error } = await admin
      .from(table)
      .update({ client_id: keep.id })
      .eq("client_id", dupe.id)
      .eq("shop_id", shopId)
      .select("id");
    if (error) {
      return NextResponse.json({ error: `Could not re-point ${table}: ${error.message}` }, { status: 500 });
    }
    repointed[table] = data?.length ?? 0;
  }

  // Fill gaps on the keeper; widen the rollups.
  const minDate = (a: string | null, b2: string | null) => (!a ? b2 : !b2 ? a : a < b2 ? a : b2);
  const maxDate = (a: string | null, b2: string | null) => (!a ? b2 : !b2 ? a : a > b2 ? a : b2);
  const mergedNotes = [keep.notes, dupe.notes].filter((n) => (n ?? "").trim()).join("\n");
  const { error: upErr } = await admin
    .from("clients")
    .update({
      email: keep.email || dupe.email,
      phone: keep.phone || dupe.phone,
      instagram: keep.instagram || dupe.instagram,
      birthdate: keep.birthdate || dupe.birthdate,
      preferred_artist_id: keep.preferred_artist_id || dupe.preferred_artist_id,
      notes: mergedNotes,
      total_spent_cents: (keep.total_spent_cents ?? 0) + (dupe.total_spent_cents ?? 0),
      first_seen: minDate(keep.first_seen, dupe.first_seen),
      last_seen: maxDate(keep.last_seen, dupe.last_seen),
    })
    .eq("id", keep.id)
    .eq("shop_id", shopId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: delErr } = await admin.from("clients").delete().eq("id", dupe.id).eq("shop_id", shopId);
  if (delErr) {
    return NextResponse.json(
      { error: `Records were re-pointed but the duplicate couldn't be removed: ${delErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, keptId: keep.id, repointed });
}
