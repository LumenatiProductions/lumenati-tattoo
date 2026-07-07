-- Shop data walls (applied live 2026-07-07 via the Management API).
-- 1) Every role/identity-gated policy now also requires
--    shop_id = current_shop_id() — reads AND writes (with check). The only
--    policies left unscoped are the deliberate public reads: artists_public_read,
--    room_content_read, campaigns_public_read, shops_public_read, shops_read.
--    profiles_read keeps own-row access and scopes the is_owner() arm;
--    shops_owner_write scopes to id = current_shop_id().
-- 2) shop_id column DEFAULTs (Lumenati) are gone; a BEFORE INSERT trigger
--    stamps current_shop_id() instead, so an app write lands in the writer's
--    own shop and an explicit foreign shop_id still has to survive the
--    policies' WITH CHECK.
-- 3) sync_sales_to_ledger propagates sales.shop_id onto the ledger rows.
alter policy "campaigns_artist_read" on public.artist_campaigns using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "campaigns_artist_write" on public.artist_campaigns using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id())))) with check (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "campaigns_staff_read" on public.artist_campaigns using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "campaigns_staff_write" on public.artist_campaigns using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "client_notes_artist_all" on public.artist_client_notes using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id())))) with check (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "client_notes_staff_read" on public.artist_client_notes using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "artist_expenses_own" on public.artist_expenses using ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id())))) with check ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id()))));
alter policy "artist_goals_own" on public.artist_goals using ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id())))) with check ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id()))));
alter policy "artists_owner_write" on public.artists using (((is_owner()) AND (shop_id = (select public.current_shop_id())))) with check (((is_owner()) AND (shop_id = (select public.current_shop_id()))));
alter policy "booking_requests_artist_read" on public.booking_requests using ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id()))));
alter policy "booking_requests_staff_all" on public.booking_requests using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "bookings_artist_insert" on public.bookings with check (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "bookings_artist_read" on public.bookings using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "bookings_staff_read" on public.bookings using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "bookings_staff_write" on public.bookings using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "cash_entries_staff_all" on public.cash_entries using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "cash_sessions_staff_all" on public.cash_sessions using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "clients_artist_insert" on public.clients with check (((((my_role() = 'artist'::text) AND (preferred_artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "clients_artist_read" on public.clients using (((((my_role() = 'artist'::text) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.client_id = clients.id) AND (b.artist_id = my_artist())))))) AND (shop_id = (select public.current_shop_id()))));
alter policy "clients_staff_read" on public.clients using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "clients_staff_write" on public.clients using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "compliance_owner_read" on public.compliance_items using ((((my_role() = 'owner'::text)) AND (shop_id = (select public.current_shop_id()))));
alter policy "compliance_owner_write" on public.compliance_items using ((((my_role() = 'owner'::text)) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = 'owner'::text)) AND (shop_id = (select public.current_shop_id()))));
alter policy "consent_forms_artist_read" on public.consent_forms using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "consent_forms_staff_read" on public.consent_forms using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "consent_forms_staff_update" on public.consent_forms using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "consent_forms_staff_write" on public.consent_forms with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "device_tokens_own" on public.device_tokens using ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id())))) with check ((((user_id = auth.uid())) AND (shop_id = (select public.current_shop_id()))));
alter policy "expenses_books_read" on public.expenses using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "expenses_books_write" on public.expenses using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "followup_templates_read" on public.followup_templates using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text, 'artist'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "followup_templates_write" on public.followup_templates using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "followups_staff_read" on public.followups using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "followups_staff_write" on public.followups using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "healed_photos_artist_read" on public.healed_photos using ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id()))));
alter policy "healed_photos_staff_all" on public.healed_photos using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "inventory_items_staff_read" on public.inventory_items using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "inventory_items_staff_write" on public.inventory_items using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "inventory_log_staff_read" on public.inventory_log using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "inventory_log_staff_write" on public.inventory_log using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "ledger_cash_insert" on public.ledger with check (((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text])) AND (source = 'cash'::text))) AND (shop_id = (select public.current_shop_id()))));
alter policy "ledger_read" on public.ledger using (((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text])) OR (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "owner_draws_books_all" on public.owner_draws using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "payments_staff_read" on public.payments using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "payments_staff_write" on public.payments using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "profiles_owner_write" on public.profiles using ((public.is_owner() AND (shop_id = (select public.current_shop_id())))) with check ((public.is_owner() AND (shop_id = (select public.current_shop_id()))));
alter policy "profiles_read" on public.profiles using (((email = auth.email()) OR (public.is_owner() AND (shop_id = (select public.current_shop_id())))));
alter policy "recurring_expenses_books_all" on public.recurring_expenses using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "rent_invoices_artist_read" on public.rent_invoices using ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id()))));
alter policy "rent_invoices_books_all" on public.rent_invoices using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "review_snapshots_staff_all" on public.review_snapshots using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "room_content_artist_write" on public.room_content using ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id())))) with check ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id()))));
alter policy "room_content_owner_write" on public.room_content using (((is_owner()) AND (shop_id = (select public.current_shop_id())))) with check (((is_owner()) AND (shop_id = (select public.current_shop_id()))));
alter policy "sales_owner_write" on public.sales using (((is_owner()) AND (shop_id = (select public.current_shop_id())))) with check (((is_owner()) AND (shop_id = (select public.current_shop_id()))));
alter policy "sales_read" on public.sales using (((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text])) OR ((my_role() = 'artist'::text) AND (artist_id = my_artist())))) AND (shop_id = (select public.current_shop_id()))));
alter policy "settlements_artist_read" on public.settlements using ((((artist_id = my_artist())) AND (shop_id = (select public.current_shop_id()))));
alter policy "settlements_books_all" on public.settlements using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "shops_owner_write" on public.shops using ((public.is_owner() AND (id = (select public.current_shop_id())))) with check ((public.is_owner() AND (id = (select public.current_shop_id()))));
alter policy "slot_offers_artist_read" on public.slot_offers using (((((my_role() = 'artist'::text) AND (artist_id = my_artist()))) AND (shop_id = (select public.current_shop_id()))));
alter policy "slot_offers_staff_all" on public.slot_offers using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "social_posts_curate" on public.social_posts using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "social_posts_read" on public.social_posts using ((((my_role() = ANY (ARRAY['owner'::text, 'frontdesk'::text, 'bookkeeper'::text, 'artist'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "sync_owner_write" on public.square_sync using (((is_owner()) AND (shop_id = (select public.current_shop_id())))) with check (((is_owner()) AND (shop_id = (select public.current_shop_id()))));
alter policy "sync_read" on public.square_sync using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "stm_owner_write" on public.square_team_members using (((is_owner()) AND (shop_id = (select public.current_shop_id())))) with check (((is_owner()) AND (shop_id = (select public.current_shop_id()))));
alter policy "stm_read" on public.square_team_members using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text]))) AND (shop_id = (select public.current_shop_id()))));
alter policy "waitlist_artist_all" on public.waitlist using (((((my_role() = 'artist'::text) AND ((artist_id = my_artist()) OR (artist_id IS NULL)))) AND (shop_id = (select public.current_shop_id())))) with check (((((my_role() = 'artist'::text) AND ((artist_id = my_artist()) OR (artist_id IS NULL)))) AND (shop_id = (select public.current_shop_id()))));
alter policy "waitlist_staff_all" on public.waitlist using ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id())))) with check ((((my_role() = ANY (ARRAY['owner'::text, 'bookkeeper'::text, 'frontdesk'::text]))) AND (shop_id = (select public.current_shop_id()))));
create or replace function public.set_shop_id() returns trigger language plpgsql security definer set search_path to 'public' as $$ begin new.shop_id := coalesce(new.shop_id, public.current_shop_id()); return new; end $$;
alter table public.artist_campaigns alter column shop_id drop default;
drop trigger if exists set_shop_id on public.artist_campaigns;
create trigger set_shop_id before insert on public.artist_campaigns for each row execute function public.set_shop_id();
alter table public.artist_client_notes alter column shop_id drop default;
drop trigger if exists set_shop_id on public.artist_client_notes;
create trigger set_shop_id before insert on public.artist_client_notes for each row execute function public.set_shop_id();
alter table public.artist_expenses alter column shop_id drop default;
drop trigger if exists set_shop_id on public.artist_expenses;
create trigger set_shop_id before insert on public.artist_expenses for each row execute function public.set_shop_id();
alter table public.artist_goals alter column shop_id drop default;
drop trigger if exists set_shop_id on public.artist_goals;
create trigger set_shop_id before insert on public.artist_goals for each row execute function public.set_shop_id();
alter table public.artists alter column shop_id drop default;
drop trigger if exists set_shop_id on public.artists;
create trigger set_shop_id before insert on public.artists for each row execute function public.set_shop_id();
alter table public.booking_requests alter column shop_id drop default;
drop trigger if exists set_shop_id on public.booking_requests;
create trigger set_shop_id before insert on public.booking_requests for each row execute function public.set_shop_id();
alter table public.bookings alter column shop_id drop default;
drop trigger if exists set_shop_id on public.bookings;
create trigger set_shop_id before insert on public.bookings for each row execute function public.set_shop_id();
alter table public.cash_entries alter column shop_id drop default;
drop trigger if exists set_shop_id on public.cash_entries;
create trigger set_shop_id before insert on public.cash_entries for each row execute function public.set_shop_id();
alter table public.cash_sessions alter column shop_id drop default;
drop trigger if exists set_shop_id on public.cash_sessions;
create trigger set_shop_id before insert on public.cash_sessions for each row execute function public.set_shop_id();
alter table public.clients alter column shop_id drop default;
drop trigger if exists set_shop_id on public.clients;
create trigger set_shop_id before insert on public.clients for each row execute function public.set_shop_id();
alter table public.compliance_items alter column shop_id drop default;
drop trigger if exists set_shop_id on public.compliance_items;
create trigger set_shop_id before insert on public.compliance_items for each row execute function public.set_shop_id();
alter table public.consent_forms alter column shop_id drop default;
drop trigger if exists set_shop_id on public.consent_forms;
create trigger set_shop_id before insert on public.consent_forms for each row execute function public.set_shop_id();
alter table public.device_tokens alter column shop_id drop default;
drop trigger if exists set_shop_id on public.device_tokens;
create trigger set_shop_id before insert on public.device_tokens for each row execute function public.set_shop_id();
alter table public.expenses alter column shop_id drop default;
drop trigger if exists set_shop_id on public.expenses;
create trigger set_shop_id before insert on public.expenses for each row execute function public.set_shop_id();
alter table public.followup_templates alter column shop_id drop default;
drop trigger if exists set_shop_id on public.followup_templates;
create trigger set_shop_id before insert on public.followup_templates for each row execute function public.set_shop_id();
alter table public.followups alter column shop_id drop default;
drop trigger if exists set_shop_id on public.followups;
create trigger set_shop_id before insert on public.followups for each row execute function public.set_shop_id();
alter table public.healed_photos alter column shop_id drop default;
drop trigger if exists set_shop_id on public.healed_photos;
create trigger set_shop_id before insert on public.healed_photos for each row execute function public.set_shop_id();
alter table public.inventory_items alter column shop_id drop default;
drop trigger if exists set_shop_id on public.inventory_items;
create trigger set_shop_id before insert on public.inventory_items for each row execute function public.set_shop_id();
alter table public.inventory_log alter column shop_id drop default;
drop trigger if exists set_shop_id on public.inventory_log;
create trigger set_shop_id before insert on public.inventory_log for each row execute function public.set_shop_id();
alter table public.ledger alter column shop_id drop default;
drop trigger if exists set_shop_id on public.ledger;
create trigger set_shop_id before insert on public.ledger for each row execute function public.set_shop_id();
alter table public.owner_draws alter column shop_id drop default;
drop trigger if exists set_shop_id on public.owner_draws;
create trigger set_shop_id before insert on public.owner_draws for each row execute function public.set_shop_id();
alter table public.payments alter column shop_id drop default;
drop trigger if exists set_shop_id on public.payments;
create trigger set_shop_id before insert on public.payments for each row execute function public.set_shop_id();
alter table public.profiles alter column shop_id drop default;
drop trigger if exists set_shop_id on public.profiles;
create trigger set_shop_id before insert on public.profiles for each row execute function public.set_shop_id();
alter table public.recurring_expenses alter column shop_id drop default;
drop trigger if exists set_shop_id on public.recurring_expenses;
create trigger set_shop_id before insert on public.recurring_expenses for each row execute function public.set_shop_id();
alter table public.rent_invoices alter column shop_id drop default;
drop trigger if exists set_shop_id on public.rent_invoices;
create trigger set_shop_id before insert on public.rent_invoices for each row execute function public.set_shop_id();
alter table public.review_snapshots alter column shop_id drop default;
drop trigger if exists set_shop_id on public.review_snapshots;
create trigger set_shop_id before insert on public.review_snapshots for each row execute function public.set_shop_id();
alter table public.room_content alter column shop_id drop default;
drop trigger if exists set_shop_id on public.room_content;
create trigger set_shop_id before insert on public.room_content for each row execute function public.set_shop_id();
alter table public.sales alter column shop_id drop default;
drop trigger if exists set_shop_id on public.sales;
create trigger set_shop_id before insert on public.sales for each row execute function public.set_shop_id();
alter table public.settlements alter column shop_id drop default;
drop trigger if exists set_shop_id on public.settlements;
create trigger set_shop_id before insert on public.settlements for each row execute function public.set_shop_id();
alter table public.slot_offers alter column shop_id drop default;
drop trigger if exists set_shop_id on public.slot_offers;
create trigger set_shop_id before insert on public.slot_offers for each row execute function public.set_shop_id();
alter table public.social_posts alter column shop_id drop default;
drop trigger if exists set_shop_id on public.social_posts;
create trigger set_shop_id before insert on public.social_posts for each row execute function public.set_shop_id();
alter table public.square_sync alter column shop_id drop default;
drop trigger if exists set_shop_id on public.square_sync;
create trigger set_shop_id before insert on public.square_sync for each row execute function public.set_shop_id();
alter table public.square_team_members alter column shop_id drop default;
drop trigger if exists set_shop_id on public.square_team_members;
create trigger set_shop_id before insert on public.square_team_members for each row execute function public.set_shop_id();
alter table public.waitlist alter column shop_id drop default;
drop trigger if exists set_shop_id on public.waitlist;
create trigger set_shop_id before insert on public.waitlist for each row execute function public.set_shop_id();
create or replace function public.sync_sales_to_ledger()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note, shop_id)
  select case when s.method = 'cash' then 'cash' else 'square' end, 'sale', 'in', s.service_cents,
    case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
    s.created_at, 'square-sync', 'sale_' || s.id || '_svc', 'from square sync', s.shop_id
  from public.sales s where s.service_cents > 0 and s.id not like 'lum_%'
  on conflict (source, external_id) do nothing;

  insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note, shop_id)
  select case when s.method = 'cash' then 'cash' else 'square' end, 'tip', 'in', s.tip_cents,
    case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
    s.created_at, 'square-sync', 'sale_' || s.id || '_tip', 'from square sync', s.shop_id
  from public.sales s where coalesce(s.tip_cents,0) > 0 and s.id not like 'lum_%'
  on conflict (source, external_id) do nothing;
