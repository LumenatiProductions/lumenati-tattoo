// One sender address for every email the product sends.
//
// RESEND_FROM = "Lumenati Tattoo <hello@mail.lumenatitattoo.com>" (set in
// Vercel once that domain is verified in Resend). The sending shop's name
// replaces the display name so a client of another shop never sees
// "Lumenati" as the sender; the address stays the verified one.
//
// Until RESEND_FROM is set, this falls back to Resend's sandbox sender.
// The sandbox only delivers to the Resend account owner's own inbox, so
// with it in place NOTHING reaches clients or artists. Sign-in codes go
// through Supabase's own SMTP setting, not this file (scripts/set-auth-smtp.mjs).

const SANDBOX = "onboarding@resend.dev";
const DEFAULT_NAME = "Lumenati Tattoo";

export function emailFrom(shopName?: string | null): string {
  const name = (shopName?.trim() || DEFAULT_NAME).replace(/[<>"\r\n]/g, "");
  const configured = process.env.RESEND_FROM?.trim();
  const addr = configured ? (configured.match(/<([^>]+)>/)?.[1] ?? configured) : SANDBOX;
  return `${name} <${addr}>`;
}

/** True once a verified sending domain is configured. */
export function emailDomainVerified(): boolean {
  return Boolean(process.env.RESEND_FROM?.trim());
}
