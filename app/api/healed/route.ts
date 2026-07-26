import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { signPhoto, publishHealedShot } from "@/lib/storage/photos";

export const dynamic = "force-dynamic";

// Healed-photo flow (healed-photos-schema.sql; private buckets 2026-07-26).
//   GET ?token=<followup-id>  — public: validate the link, return greeting context
//   POST { token, imageBase64 } — public: upload one healed shot (max 3/followup)
//   PATCH { id, action }      — staff (cookie or app Bearer): approve or dismiss
// The followup row's uuid IS the capability token: random, unguessable, and it
// only works for a healed_photo follow-up younger than the window below.
// The bucket is PRIVATE: rows store the storage path; staff reads get signed
// URLs; approving copies the file into the public bucket for the portfolio.

const MAX_BYTES = 4 * 1024 * 1024;
const WINDOW_DAYS = 60; // links go stale after this
const MAX_UPLOADS = 3;

const SNIFF: { ext: string; type: string; match: (b: Buffer) => boolean }[] = [
  { ext: "jpg", type: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 },
  {
    ext: "png",
    type: "image/png",
    match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: "webp",
    type: "image/webp",
    match: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadFollowup(token: string) {
  const admin = createAdminClient();
  if (!admin) return { admin: null, followup: null };
  // A malformed token (truncated SMS link) is an INVALID link, not a server
  // problem — admin stays set so callers answer 404, not 503.
  if (!UUID_RE.test(token)) return { admin, followup: null };
  const { data } = await admin
    .from("followups")
    .select("id, booking_id, client_id, kind, created_at, shop_id")
    .eq("id", token)
    .eq("kind", "healed_photo")
    .maybeSingle();
  if (!data) return { admin, followup: null };
  const ageDays = (Date.now() - new Date(data.created_at as string).getTime()) / 86_400_000;
  if (ageDays > WINDOW_DAYS) return { admin, followup: null };
  return { admin, followup: data };
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";

  // No token = the staff queue (pending photos for the Social page).
  if (!token) {
    const { supabase, user, role } = await staffGate();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (!role || !STAFF.includes(role as (typeof STAFF)[number])) {
      return NextResponse.json({ error: "Staff only" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("healed_photos")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (/relation .* does not exist|42P01/i.test(error.message)) {
        return NextResponse.json({ configured: false, photos: [] });
      }
      return NextResponse.json({ error: error.message, photos: [] }, { status: 500 });
    }
    // Private bucket: hand the queue signed URLs so consumers keep rendering .url.
    const admin = createAdminClient();
    const photos = admin
      ? await Promise.all(
          (data ?? []).map(async (p) => ({
            ...p,
            url: (await signPhoto(admin, "healed-photos", p.url as string)) ?? (p.url as string),
          })),
        )
      : (data ?? []);
    return NextResponse.json({ configured: true, photos });
  }

  const { admin, followup } = await loadFollowup(token);
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!followup) return NextResponse.json({ status: "invalid" }, { status: 404 });

  let clientFirstName: string | null = null;
  let artistName: string | null = null;
  let artistId: string | null = null;
  if (followup.client_id) {
    const { data: c } = await admin.from("clients").select("first_name").eq("id", followup.client_id).maybeSingle();
    clientFirstName = (c?.first_name as string) || null;
  }
  if (followup.booking_id) {
    const { data: bk } = await admin.from("bookings").select("artist_id").eq("id", followup.booking_id).maybeSingle();
    artistId = (bk?.artist_id as string) ?? null;
    if (artistId) {
      const { data: a } = await admin.from("artists").select("name").eq("id", artistId).maybeSingle();
      artistName = (a?.name as string) ?? null;
    }
  }
  const { count } = await admin
    .from("healed_photos")
    .select("id", { count: "exact", head: true })
    .eq("followup_id", followup.id);

  return NextResponse.json({
    status: "ready",
    context: { clientFirstName, artistName },
    uploaded: count ?? 0,
    max: MAX_UPLOADS,
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; imageBase64?: string };
  const { admin, followup } = await loadFollowup(b.token ?? "");
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!followup) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });
  if (!b.imageBase64) return NextResponse.json({ error: "Missing image" }, { status: 400 });

  const { count } = await admin
    .from("healed_photos")
    .select("id", { count: "exact", head: true })
    .eq("followup_id", followup.id);
  if ((count ?? 0) >= MAX_UPLOADS) {
    return NextResponse.json({ error: "You've already sent the maximum number of photos — thank you!" }, { status: 429 });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
  } catch {
    return NextResponse.json({ error: "Bad image data" }, { status: 400 });
  }
  if (buf.length < 100) return NextResponse.json({ error: "That image looks empty." }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  const kind = SNIFF.find((s) => s.match(buf));
  if (!kind) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images work here." }, { status: 415 });

  const path = `${followup.id}/${randomBytes(10).toString("base64url")}.${kind.ext}`;
  const { error: upErr } = await admin.storage.from("healed-photos").upload(path, buf, {
    contentType: kind.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) {
    if (/bucket.*not found/i.test(upErr.message)) {
      return NextResponse.json({ error: "Uploads aren't open yet — reply to the message with your photo instead." }, { status: 503 });
    }
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 500 });
  }
  let artistId: string | null = null;
  if (followup.booking_id) {
    const { data: bk } = await admin.from("bookings").select("artist_id").eq("id", followup.booking_id).maybeSingle();
    artistId = (bk?.artist_id as string) ?? null;
  }
  const { error } = await admin.from("healed_photos").insert({
    shop_id: followup.shop_id, // photo inherits the followup's shop; the service-role insert skips the DB default
    followup_id: followup.id,
    booking_id: followup.booking_id,
    client_id: followup.client_id,
    artist_id: artistId,
    // The bucket is private: store the PATH; readers sign it on demand.
    url: path,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Staff: list the queue / approve / dismiss.
const STAFF = ["owner"] as const;
async function staffGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("email", user.email!).maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

// Cookie (web) OR Bearer (app) — the app's Social screen approves through here
// too, so the portfolio append + public copy happen no matter where the call
// is made from.
export async function PATCH(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!STAFF.includes(ctx.role as (typeof STAFF)[number])) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: "approve" | "dismiss" };
  if (!b.id || !b.action) return NextResponse.json({ error: "Missing id/action" }, { status: 400 });

  // Service-role read, pinned to the caller's shop (Bearer callers bypass RLS).
  const { data: photo } = await admin
    .from("healed_photos")
    .select("*")
    .eq("id", b.id)
    .eq("shop_id", ctx.shopId)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (photo.status !== "pending") return NextResponse.json({ error: `Already ${photo.status}.` }, { status: 409 });

  if (b.action === "approve" && photo.artist_id) {
    // The portfolio is public, the bucket is private — copy the file into the
    // public bucket and publish THAT url. If the copy fails, refuse the
    // approve rather than push a broken image onto the artist's page.
    const publicUrl = await publishHealedShot(admin, photo.id as string, photo.url as string);
    if (!publicUrl) {
      return NextResponse.json({ error: "Could not publish the photo — try again." }, { status: 502 });
    }
    const { data: room } = await admin
      .from("room_content")
      .select("portfolio")
      .eq("artist_id", photo.artist_id)
      .maybeSingle();
    const portfolio = Array.isArray(room?.portfolio) ? room.portfolio : [];
    portfolio.push({
      id: `healed-${(photo.id as string).slice(0, 8)}`,
      src: publicUrl,
      alt: "Healed client tattoo",
    });
    await admin.from("room_content").update({ portfolio }).eq("artist_id", photo.artist_id);
  }

  const { data, error } = await admin
    .from("healed_photos")
    .update({ status: b.action === "approve" ? "approved" : "dismissed" })
    .eq("id", b.id)
    .eq("shop_id", ctx.shopId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photo: data });
}

