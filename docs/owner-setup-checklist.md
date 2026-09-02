# Things only you can do (external setup + sign-offs)

The product is built; these are account setups, key swaps, and approvals that are
yours. Each is a small one-time task. Add env values in Vercel (Project →
Settings → Environment Variables) and, for local testing, in `app-native/.env` /
`.env.local`.

## 1. Texting (Twilio) — ALMOST DONE, one value missing
Already set (20 days ago, in Vercel + local): `TWILIO_ACCOUNT_SID` (`ACc5d…`) and
`TWILIO_FROM_NUMBER` (`+1209…`). The Twilio account and number exist.
MISSING — the only gap: **`TWILIO_AUTH_TOKEN`** (the secret). Get it from the
Twilio Console (console.twilio.com → Account Info → Auth Token → reveal), then
add it as `TWILIO_AUTH_TOKEN` in Vercel (and `.env.local` for local testing).
Once that's in, `isSmsConfigured` flips true and texts turn on automatically.

## 2. Turn auto-send ON when ready
- `FOLLOWUPS_AUTOSEND` = `true`
Until this is `true`, the system quietly *queues* follow-ups but doesn't send them. Flip it when you're ready for messages to actually go out. (Manual "Send now" from the Follow-ups page always works regardless.)

## 3. Email domain — the one thing blocking real email (as of 2026-09-02)
Two things are broken by the same gap, and neither needs the website moved:

- **Sign-in codes by email fail for everyone except the account owner** (QA
  lum-034). Supabase Auth already sends through Resend, but from the sandbox
  address, which only delivers to the Resend account owner's inbox.
- **No product email reaches clients or artists.** Resend's sandbox sender
  (`onboarding@resend.dev`) only delivers to the Resend account owner's inbox.
  Reminders, deposit links, consent forms, rent invoices, receipts, blasts:
  none of it has been landing.

Fix, in order (the site stays on Squarespace; only DNS records are added):
1. Resend → Domains → Add domain `mail.lumenatitattoo.com` (a subdomain, so
   Google Workspace mail on the root domain is untouched).
2. Squarespace → Domains → lumenatitattoo.com → DNS → add the records Resend
   shows (one DKIM TXT, one MX + one TXT for `send.mail`, optional DMARC).
   Wait for Resend to show **Verified** (minutes to an hour).
3. Vercel → `RESEND_FROM` = `Lumenati Tattoo <hello@mail.lumenatitattoo.com>`,
   redeploy. Every product email switches over (`lib/email/from.ts`).
4. `node scripts/set-auth-smtp.mjs signin@mail.lumenatitattoo.com` (needs
   `SUPABASE_ACCESS_TOKEN` in the shell). Sign-in codes switch to Resend.
5. Test: sign in with a non-team email on /admin/login.

## 4. Live Stripe (real card payments)
- Swap the test keys for live keys, complete Stripe business verification.
- Set the live `STRIPE_WEBHOOK_SECRET` for the production webhook.
- Payments run in test mode until this is done.

## 5. Legal sign-off on consent forms — DONE (Scott's call, 2026-07-12)
- No outside review wanted. `LEGAL_COPY_REVIEWED` is set to `true` in
  production and locally; the "pending review" banner is gone.

## 6. Message voice (whenever)
- The four follow-up templates (aftercare, review, rebook, birthday) are placeholders. Edit them in the Follow-ups page in your shop's voice.

## 7. (Optional) In-person card taps on the phone
- Apple Tap-to-Pay entitlement approval, so artists can take card payments directly on their iPhone (this is what replaces Square terminals).
