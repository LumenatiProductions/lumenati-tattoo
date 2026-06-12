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

- [ ] 1. **Home base** — web `/admin` overview + app `home.tsx` (staff home,
      artist home, JD's tabs, view-as-artist preview)
- [ ] 2. **POS & payments** — app `pos.tsx` + `TapToPayPos` + Y2K blast; web
      pay links + `/pay/[token]` + tips; (TTP entitlement state)
- [ ] 3. **Bookings** — web `/admin/bookings` (agenda/week, requests inbox,
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

(none yet)
