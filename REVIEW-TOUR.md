# The Review Tour — every surface, one session at a time

Scott (2026-06-12): "go through everything section by section on the desktop
and on the app so we can round out the entire thing." One stop per session.
The starter always points at the NEXT unchecked stop; finishing a stop means
checking it off here, writing one line of takeaways under it, and pointing the
starter at the next one.

## The protocol (every stop, same shape)

1. **Read both halves first** — the web page AND its app screen are one
   domain; review them together (parity is a standing directive).
2. **Explain it** — plain English, for Scott: what this surface is supposed
   to do, who uses it, when, and what the money/legal stakes are.
3. **State of it** — what's real, what's mock, what's gated on keys/phases,
   what's broken. Verify claims by reading code, not the last starter.
4. **Gaps** — what still needs building (parity holes, missing states,
   server-side enforcement that's UI-only, empty states, error paths).
5. **Make it better** — concrete upgrades ranked: daily-use friction first,
   then intelligence (coach-style suggestions from real data), then dopamine
   (haptics/charts/animation — the kit exists: reanimated, gesture-handler,
   GoalDial, MoneyChart, MiniConfetti, CountUp, the haptics vocabulary).
6. **Build what Scott picks** in the same session. Commit + push per slice.
7. **Close out**: check the stop off below + one-line takeaway, update the
   starter pointer, note anything that spilled into the Roadmap.

Standing rules that bind every stop: artists see only their own world; Shop
on everyone's POS (merch); plain-English copy; no emojis in product copy;
nothing claims withholding happens (1099/W-2 coach rules); pink = money
moments only.

## The queue (in order — daily-use first, then money, then ops, then edges)

- [x] 1. **Home base** — web `/admin` overview + app `home.tsx` (staff home,
      artist home, JD's tabs, view-as-artist preview)
- [x] 2. **POS & payments** — app `pos.tsx` + `TapToPayPos` + Y2K blast; web
      pay links + `/pay/[token]` + tips; (TTP entitlement state)
- [x] 3. **Bookings** — web `/admin/bookings` (agenda/week, requests inbox,
      confirmations) + app `bookings.tsx`; public `/request`
- [ ] 4. **Clients** — web `/admin/clients` (history, merge) + app
      `clients.tsx`
- [ ] 5. **Intake & consent** — web `/admin/intake` + app `intake.tsx` +
      public signer `/intake/[token]` + guardian flow; LEGAL_COPY_REVIEWED
      still pending counsel
- [ ] 6. **Follow-ups & Social** — web `/admin/followups` + `/admin/social`
      + app `followups.tsx` + `social.tsx`; healed-photo loop `/healed/[token]`
- [ ] 7. **Cash & drawer** — web `/admin/cash` (sessions, over/short) + app
      `cash.tsx` (+ snap-to-count)
- [ ] 8. **Payouts & cash-out** — web `/admin/payouts` (Connect onboarding)
      + app `payouts.tsx` (swipe-settle, sparklines) + `cashout.tsx`
- [ ] 9. **Booth rent** — web `/admin/rent` (invoices, generation) + app
      `rent.tsx` + artist-home rent section
- [ ] 10. **Reports** — web `/admin/reports` + app `reports.tsx`
- [ ] 11. **Reconciliation & books** — web `/admin/reconcile` +
      `/admin/expenses` (shop books) + app `reconcile.tsx`; QBO retirement
      path (CUTOVER.md)
- [ ] 12. **Inventory** — web `/admin/inventory` + app `inventory.tsx`
      (snap-to-count); restock-from-expenses loop; merch roadmap tie-in
- [ ] 13. **Compliance** — web `/admin/compliance` + app `compliance.tsx`;
      expiry alerts
- [ ] 14. **Artist money (personal)** — app `expenses.tsx` (deductions +
      snap receipt) + `goals.tsx` (dial, coach, tax status) — web has no
      counterpart on purpose; confirm that's right
- [ ] 15. **Rooms** — web `/admin/room` + app `room.tsx` + public site room
      pages; portfolio/healed-photo append
- [ ] 16. **Staff & roles** — web `/admin/staff` + `/admin/artists` (terms,
      splits) + app `staff.tsx`; role matrix sanity pass
- [ ] 17. **Integrations** — web `/admin/integrations` + app
      `integrations.tsx`; Square sync; Gusto quest lands here
- [ ] 18. **Kiosk** — `/kiosk` Y2K check-in (iPad provisioning still pending,
      GO-LIVE Phase 6)
- [ ] 19. **Auth & onboarding** — web magic-link login + app sign-in (OTP
      email), profiles allowlist, what a brand-new staff member experiences
      day one
- [ ] 20. **Cross-cutting sweep** — error states, empty states, push
      notifications (still need APNs/FCM), emails (Resend domain), SMS
      (Twilio still unset), the daily automation cron

## Takeaways (filled as we go)

1. **Home base** (2026-06-12): biggest find was the homes computing "Payouts
   owed"/Net from ALL sales with no rent and no settled_through — disagreeing
   with Payouts. Fixed via shared `useSettledStatements` (lib/admin/
   settlements-context.tsx) — any future who-owes-whom number must come from
   there. Also: app staff home got cockpit parity (ranked attention, week
   strip, tappable tiles), week-over-week deltas on the web strip, artist
   pull-to-refresh now real. Built all 4 ranked upgrades same session.

2. **POS & payments** (2026-06-14): biggest find — paid tickets never reached
   the books. The only writer to `sales` was the Square sync, so every Tap to
   Pay ticket and web pay-link ticket settled the `payments` row, moved the
   money via Connect, then vanished from earnings/statements/Payouts/Reports
   (and the Square cutover would have darked the whole money layer). Fixed:
   `settlePayment` now mirrors a paid ticket/misc payment into `sales`
   (`lum_<payment id>`, idempotent). RULE: native Stripe charges feed the books
   only through that bridge — anything new that takes money must go through
   `settlePayment` or write `sales` the same way. Also built: tip on in-person
   Tap to Pay (fee on service only, tip to the artist — parity with the web pay
   link); a web "send pay link" UI (PayLinkDialog) that finally wires the unused
   `/api/payments` mint into the bookings drawer + an ad-hoc button; and a real
   refund path (`/api/payments/refund`) that reverses the Connect transfer and
   undoes the books, wired to the deposit Refund button. TTP entitlement state
   unchanged (still dev-restricted, EXPO_PUBLIC_TTP gate, Apple videos pending).
   Deferred: refunding a *ticket* has no UI yet (no payments-list surface) — the
   API is ready; surface it when a payments list exists.

3. **Bookings** (2026-06-14): biggest find — nothing stopped double-booking an
   artist; the booking API did zero overlap checking. Added a server guard
   (POST+PATCH, 409 conflict:true, desk can force) + a red ⚠ ring in the week
   view; the APP inserts bookings directly under RLS, so the same check runs
   client-side there too (findClash). RULE: any new booking write must run the
   overlap check — server for the API, findClash in the app. Also built: manual
   confirm + 'send reminder now' in the drawer (confirmations were dark until
   Twilio; now work via email today); app edit sheet (reschedule/deposit/confirm
   — refunds stay web-only, they need the cookie-authed Stripe route); and
   notify-client-on-reschedule (generalized /api/bookings/remind takes kind +
   Bearer so web + app both use it). Confirm/remind/notify all text-first with
   email fallback.
