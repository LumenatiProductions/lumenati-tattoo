import type { SupabaseClient } from "@supabase/supabase-js";

// Auto no-show forfeit (POS-STARTER-4). A booking is a no-show candidate when its
// slot passed by the grace window, nobody checked it in (Session 2's
// `checked_in_at`), it was never completed/cancelled, and a deposit is still
// `held` (Session 1). The held deposit then forfeits to the shop.
//
// SAFETY: this is OPT-IN. By default the job only *reports* candidates (dry run)
// so it can never wrongly forfeit a real client's deposit when the front desk
// just forgot to mark a session complete. Set NO_SHOW_AUTOFORFEIT=1 once Scott
// confirms the grace window to actually forfeit. Tune the window with
// NO_SHOW_GRACE_HOURS.

export const DEFAULT_GRACE_HOURS = 24;

const graceHours = () => {
  const n = Number(process.env.NO_SHOW_GRACE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_HOURS;
};

export type NoShowCandidate = {
  id: string;
  starts_at: string;
  deposit_cents: number;
  client_id: string | null;
  artist_id: string | null;
};

// Bookings whose held deposit should forfeit (past grace, no check-in, not
// completed/cancelled). Pure read — used by both the job and the morning brief.
export async function findNoShowCandidates(admin: SupabaseClient): Promise<NoShowCandidate[]> {
  const cutoff = new Date(Date.now() - graceHours() * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("bookings")
    .select("id, starts_at, deposit_cents, client_id, artist_id")
    .eq("status", "scheduled")
    .eq("deposit_status", "held")
    .is("checked_in_at", null)
    .lt("starts_at", cutoff);
  if (error) throw new Error(error.message);
  return (data ?? []) as NoShowCandidate[];
}

export async function runNoShowForfeit(admin: unknown) {
  const client = admin as SupabaseClient;
  const candidates = await findNoShowCandidates(client);
  const armed = process.env.NO_SHOW_AUTOFORFEIT === "1";

  let forfeited = 0;
  if (armed) {
    for (const b of candidates) {
      // Re-check deposit_status in the update so a concurrent change can't be
      // clobbered; forfeited deposits count as shop revenue in Reports.
      const { error } = await client
        .from("bookings")
        .update({ deposit_status: "forfeited", status: "no_show" })
        .eq("id", b.id)
        .eq("deposit_status", "held");
      if (!error) forfeited++;
    }
  }

  return {
    feature: "no_show",
    graceHours: graceHours(),
    candidates: candidates.length,
    forfeited,
    armed,
    ...(armed ? {} : { note: "dry run — set NO_SHOW_AUTOFORFEIT=1 to forfeit" }),
  };
}
