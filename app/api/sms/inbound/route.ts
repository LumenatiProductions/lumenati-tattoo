import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/sms";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

export const dynamic = "force-dynamic";

// Twilio inbound-SMS webhook. Point the Messaging Service's "A message comes
// in" hook at POST https://<site>/api/sms/inbound. A reply starting with
// C / CONFIRM / YES from a known client confirms their next scheduled booking
// (bookings.confirmed_at, confirmations-schema.sql).
//
// Auth: Twilio's X-Twilio-Signature — HMAC-SHA1 over the full URL + the
// form params sorted by key, keyed with TWILIO_AUTH_TOKEN. Requests that
// don't verify are dropped. (STOP/HELP are handled by Twilio itself before
// this hook ever fires.)

function validSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const twiml = (message?: string) =>
  new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message>` : ""}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );

const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return twiml();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Twilio signs the URL it was configured with — behind Vercel's proxy,
  // reconstruct the public https URL from forwarding headers.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const url = `https://${host}${new URL(req.url).pathname}`;
  if (!validSignature(url, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 403 });
  }

  const from = normalizePhone(params.From ?? "");
  const body = (params.Body ?? "").trim().toUpperCase();
  if (!from) return twiml();

  const confirming = body === "C" || body.startsWith("CONFIRM") || body === "YES" || body === "Y";
  if (!confirming) {
    // Anything else gets a human hand-off, no auto-conversation.
    return twiml("Got it — the shop will get back to you. For anything urgent, call us.");
  }

  const admin = createAdminClient();
  if (!admin) return twiml();

  // Find the client by phone (formats in the DB vary, so normalize in JS).
  // The inbound Twilio number is physically Lumenati's, so pin its shop.
  const { data: clients } = await admin
    .from("clients")
    .select("id, first_name, phone")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .not("phone", "is", null)
    .limit(2000);
  const client = (clients ?? []).find((c) => normalizePhone(c.phone) === from);
  if (!client) return twiml("Thanks! We couldn't match your number to an appointment — the desk will follow up.");

  // Their next scheduled session within the reminder window.
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, starts_at, confirmed_at")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .eq("client_id", client.id)
    .eq("status", "scheduled")
    .gte("starts_at", now)
    .lte("starts_at", horizon)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!booking) {
    return twiml("Thanks! We don't see an upcoming appointment for you — the desk will follow up.");
  }

  if (!booking.confirmed_at) {
    const { error } = await admin
      .from("bookings")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("shop_id", LUMENATI_SHOP_ID);
    if (error && !/column .* does not exist/i.test(error.message)) {
      return twiml("Thanks! The desk will confirm you manually.");
    }
  }

  const when = new Date(booking.starts_at as string).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TZ,
  });
  return twiml(`You're confirmed for ${when}. See you then!`);
}
