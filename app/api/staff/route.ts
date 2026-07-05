import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Team management, the new process: ADMINS and ARTISTS, phone-first logins.
// Adding someone pre-creates their auth user with BOTH email and phone
// (confirmed), so a text-code sign-in lands on the same account as an email
// code and every email-keyed permission check keeps working. Admin only.
//
// Internally the admin role is stored as 'owner' (every policy/gate already
// speaks that dialect); the UI says "Admin".

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { user, role: profile?.role ?? null };
}

// "(209) 555-0144" / "209.555.0144" / "+1 209 555 0144" -> "+12095550144".
function e164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Small team: paging through auth users to find one by email/phone is fine.
async function findAuthUser(admin: NonNullable<ReturnType<typeof createAdminClient>>, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data.users.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 100) return null;
  }
  return null;
}

export async function POST(req: Request) {
  const { user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    email?: string;
    phone?: string;
    name?: string;
    role?: string;
    artistId?: string | null;
  };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A real email is required (it anchors the account)." }, { status: 400 });
  }
  const newRole = b.role === "artist" ? "artist" : "owner"; // 'admin' and anything else -> owner
  const phone = (b.phone ?? "").trim() ? e164(b.phone!.trim()) : null;
  if ((b.phone ?? "").trim() && !phone) {
    return NextResponse.json({ error: "That phone number doesn't look right — use 10 digits." }, { status: 400 });
  }
  const artistId = newRole === "artist" ? b.artistId || null : null;
  if (newRole === "artist" && !artistId) {
    return NextResponse.json({ error: "Pick which artist this login belongs to." }, { status: 400 });
  }

  // Auth user: create confirmed with both identifiers, or attach the phone to
  // the existing one. Confirmed = they can sign in immediately, no invite email.
  const existing = await findAuthUser(admin, email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      ...(phone ? { phone, phone_confirm: true } : {}),
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: `Could not update their login: ${error.message}` }, { status: 500 });
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(phone ? { phone, phone_confirm: true } : {}),
    });
    if (error) return NextResponse.json({ error: `Could not create their login: ${error.message}` }, { status: 500 });
  }

  const { error: profErr } = await admin.from("profiles").upsert(
    {
      email,
      phone,
      full_name: (b.name ?? "").trim() || null,
      role: newRole,
      artist_id: artistId,
    },
    { onConflict: "email" },
  );
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  if (email === (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "You can't remove yourself — have another admin do it." }, { status: 400 });
  }

  const { error } = await admin.from("profiles").delete().eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Kill the login too, so access ends now, not at next gate check.
  const authUser = await findAuthUser(admin, email);
  if (authUser) await admin.auth.admin.deleteUser(authUser.id);

  return NextResponse.json({ ok: true });
}
