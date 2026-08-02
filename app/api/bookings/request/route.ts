import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { isSmsConfigured, looksLikePhone, normalizePhone, sendSms } from "@/lib/sms";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";
import { pushEvent } from "@/lib/push/send";
import { renderY2kEmail } from "@/lib/email/y2k";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { signPhoto } from "@/lib/storage/photos";

export const dynamic = "force-dynamic";

// Public booking requests (booking-requests-schema.sql).
//   POST  — public: the /request form submits here (service-role write; no
//           session). Honeypot + length limits + a per-contact hourly cap keep
//           drive-by spam out without a captcha.
//   GET   — admin: the full inbox. Artists: their own requests + the
//           up-for-grabs pool (unclaimed, pending).
//   PATCH — decline or accept (find-or-create the client, create the booking
//           with source=web_request, stamp the request). Admin works any
//           request; an artist works only requests already grabbed by or
//           aimed at them (grabbing itself happens straight on the table —
//           first tap wins).
const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: real people never fill the hidden "website" field.
  if (clip(b.website, 10)) return NextResponse.json({ ok: true });

  const name = clip(b.name, 120);
  const email = clip(b.email, 200).toLowerCase();
  const phoneRaw = clip(b.phone, 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const idea = clip(b.idea, 2000);
  if (!name) return NextResponse.json({ error: "Tell us your name." }, { status: 400 });
  if (!idea) return NextResponse.json({ error: "Tell us about the tattoo you want." }, { status: 400 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk && !phone) {
    return NextResponse.json({ error: "Leave an email or a mobile number so we can reach you." }, { status: 400 });
  }
  if (phoneRaw && !phone && !emailOk) {
    return NextResponse.json({ error: "That mobile number doesn't look right." }, { status: 400 });
  }

  // Which shop is this request for? The root /request form sends no slug and
  // means Lumenati; the standard shop template sends its slug. Service-role
  // writes bypass RLS, so the shop_id must be explicit — never the DB default.
  let shopId = LUMENATI_SHOP_ID;
  const shopSlug = clip(b.shopSlug, 80);
  if (shopSlug) {
    const { data: shop } = await admin.from("shops").select("id").eq("slug", shopSlug).maybeSingle();
    if (!shop) return NextResponse.json({ error: "Unknown shop." }, { status: 400 });
    shopId = shop.id as string;
  }

  // Per-contact cap: max 3 requests an hour. (DB-backed, so it works serverless.)
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  let recent = admin
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .gte("created_at", hourAgo);
  recent = emailOk ? recent.eq("email", email) : recent.eq("phone", phone!);
  const { count, error: countErr } = await recent;
  if (countErr && isMissingTable(countErr.message)) {
    return NextResponse.json({ error: "Booking requests aren't open yet. Call or email the shop." }, { status: 503 });
  }
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "We already have your request — the shop will get back to you soon." }, { status: 429 });
  }

  // Validate the artist id against the real roster (don't trust the form).
  let artistId: string | null = null;
  let booksClosed = false;
  const requested = clip(b.artistId, 60);
  if (requested) {
    const { data: a } = await admin
      .from("artists")
      .select("id, books_closed")
      .eq("id", requested)
      .eq("shop_id", shopId)
      .eq("active", true)
      .maybeSingle();
    artistId = a?.id ?? null;
    booksClosed = !!a?.books_closed;
  }

  // Reference images: only paths shaped exactly like our own upload route
  // mints them (request-refs is a PRIVATE bucket; rows store paths and staff
  // views sign them on read). A stale cached form may still send the old full
  // public URL — strip it down to the path. Anything else is dropped, max 3.
  const legacyPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/request-refs/`;
  const REF_PATH_RE = /^\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{8,}\.(jpg|png|webp)$/;
  const referenceUrls = (Array.isArray(b.referenceUrls) ? b.referenceUrls : [])
    .map((u) =>
      typeof u === "string" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && u.startsWith(legacyPrefix)
        ? u.slice(legacyPrefix.length)
        : u,
    )
    .filter((u): u is string => typeof u === "string" && REF_PATH_RE.test(u))
    .slice(0, 3);

  // Closed books: the ask lands on that artist's waitlist instead of the
  // request inbox — first in line when the books reopen (Scott, 2026-07-12).
  if (artistId && booksClosed) {
    const { error: wErr } = await admin.from("waitlist").insert({
      id: `wl-${randomUUID()}`,
      shop_id: shopId,
      artist_id: artistId,
      name,
      phone: phone || (emailOk ? email : null),
      want: [idea, clip(b.placement, 200), clip(b.availability, 300)].filter(Boolean).join(" · ").slice(0, 500),
      active: true,
    });
    if (wErr) {
      return NextResponse.json({ error: "Could not save your spot. Try again." }, { status: 500 });
    }
    await pushEvent(
      admin,
      { roles: ["owner"], artistId, shopId },
      "Waitlist join",
      `${name} wants in when your books open: ${idea.slice(0, 80)}`,
    );
    return NextResponse.json({ ok: true, waitlisted: true });
  }

  const requestRow = {
    shop_id: shopId,
    name,
    email: emailOk ? email : null,
    phone,
    artist_id: artistId,
    idea,
    placement: clip(b.placement, 200),
    size: clip(b.size, 100),
    availability: clip(b.availability, 300),
    ...(referenceUrls.length ? { reference_urls: referenceUrls } : {}),
  };
  // Consent from the form's optional news checkbox; retried without the
  // column so the form keeps working before the migration lands.
  let { error } = await admin
    .from("booking_requests")
    .insert({ ...requestRow, marketing_ok: b.marketingOk === true });
  if (error && /marketing_ok/.test(error.message)) {
    ({ error } = await admin.from("booking_requests").insert(requestRow));
  }
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Booking requests aren't open yet. Call or email the shop." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save your request. Try again." }, { status: 500 });
  }

  // Ping people — best-effort, never blocks. A no-preference request is up
  // for grabs, so every artist's phone buzzes; first grab wins.
  await pushEvent(
    admin,
    artistId ? { roles: ["owner"], artistId, shopId } : { roles: ["owner", "artist"], shopId },
    artistId ? "New booking request" : "Up for grabs",
    `${name}: ${idea.slice(0, 90)}`,
  );

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let q = ctx.db
    .from("booking_requests")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (ctx.role !== "owner") {
    if (!ctx.artistId) return NextResponse.json({ configured: true, requests: [] });
    // Mirror the RLS shape: theirs, or unclaimed pool.
    q = q.or(`artist_id.eq.${ctx.artistId},and(artist_id.is.null,status.eq.pending)`);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ configured: false, requests: [] });
    return NextResponse.json({ error: error.message, requests: [] }, { status: 500 });
  }
  // request-refs is a private bucket: rows hold paths, the inbox gets 15-min
  // signed URLs. Signing needs the service role; without it, thumbnails just
  // don't render (the request text still does).
  const admin = createAdminClient();
  const requests = admin
    ? await Promise.all(
        (data ?? []).map(async (r) => {
          if (!Array.isArray(r.reference_urls) || r.reference_urls.length === 0) return r;
          const signed = await Promise.all(
            (r.reference_urls as string[]).map((v) => signPhoto(admin, "request-refs", v)),
          );
          return { ...r, reference_urls: signed.filter(Boolean) };
        }),
      )
    : (data ?? []);
  return NextResponse.json({ configured: true, requests });
}

export async function PATCH(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { shopId } = ctx;

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "accept" | "decline";
    startsAt?: string;
    endsAt?: string;
    artistId?: string | null;
    depositCents?: number;
    estPriceCents?: number;
  };
  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: reqRow } = await admin.from("booking_requests").select("*").eq("id", b.id).maybeSingle();
  if (!reqRow || reqRow.shop_id !== shopId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  // Artists work only what's theirs — grabbed from the pool or aimed at them.
  if (ctx.role !== "owner" && (!ctx.artistId || reqRow.artist_id !== ctx.artistId)) {
    return NextResponse.json({ error: "Grab it first — this one isn't yours." }, { status: 403 });
  }
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: `Already ${reqRow.status}.` }, { status: 409 });
  }
  // An artist books themselves; only the admin can hand it elsewhere.
  if (ctx.role !== "owner") b.artistId = ctx.artistId;

  const stamp = { handled_by: ctx.email ?? null, handled_at: new Date().toISOString() };

  if (b.action === "decline") {
    const { data, error } = await admin
      .from("booking_requests")
      .update({ status: "declined", ...stamp })
      .eq("id", b.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  }

  if (b.action === "accept") {
    if (!b.startsAt) return NextResponse.json({ error: "Pick a date and time first." }, { status: 400 });

    // Find-or-create the client: match email first, then phone.
    let clientId: string | null = null;
    if (reqRow.email) {
      const { data: c } = await admin.from("clients").select("id").eq("email", reqRow.email).eq("shop_id", shopId).maybeSingle();
      clientId = c?.id ?? null;
    }
    if (!clientId && reqRow.phone) {
      const { data: c } = await admin.from("clients").select("id").eq("phone", reqRow.phone).eq("shop_id", shopId).maybeSingle();
      clientId = c?.id ?? null;
    }
    if (!clientId) {
      const [first, ...rest] = (reqRow.name as string).split(/\s+/);
      const { data: c, error: cErr } = await admin
        .from("clients")
        .insert({
          id: `cl-${randomUUID()}`,
          shop_id: shopId,
          first_name: first || reqRow.name,
          last_name: rest.join(" "),
          email: reqRow.email,
          phone: reqRow.phone,
          source: "manual",
          notes: "From a website booking request.",
        })
        .select("id")
        .single();
      if (cErr) return NextResponse.json({ error: `Could not create the client: ${cErr.message}` }, { status: 500 });
      clientId = c.id;
    }

    // The form's news checkbox rides the request; grant it on the client the
    // moment one exists. Consent only ever turns ON here - never off - and
    // both writes are best-effort until the migration lands.
    if (reqRow.marketing_ok === true && clientId) {
      await admin
        .from("clients")
        .update({ marketing_ok: true, marketing_ok_at: new Date().toISOString() })
        .eq("id", clientId)
        .eq("shop_id", shopId)
        .eq("marketing_ok", false);
    }

    const deposit = Math.max(0, Math.round(b.depositCents ?? 0));
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .insert({
        id: `bk-${randomUUID()}`,
        shop_id: shopId,
        client_id: clientId,
        artist_id: b.artistId ?? reqRow.artist_id ?? null,
        starts_at: b.startsAt,
        ends_at: b.endsAt || null,
        status: "scheduled",
        service_desc: (reqRow.idea as string).slice(0, 200),
        est_price_cents: Math.max(0, Math.round(b.estPriceCents ?? 0)),
        deposit_cents: deposit,
        deposit_status: "none", // held only once they actually pay the link
        notes: [
          reqRow.placement && `Placement: ${reqRow.placement}`,
          reqRow.size && `Size: ${reqRow.size}`,
          reqRow.availability && `Availability: ${reqRow.availability}`,
          ...(Array.isArray(reqRow.reference_urls) && reqRow.reference_urls.length
            ? [`References:`, ...(reqRow.reference_urls as string[])]
            : []),
        ]
          .filter(Boolean)
          .join("\n"),
        source: "web_request",
      })
      .select()
      .single();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const { data, error } = await admin
      .from("booking_requests")
      .update({ status: "accepted", booking_id: booking.id, ...stamp })
      .eq("id", b.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Deposit requested + Stripe on => mint the pay link and send it in the
    // same breath (text first, email fallback). Best-effort: a send failure
    // still returns the URL so the desk can pass it along by hand.
    let depositLink: { url: string; sent: boolean; via?: string; reason?: string } | null = null;
    if (deposit >= 50 && isStripeConfigured) {
      {
        const link = await createPaymentLink(admin, {
          bookingId: booking.id,
          clientId,
          artistId: booking.artist_id ?? null,
          kind: "deposit",
          amountCents: deposit,
          shopId,
        });
        if (link.ok) {
          depositLink = { url: link.url, sent: false };
          const when = new Date(b.startsAt).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: process.env.SHOP_TIMEZONE || "America/Denver",
          });
          const usd = (deposit / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
          const text = `Lumenati Tattoo: you're booked for ${when}. Lock it in with your ${usd} deposit: ${link.url}`;
          if (reqRow.phone && isSmsConfigured) {
            const sms = await sendSms(reqRow.phone as string, text);
            if (sms.ok) depositLink = { url: link.url, sent: true, via: "sms" };
            else depositLink.reason = sms.error;
          }
          if (!depositLink.sent && reqRow.email && process.env.RESEND_API_KEY) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "Lumenati Tattoo <onboarding@resend.dev>",
                to: [reqRow.email],
                subject: `You're booked — secure your spot with the deposit`,
                html: renderY2kEmail({
                  windowTitle: "youre_in.exe",
                  headline: `You're booked for ${when}.`,
                  paragraphs: [
                    `Lock it in by paying your ${usd} deposit. Your spot is held once it lands.`,
                    "Deposits come off your final price. Heads up: no-shows forfeit the deposit.",
                  ],
                  button: { label: "Pay deposit", url: link.url },
                  finePrint: link.url,
                }),
              }),
            });
            if (res.ok) depositLink = { url: link.url, sent: true, via: "email" };
            else depositLink.reason = depositLink.reason ?? `Email failed (${res.status})`;
          }
          if (!depositLink.sent && !depositLink.reason) {
            depositLink.reason = "No reachable contact / sending not configured";
          }
        }
      }
    }

    return NextResponse.json({ request: data, booking, depositLink });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
