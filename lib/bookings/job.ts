// SCAFFOLD STUB — the Bookings feature implements this (Square Appointments sync
// + auto-flag past scheduled as no_show; see STARTER-BOOKINGS.md). Called by
// /api/ops/daily. `admin` is the service-role Supabase client (bypasses RLS).
export async function runDailyJob(_admin: unknown) {
  return { feature: "bookings", skipped: true };
}
