import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretMatches } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// "Add your shop" (the SaaS front door, invite-gated).
// Body: { code, shopName, tagline?, accent?, template?, logo?, ownerEmail,
//         ownerName?, ownerPhone?, artists: string[] }
//
// Provisions the whole tenant in one shot: shop row (any of the three public
// skins; Y2K stays Lumenati's), the shop logo (data URL, uploaded here with
// the service role because the wizard user is anonymous), artist rows + empty
// room_content (slugs namespaced "<shop>--<artist>" because artists.slug is
// globally unique), and the owner: auth invite email + profiles row pinned to
// the new shop_id. An owner phone makes day-one sign-in a text code — the
// auth user gets it attached confirmed, same pattern as /api/staff.
//
// GATED by SHOP_WIZARD_CODE on purpose. Shop isolation is now enforced
// (shop-scoped RLS + service-role route scoping, 2026-07-07), so a second
// shop's admin sees only their own data. The code stays invite-only while
// Scott co-builds with the first outside shops.

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const PALETTE = ["#ff1493", "#22d3ee", "#34d399", "#f59e0b", "#a78bfa", "#f43f5e"];

// The skins a shop can pick at signup (y2k is Lumenati's alone).
const PICKABLE_TEMPLATES = ["standard", "dark", "flash"];

// "(209) 555-0144" / "+1 209 555 0144" -> "+12095550144" (same as /api/staff).
function e164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Data-URL logo -> bytes + content type. Caps at 3MB decoded.
function parseLogo(dataUrl: string): { bytes: Buffer; contentType: string; ext: string } | null {
  const m = /^data:(image\/(png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024) return null;
  const ext = m[2] === "svg+xml" ? "svg" : m[2] === "jpeg" || m[2] === "jpg" ? "jpg" : m[2];
  return { bytes, contentType: m[1], ext };
}

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
  "shops",
];

// Best-effort brute-force brake on the invite code (per serverless instance;
// real rate limiting lives at the platform edge, this just blunts tight loops).
let wrongCodeCount = 0;
let wrongCodeWindowStart = 0;

export async function POST(req: Request) {
  const gate = process.env.SHOP_WIZARD_CODE;
  const b = (await req.json().catch(() => ({}))) as {
    code?: string;
    shopName?: string;
    tagline?: string;
    accent?: string;
    template?: string;
    logo?: string;
    ownerEmail?: string;
    ownerName?: string;
    ownerPhone?: string;
    artists?: string[];
  };
  const now = Date.now();
  if (now - wrongCodeWindowStart > 60_000) {
    wrongCodeWindowStart = now;
    wrongCodeCount = 0;
  }
  if (wrongCodeCount >= 10) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }
  if (!gate || !secretMatches(b.code, gate)) {
    wrongCodeCount++;
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
  const template = PICKABLE_TEMPLATES.includes(b.template ?? "") ? b.template! : "standard";
  const ownerPhone = (b.ownerPhone ?? "").trim() ? e164(b.ownerPhone!.trim()) : null;
  if ((b.ownerPhone ?? "").trim() && !ownerPhone) {
    return NextResponse.json({ error: "That phone number doesn't look right — use 10 digits." }, { status: 400 });
  }
  const logo = (b.logo ?? "").trim() ? parseLogo(b.logo!.trim()) : null;
  if ((b.logo ?? "").trim() && !logo) {
    return NextResponse.json({ error: "That logo didn't come through — use a PNG, JPG, WEBP, or SVG under 3MB." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const slug = slugify(shopName);
  if (!slug || RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: "That name doesn't make a usable web address." }, { status: 400 });
  const { data: taken } = await admin.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (taken) return NextResponse.json({ error: `"${slug}" is taken — tweak the shop name.` }, { status: 409 });
  const { data: profTaken } = await admin.from("profiles").select("email").eq("email", ownerEmail).maybeSingle();
  if (profTaken) return NextResponse.json({ error: "That email already has a login here." }, { status: 409 });

  const shopId = randomUUID();
  const shopRow = {
    id: shopId,
    slug,
    name: shopName,
    template,
    accent,
    tagline: (b.tagline ?? "").trim(),
    // Every new shop opens with a free month on the clock — no card at signup.
    // /admin/billing takes it from here; the admin locks when this runs out.
    billing_status: "trial",
    billing_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
  let { error: shopErr } = await admin.from("shops").insert(shopRow);
  if (shopErr && template !== "standard" && /check|constraint/i.test(shopErr.message)) {
    // The template-picker SQL (widens the check to dark/flash) is still
    // queued — fall back to standard so signup never dies on a skin choice.
    console.warn(`shops.template check rejected '${template}' — queued SQL not applied yet; falling back to standard`);
    ({ error: shopErr } = await admin.from("shops").insert({ ...shopRow, template: "standard" }));
  }
  if (shopErr) return NextResponse.json({ error: shopErr.message }, { status: 500 });

  // The logo rides the same public bucket as the app's logo card; the wizard
  // user is anonymous, so the upload happens here with the service role.
  if (logo) {
    const path = `shop-logo/${shopId}-${Date.now()}.${logo.ext}`;
    const { error: upErr } = await admin.storage
      .from("room-photos")
      .upload(path, logo.bytes, { contentType: logo.contentType, upsert: false });
    if (!upErr) {
      const { data } = admin.storage.from("room-photos").getPublicUrl(path);
      await admin.from("shops").update({ logo_url: data.publicUrl }).eq("id", shopId);
    }
  }

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
    phone: ownerPhone,
    role: "owner",
    full_name: (b.ownerName ?? "").trim() || null,
    shop_id: shopId,
  });
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");
  const { data: invData, error: invErr } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo: `${base}/admin`,
  });
  const invited = !invErr || /already/i.test(invErr.message);
  // A phone makes day-one sign-in a text code: attach it to the auth user
  // confirmed (same as /api/staff). If the invite bounced entirely, create
  // the user confirmed with both identifiers so the text code still works.
  if (ownerPhone) {
    if (invData?.user) {
      await admin.auth.admin.updateUserById(invData.user.id, { phone: ownerPhone, phone_confirm: true });
    } else if (invErr && !/already/i.test(invErr.message)) {
      await admin.auth.admin.createUser({
        email: ownerEmail,
        email_confirm: true,
        phone: ownerPhone,
        phone_confirm: true,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    slug,
    url: `${base}/s/${slug}`,
    invited,
  });
}
