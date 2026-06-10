import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSmsConfigured, looksLikePhone, normalizePhone, sendSms } from "@/lib/sms";
import { createPaymentLink } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";
import { pushEvent } from "@/lib/push/send";
import { renderY2kEmail } from "@/lib/email/y2k";

export const dynamic = "force-dynamic";

// Public booking requests (booking-requests-schema.sql).
//   POST  — public: the /request form submits here (service-role write; no
//           session). Honeypot + length limits + a per-contact hourly cap keep
//           drive-by spam out without a captcha.
//   GET   — staff: list requests for the Bookings page inbox.
//   PATCH — staff: decline, or accept (find-or-create the client, create the
//           booking with source=web_request, stamp the request).

const STAFF = ["owner", "bookkeeper", "frontdesk"] as const;

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
const isStaff = (r: string | null) => !!r && STAFF.includes(r as (typeof STAFF)[number]);
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

  // Per-contact cap: max 3 requests an hour. (DB-backed, so it works serverless.)
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  let recent = admin
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hourAgo);
  recent = emailOk ? recent.eq("email", email) : recent.eq("phone", phone!);
  const { count, error: countErr } = await recent;
  if (countErr && isMissingTable(countErr.message)) {
    return NextResponse.json({ error: "Booking requests aren't open yet — call or email the shop." }, { status: 503 });
  }
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "We already have your request — the shop will get back to you soon." }, { status: 429 });
  }

  // Validate the artist id against the real roster (don't trust the form).
  let artistId: string | null = null;
  const requested = clip(b.artistId, 60);
  if (requested) {
    const { data: a } = await admin.from("artists").select("id").eq("id", requested).eq("active", true).maybeSingle();
    artistId = a?.id ?? null;
  }

  // Reference images: only URLs minted by our own upload route (request-refs
  // bucket) are kept — anything else in the array is dropped, max 3.
  const refPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/request-refs/`;
  const referenceUrls = (Array.isArray(b.referenceUrls) ? b.referenceUrls : [])
    .filter((u): u is string => typeof u === "string" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && u.startsWith(refPrefix))
    .slice(0, 3);

  const { error } = await admin.from("booking_requests").insert({
    name,
    email: emailOk ? email : null,
    phone,
    artist_id: artistId,
    idea,
    placement: clip(b.placement, 200),
    size: clip(b.size, 100),
    availability: clip(b.availability, 300),
    ...(referenceUrls.length ? { reference_urls: referenceUrls } : {}),
  });
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Booking requests aren't open yet — call or email the shop." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save your request — try again." }, { status: 500 });
  }

  // Ping the desk (and the asked-for artist) — best-effort, never blocks.
  await pushEvent(
    admin,
    { roles: ["owner", "frontdesk"], artistId },
    "New booking request",
    `${name}: ${idea.slice(0, 90)}`,
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("booking_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ configured: false, requests: [] });
    return NextResponse.json({ error: error.message, requests: [] }, { status: 500 });
  }
  return NextResponse.json({ configured: true, requests: data ?? [] });
}

export async function PATCH(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

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

  const { data: reqRow } = await supabase.from("booking_requests").select("*").eq("id", b.id).maybeSingle();
  if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: `Already ${reqRow.status}.` }, { status: 409 });
  }

  const stamp = { handled_by: user.email ?? null, handled_at: new Date().toISOString() };

  if (b.action === "decline") {
    const { data, error } = await supabase
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
      const { data: c } = await supabase.from("clients").select("id").eq("email", reqRow.email).maybeSingle();
      clientId = c?.id ?? null;
    }
    if (!clientId && reqRow.phone) {
      const { data: c } = await supabase.from("clients").select("id").eq("phone", reqRow.phone).maybeSingle();
      clientId = c?.id ?? null;
    }
    if (!clientId) {
      const [first, ...rest] = (reqRow.name as string).split(/\s+/);
      const { data: c, error: cErr } = await supabase
        .from("clients")
        .insert({
          id: `cl-${randomUUID()}`,
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

    const deposit = Math.max(0, Math.round(b.depositCents ?? 0));
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .insert({
        id: `bk-${randomUUID()}`,
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

    const { data, error } = await supabase
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
      const admin = createAdminClient();
      if (admin) {
        const link = await createPaymentLink(admin, {
          bookingId: booking.id,
          clientId,
          artistId: booking.artist_id ?? null,
          kind: "deposit",
          amountCents: deposit,
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
