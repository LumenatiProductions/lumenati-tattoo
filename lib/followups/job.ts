// SCAFFOLD STUB — the Follow-ups feature implements this (enqueue follow-ups for
// newly-completed bookings, then send any due today via Resend; see
// STARTER-4-FOLLOWUPS.md). Called by /api/ops/daily. `admin` is the service-role
// Supabase client (bypasses RLS).
export async function runDailyJob(_admin: unknown) {
  return { feature: "followups", skipped: true };
}
