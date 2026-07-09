-- 2026-07-09 role collapse: the shop is artists + admin, nothing else.
-- Rewrites every RLS policy that still grants to the retired bookkeeper /
-- frontdesk roles so only owner (admin) and artist remain. Behavior-
-- identical today: no profile has ever held either retired role.
-- Generated from live pg_policies on 2026-07-09; run via Management API.

alter policy "campaigns_staff_read" on public.artist_campaigns
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "campaigns_staff_write" on public.artist_campaigns
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "client_notes_staff_read" on public.artist_client_notes
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "booking_requests_staff_all" on public.booking_requests
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "bookings_staff_read" on public.bookings
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "bookings_staff_write" on public.bookings
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "cash_entries_staff_all" on public.cash_entries
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "cash_sessions_staff_all" on public.cash_sessions
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "clients_staff_read" on public.clients
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "clients_staff_write" on public.clients
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "consent_forms_staff_read" on public.consent_forms
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "consent_forms_staff_update" on public.consent_forms
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "consent_forms_staff_write" on public.consent_forms
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "expenses_books_read" on public.expenses
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "expenses_books_write" on public.expenses
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "followup_templates_read" on public.followup_templates
  using (((my_role() = ANY (ARRAY['owner'::text, 'artist'::text])) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "followup_templates_write" on public.followup_templates
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "followups_staff_read" on public.followups
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "followups_staff_write" on public.followups
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "healed_photos_staff_all" on public.healed_photos
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "inventory_items_staff_read" on public.inventory_items
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "inventory_items_staff_write" on public.inventory_items
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "inventory_log_staff_read" on public.inventory_log
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "inventory_log_staff_write" on public.inventory_log
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "ledger_cash_insert" on public.ledger
  with check (((my_role() = 'owner'::text) AND (source = 'cash'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "ledger_read" on public.ledger
  using ((((my_role() = 'owner'::text) OR (artist_id = my_artist())) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "owner_draws_books_all" on public.owner_draws
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "payments_staff_read" on public.payments
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "payments_staff_write" on public.payments
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "recurring_expenses_books_all" on public.recurring_expenses
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "rent_invoices_books_all" on public.rent_invoices
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "review_snapshots_staff_all" on public.review_snapshots
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "sales_read" on public.sales
  using ((((my_role() = 'owner'::text) OR ((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "settlements_books_all" on public.settlements
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "slot_offers_staff_all" on public.slot_offers
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "social_posts_curate" on public.social_posts
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "social_posts_read" on public.social_posts
  using (((my_role() = ANY (ARRAY['owner'::text, 'artist'::text])) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "sync_read" on public.square_sync
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "stm_read" on public.square_team_members
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

alter policy "waitlist_staff_all" on public.waitlist
  using (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))))
  with check (((my_role() = 'owner'::text) AND (shop_id = ( SELECT current_shop_id() AS current_shop_id))));

notify pgrst, 'reload schema';