// Twilio SMS, SERVER ONLY — the texting counterpart to Resend email. Same
// graceful gate as Stripe/Square/Resend: until the env vars are set,
// isSmsConfigured is false and everything that could text falls back to email
// (or hands staff the link to text manually). No SDK — Twilio's REST API is one
// form-encoded POST.
//
// Env (Vercel + .env.local):
//   TWILIO_ACCOUNT_SID            ACxxxxxxxx
//   TWILIO_AUTH_TOKEN             secret
//   TWILIO_MESSAGING_SERVICE_SID  MGxxxxxxxx   (preferred), or
//   TWILIO_FROM_NUMBER            +13035550123 (fallback if no service SID)

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const FROM = process.env.TWILIO_FROM_NUMBER;

export const isSmsConfigured = !!(SID && TOKEN && (SERVICE_SID || FROM));

/**
 * Normalize a US-centric phone to E.164 (+1XXXXXXXXXX). Returns null when the
 * input can't be a real number — callers treat that as "no phone on file".
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    return rest.length >= 10 && rest.length <= 15 ? `+${rest}` : null;
  }
  const just = digits.replace(/\D/g, "");
  if (just.length === 10) return `+1${just}`;
  if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  return null;
}

/**
 * Send one SMS. Returns { ok, sid } or { ok:false, error }. Never throws — a
 * texting failure should mark a followup row failed, not crash a job.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<{ ok: true; sid?: string } | { ok: false; error: string }> {
  if (!isSmsConfigured) return { ok: false, error: "SMS not configured (TWILIO_* env vars)" };
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, error: `Not a valid mobile number: ${to}` };

  const params = new URLSearchParams({ To: phone, Body: body });
  if (SERVICE_SID) params.set("MessagingServiceSid", SERVICE_SID);
  else params.set("From", FROM!);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message || `Twilio error (${res.status})` };
    return { ok: true, sid: data.sid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error sending SMS" };
  }
}

/** True when a string looks like a phone number rather than an email. */
export const looksLikePhone = (s: string) => !s.includes("@") && s.replace(/\D/g, "").length >= 10;
