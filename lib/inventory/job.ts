// SCAFFOLD STUB — the Inventory feature implements this (email owner items at/below
// reorder threshold; see STARTER-6-INVENTORY.md). Called by /api/ops/daily. `admin`
// is the service-role Supabase client (bypasses RLS).
export async function runDailyJob(_admin: unknown) {
  return { feature: "inventory", skipped: true };
}