end $function$;
notify pgrst, 'reload schema';
-- Logged-in users get the same shops columns the public gets; sales_tax_bps
-- and anything added later stays server-only (the /api/tax-rate route reads it
-- with the service role, scoped to the caller's shop).
revoke select on public.shops from authenticated;
grant select (id, slug, name, template, accent, tagline) on public.shops to authenticated;
notify pgrst, 'reload schema';
-- Artists can cancel their own scheduled bookings (Scott greenlit 2026-07-07).
-- The policy opens exactly one door: own booking, own shop, scheduled -> cancelled.
create policy bookings_artist_cancel on public.bookings
  for update
  using (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (status = 'scheduled'::text)
    and (shop_id = (select public.current_shop_id()))
  )
  with check (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (status = 'cancelled'::text)
    and (shop_id = (select public.current_shop_id()))
  );

-- Belt for the door above: an artist-role UPDATE may change nothing except
-- status (scheduled -> cancelled). Any other column silently keeps its old
-- value, and a held deposit refunds -- the same cascade the desk's cancel runs.
create or replace function public.bookings_artist_cancel_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.my_role() = 'artist' then
    if old.status <> 'scheduled' or new.status is distinct from 'cancelled' then
      raise exception 'Artists can only cancel their own scheduled bookings';
    end if;
    new := old;
    new.status := 'cancelled';
    if old.deposit_status = 'held' then
      new.deposit_status := 'refunded';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_artist_cancel_guard on public.bookings;
create trigger bookings_artist_cancel_guard before update on public.bookings
  for each row execute function public.bookings_artist_cancel_guard();

notify pgrst, 'reload schema';
