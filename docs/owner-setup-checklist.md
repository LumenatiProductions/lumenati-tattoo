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

## 3. Email domain (later, after moving it from Squarespace)
- Move the domain off Squarespace, verify it in Resend.
- Then set `RESEND_FROM` = `Lumenati Tattoo <hello@yourdomain.com>`.
- `RESEND_API_KEY` is already set. Until the domain is verified, email sends from a sandbox address that lands in spam, so texts are the better path for now.

## 4. Live Stripe (real card payments)
- Swap the test keys for live keys, complete Stripe business verification.
- Set the live `STRIPE_WEBHOOK_SECRET` for the production webhook.
- Payments run in test mode until this is done.

## 5. Legal sign-off on consent forms
- Have the consent/waiver wording reviewed (it holds medical + ID info).
- Then set `LEGAL_COPY_REVIEWED` = `true` to drop the "pending review" banner.

## 6. Message voice (whenever)
- The four follow-up templates (aftercare, review, rebook, birthday) are placeholders. Edit them in the Follow-ups page in your shop's voice.

## 7. (Optional) In-person card taps on the phone
- Apple Tap-to-Pay entitlement approval, so artists can take card payments directly on their iPhone (this is what replaces Square terminals).
