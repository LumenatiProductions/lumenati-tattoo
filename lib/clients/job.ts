// SCAFFOLD STUB — the Clients feature implements this (Square customer sync +
// spend rollup; see STARTER-1-CLIENTS.md). Called by /api/ops/daily inside its own
// try/catch. `admin` is the service-role Supabase client (bypasses RLS).
export async function runDailyJob(_admin: unknown) {
  return { feature: "clients", skipped: true };
}
