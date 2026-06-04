import type { SupabaseClient } from "@supabase/supabase-js";
import { listTeamMembers, listPayments, isSquareConfigured } from "./client";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Pulls Square team members + payments and mirrors them into Supabase.
 * - Team members are cached; existing member->artist mappings are preserved.
 * - Each completed payment becomes a `sales` row, attributed to an artist via
 *   the mapping (unmapped/no-member sales stay artist_id = null = "Unassigned").
 * - Incremental: re-pulls a 1-day overlap; first run looks back 31 days.
 *
 * Runs server-side with an authenticated owner client (RLS owner-write).
 */
export async function syncSquare(supabase: SupabaseClient) {
  if (!isSquareConfigured) throw new Error("Square is not connected");

  // 1. Team members -> upsert, preserving any artist mapping already set.
  const members = await listTeamMembers();
  if (members.length) {
    const { data: existing } = await supabase
      .from("square_team_members")
      .select("square_id, artist_id");
    const prior = new Map((existing || []).map((r) => [r.square_id, r.artist_id]));
    await supabase.from("square_team_members").upsert(
      members.map((m) => ({
        square_id: m.id,
        name: m.name,
        artist_id: prior.get(m.id) ?? null,
        last_synced: new Date().toISOString(),
      })),
      { onConflict: "square_id" },
    );
  }

  // Current member -> artist mapping.
  const { data: maps } = await supabase
    .from("square_team_members")
    .select("square_id, artist_id");
  const memberToArtist = new Map(
    (maps || []).map((r) => [r.square_id, r.artist_id as string | null]),
  );

  // 2. Window.
  const { data: state } = await supabase
    .from("square_sync")
    .select("last_synced_at")
    .eq("id", 1)
    .maybeSingle();
  const begin = state?.last_synced_at
    ? new Date(new Date(state.last_synced_at).getTime() - DAY)
    : new Date(Date.now() - 31 * DAY);

  // 3. Payments -> sales.
  const payments = (await listPayments(begin.toISOString())).filter(
    (p) => p.status === "COMPLETED",
  );
  if (payments.length) {
    const rows = payments.map((p) => ({
      id: p.id,
      created_at: p.createdAt,
      service_cents: p.serviceCents,
      tip_cents: p.tipCents,
      method: p.method,
      team_member_id: p.teamMemberId,
      artist_id: p.teamMemberId ? memberToArtist.get(p.teamMemberId) ?? null : null,
      location_id: p.locationId,
      status: p.status,
      synced_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from("sales").upsert(rows.slice(i, i + 200), { onConflict: "id" });
    }
  }

  // 4. Re-resolve artist_id for all sales from the current mapping, so mapping
  //    changes propagate to already-synced sales.
  for (const [squareId, artistId] of memberToArtist) {
    if (artistId)
      await supabase.from("sales").update({ artist_id: artistId }).eq("team_member_id", squareId);
  }

  // 5. Bookkeeping.
  const result = `Synced ${payments.length} payments, ${members.length} team members`;
  await supabase
    .from("square_sync")
    .update({ last_synced_at: new Date().toISOString(), last_result: result })
    .eq("id", 1);

  return { payments: payments.length, members: members.length, result };
}
