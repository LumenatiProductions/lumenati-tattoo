// SCAFFOLD STUB — the Compliance feature implements this (recompute expiry status
// + email owner what's lapsing within 30 days; see STARTER-5-COMPLIANCE.md). Called
// by /api/ops/daily. `admin` is the service-role Supabase client (bypasses RLS).
export async function runDailyJob(_admin: unknown) {
  return { feature: "compliance", skipped: true };
}
