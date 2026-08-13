import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Owner adds a teammate. The app signs in phone-first with shouldCreateUser:false,
// so an added person could never sign in by phone — the staff screen only wrote
// a profiles row, never provisioned an auth user or a phone (lum-025). This
// route (owner-only, service role) provisions or reuses the auth user with BOTH
// email and phone so either sign-in works, then upserts the allowlist row scoped
// to the owner's shop.

// (500) 555-0100 -> +15005550100. Accepts already-E.164 input too.
function e164(raw: string): string | null {
  const trimmed = raw.replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) return /^\+\d{8,15}$/.test(trimmed) ? trimmed : null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    email?: string;
    phone?: string;
    fullName?: string;
    role?: string;
    artistId?: string | null;
  };

  const email = (b.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return NextResponse.json({ error: "A sign-in email is required" }, { status: 400 });
  const phone = b.phone?.trim() ? e164(b.phone) : null;
  if (b.phone?.trim() && !phone) {
    return NextResponse.json({ error: "That phone number doesn't look right" }, { status: 400 });
  }
  const role = b.role === "owner" ? "owner" : "artist";
  const artistId = role === "artist" ? b.artistId || null : null;

  // Provision the auth user with both identities. createUser errors if either
  // identity is already registered — treat that as "already provisioned" and,
  // when we have a phone, make sure it's attached to the existing user so phone
  // OTP works.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(phone ? { phone, phone_confirm: true } : {}),
  });
  if (cErr && !/already|registered|exists/i.test(cErr.message)) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!created?.user && phone) {
    // Existing user (by email). Attach the phone if it isn't already theirs.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
    const bareTarget = phone.replace(/\D/g, "");
    if (existing && (existing.phone ?? "").replace(/\D/g, "") !== bareTarget) {
      // Best-effort: if the phone belongs to someone else this fails; the
      // allowlist row below is still the source of truth for team membership.
      await admin.auth.admin.updateUserById(existing.id, { phone, phone_confirm: true });
    }
  }

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      email,
      phone,
      full_name: b.fullName?.trim() || null,
      role,
      artist_id: artistId,
      shop_id: ctx.shopId,
    },
    { onConflict: "email" },
  );
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
