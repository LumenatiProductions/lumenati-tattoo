import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// "Add your shop" (the SaaS front door, invite-gated).
// Body: { code, shopName, tagline?, accent?, ownerEmail, ownerName?, artists: string[] }
//
// Provisions the whole tenant in one shot: shop row (template 'standard' —
// the clean skin; Y2K stays Lumenati's), artist rows + empty room_content
// (slugs namespaced "<shop>--<artist>" because artists.slug is globally
// unique), and the owner: auth invite email + profiles row pinned to the new
// shop_id.
//
// GATED by SHOP_WIZARD_CODE on purpose: shop_id tags every table but RLS is
// not yet shop-scoped, so a second shop's ADMIN would still see Lumenati data.
// The public pages are safe (they read by shop); the admin isolation work is
// the launch blocker, tracked in STARTER-NEXT. Until it lands, Scott hands
// the code only to shops he's co-building with.

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const PALETTE = ["#ff1493", "#22d3ee", "#34d399", "#f59e0b", "#a78bfa", "#f43f5e"];

// Slugs that collide with top-level routes (every public directory under app/)
// or are otherwise confusing to hand out as a shop address.
const RESERVED_SLUGS = [
  "start",
  "s",
  "admin",
  "api",
  "auth",
  "care",
  "claim",
  "healed",
  "intake",
  "kiosk",
  "login",
  "pay",
  "request",
];

export async function POST(req: Request) {
  const gate = process.env.SHOP_WIZARD_CODE;
  const b = (await req.json().catch(() => ({}))) as {
    code?: string;
    shopName?: string;
    tagline?: string;
    accent?: string;
    ownerEmail?: string;
    ownerName?: string;
    artists?: string[];
  };
  if (!gate || b.code !== gate) {
    return NextResponse.json({ error: "Signups are invite-only right now — ask us for a code." }, { status: 403 });
  }

  const shopName = (b.shopName ?? "").trim();
  const ownerEmail = (b.ownerEmail ?? "").trim().toLowerCase();
  const artistNames = (b.artists ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 12);
  if (shopName.length < 2) return NextResponse.json({ error: "The shop needs a name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: "A real owner email is required — the sign-in invite goes there." }, { status: 400 });
  }
  if (artistNames.length === 0) return NextResponse.json({ error: "Add at least one artist." }, { status: 400 });
  const accent = /^#[0-9a-f]{6}$/i.test(b.accent ?? "") ? b.accent! : "#ff1493";

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const slug = slugify(shopName);
  if (!slug || RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: "That name doesn't make a usable web address." }, { status: 400 });
  const { data: taken } = await admin.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (taken) return NextResponse.json({ error: `"${slug}" is taken — tweak the shop name.` }, { status: 409 });
  const { data: profTaken } = await admin.from("profiles").select("email").eq("email", ownerEmail).maybeSingle();
  if (profTaken) return NextResponse.json({ error: "That email already has a login here." }, { status: 409 });

  const shopId = randomUUID();
  const { error: shopErr } = await admin.from("shops").insert({
    id: shopId,
    slug,
    name: shopName,
    template: "standard",
    accent,
    tagline: (b.tagline ?? "").trim(),
  });
  if (shopErr) return NextResponse.json({ error: shopErr.message }, { status: 500 });

  // Artists + their (empty, standard-template-ready) room content.
  for (let i = 0; i < artistNames.length; i++) {
    const name = artistNames[i];
    const aSlug = `${slug}--${slugify(name) || `artist-${i + 1}`}`;
    const { error } = await admin.from("artists").insert({
      id: aSlug,
      slug: aSlug,
      name,
      handle: "",
      color: PALETTE[i % PALETTE.length],
      active: true,
      sort: i,
      shop_id: shopId,
    });
    if (!error) await admin.from("room_content").insert({ artist_id: aSlug, accent_color: PALETTE[i % PALETTE.length], shop_id: shopId });
  }

  // The owner's role row FIRST — it's what makes their login work. The invite
  // email is best-effort on top: if it bounces, signing in at /admin/login
  // with this email still works (the email-code flow creates the auth user),
  // so a bad mailbox never strands a half-created shop.
  await admin.from("profiles").insert({
    email: ownerEmail,
    role: "owner",
    full_name: (b.ownerName ?? "").trim() || null,
    shop_id: shopId,
  });
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");
  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo: `${base}/admin`,
  });
  const invited = !invErr || /already/i.test(invErr.message);

  return NextResponse.json({
    ok: true,
    slug,
    url: `${base}/s/${slug}`,
    invited,
  });
}
