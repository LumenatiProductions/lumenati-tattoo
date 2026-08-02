import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Front-of-house runs the CRM. (Artists get scoped read once `bookings` exists.)
const STAFF = ["owner"] as const;

// Resolve the signed-in user's role, or null. Shared by every handler (mirrors
// the social route's `curator()`).
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

// List / search clients. Optional ?q= matches name / email / phone.
// RLS also enforces the staff gate; we check here for a clean 401/403.
export async function GET(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  // PostgREST clamps every response at 1000 rows — the roster is near that
  // already (895), so page through or the list silently loses the tail.
  type ClientRow = { id: string; total_spent_cents: number | null } & Record<string, unknown>;
  const data: ClientRow[] = [];
  let error: { message: string } | null = null;
  for (let start = 0; start < 20000; start += 1000) {
    let query = supabase.from("clients").select("*");
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like},instagram.ilike.${like}`,
      );
    }
    // Most-recently-seen first; never-seen (manual walk-ins) fall to the bottom.
    const page = await query
      .order("last_seen", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(start, start + 999);
    if (page.error) {
      error = page.error;
      break;
    }
    data.push(...((page.data ?? []) as ClientRow[]));
    if (!page.data || page.data.length < 1000) break;
  }
  if (error) return NextResponse.json({ error: error.message, clients: [] }, { status: 500 });

  // Lifetime value = the Square historical baseline (total_spent_cents) PLUS any
  // ledger-attributed spend (new cash/Stripe money tied to this client). The two
  // don't overlap (baseline is pre-cutover, ledger client rows are new), so it's
  // additive and stays right as Square goes away. Sources remain unblended in the
  // ledger; this is only the per-client rollup.
  const clients = data;
  // Same 1000-row clamp applies here, and this SUM feeds lifetime value.
  // A refunded sale must not count: the original row still has reverses=null
  // (the REVERSING row carries the pointer, under kind 'refund'), so collect
  // the reversed ids first and skip those originals — same rule as the P&L.
  const reversedIds = new Set<string>();
  for (let start = 0; start < 50000; start += 1000) {
    const { data: rev } = await supabase
      .from("ledger")
      .select("reverses")
      .not("reverses", "is", null)
      .order("id", { ascending: true })
      .range(start, start + 999);
    for (const r of (rev ?? []) as { reverses: string | null }[]) {
      if (r.reverses) reversedIds.add(r.reverses);
    }
    if (!rev || rev.length < 1000) break;
  }
  const byClient = new Map<string, number>();
  for (let start = 0; start < 50000; start += 1000) {
    const { data: led } = await supabase
      .from("ledger")
      .select("id, client_id, amount_cents")
      .not("client_id", "is", null)
      .in("kind", ["sale", "tip"])
      .eq("direction", "in")
      .is("reverses", null)
      .order("id", { ascending: true })
      .range(start, start + 999);
    for (const r of (led ?? []) as { id: string; client_id: string | null; amount_cents: number }[]) {
      if (reversedIds.has(r.id)) continue;
      if (r.client_id) byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + (r.amount_cents ?? 0));
    }
    if (!led || led.length < 1000) break;
  }
  const enriched = clients.map((c) => ({
    ...c,
    lifetime_cents: (c.total_spent_cents ?? 0) + (byClient.get(c.id) ?? 0),
  }));
  return NextResponse.json({ clients: enriched });
}

// Add a walk-in by hand. Admins.
// Body: { firstName, lastName?, email?, phone?, instagram?, birthdate?, notes?, preferredArtistId? }
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    birthdate?: string;
    notes?: string;
    preferredArtistId?: string | null;
  };
  if (!b.firstName?.trim() && !b.lastName?.trim()) {
    return NextResponse.json({ error: "A first or last name is required." }, { status: 400 });
  }

  const row = {
    id: `walkin-${randomUUID()}`,
    square_customer_id: null,
    first_name: (b.firstName ?? "").trim(),
    last_name: (b.lastName ?? "").trim(),
    email: b.email?.trim() || null,
    phone: b.phone?.trim() || null,
    instagram: b.instagram?.trim().replace(/^@/, "") || null,
    birthdate: b.birthdate || null,
    notes: (b.notes ?? "").trim(),
    preferred_artist_id: b.preferredArtistId || null,
    source: "manual",
    first_seen: new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await supabase.from("clients").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

// Edit an existing client. Admins.
// Body: { id, ...any of firstName,lastName,email,phone,instagram,birthdate,notes,preferredArtistId }
export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    birthdate?: string | null;
    notes?: string;
    preferredArtistId?: string | null;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.firstName !== undefined) patch.first_name = b.firstName.trim();
  if (b.lastName !== undefined) patch.last_name = b.lastName.trim();
  if (b.email !== undefined) patch.email = b.email.trim() || null;
  if (b.phone !== undefined) patch.phone = b.phone.trim() || null;
  if (b.instagram !== undefined) patch.instagram = b.instagram.trim().replace(/^@/, "") || null;
  if (b.birthdate !== undefined) patch.birthdate = b.birthdate || null;
  if (b.notes !== undefined) patch.notes = b.notes.trim();
  if (b.preferredArtistId !== undefined) patch.preferred_artist_id = b.preferredArtistId || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", b.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
