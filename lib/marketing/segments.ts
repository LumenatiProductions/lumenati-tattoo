// Marketing segments, SERVER ONLY: computed with the service-role client and
// always shop-scoped. The windows mirror the Clients page "Bring them back"
// cards exactly (birthday month = this month, due to rebook = last visit
// 60 to 120 days ago, lapsed = 120 to 365) so the numbers here never disagree with
// the numbers there. Consent gates everything: a client is only textable /
// emailable once marketing_ok is true (set from the public booking form).
//
// Degrades gracefully: if the marketing migration hasn't landed yet (no
// marketing_ok column), every client reads as not-consented: counts show
// zero reachable instead of the API erroring.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/sms";

export type SegmentKey = "all" | "birthdays" | "rebook" | "lapsed";
export type BlastChannel = "email" | "sms";

export const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "all", label: "All clients" },
  { key: "birthdays", label: "Birthdays this month" },
  { key: "rebook", label: "Due to rebook" },
  { key: "lapsed", label: "Lapsed" },
];

export const isSegmentKey = (k: unknown): k is SegmentKey =>
  typeof k === "string" && SEGMENTS.some((s) => s.key === k);

export type SegmentClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  last_seen: string | null;
  marketing_ok: boolean;
};

const missingColumn = (msg: string) =>
  /column .* does not exist|42703/i.test(msg);

// Page through the shop's clients (PostgREST caps a single read at 1000 rows).
// If marketing_ok isn't a column yet, re-read without it and treat everyone as
// not-consented. Any other failure degrades to an empty list, never a 500.
async function loadClients(admin: SupabaseClient, shopId: string): Promise<SegmentClient[]> {
  const cols = "id, first_name, last_name, email, phone, birthdate, last_seen";
  const fetchAll = async (withConsent: boolean) => {
    const out: SegmentClient[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await admin
        .from("clients")
        .select(withConsent ? `${cols}, marketing_ok` : cols)
        .eq("shop_id", shopId)
        .order("id")
        .range(from, from + page - 1);
      if (error) throw error;
      for (const r of (data ?? []) as unknown as (Omit<SegmentClient, "marketing_ok"> & {
        marketing_ok?: boolean;
      })[]) {
        out.push({ ...r, marketing_ok: withConsent ? !!r.marketing_ok : false });
      }
      if (!data || data.length < page) return out;
    }
  };

  try {
    return await fetchAll(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    if (!missingColumn(msg)) return [];
    try {
      return await fetchAll(false);
    } catch {
      return [];
    }
  }
}

// Same math as the Clients page retention buckets.
const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
};

function inSegment(c: SegmentClient, key: SegmentKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "birthdays":
      return (
        !!c.birthdate &&
        new Date(`${c.birthdate.slice(0, 10)}T00:00:00`).getMonth() === new Date().getMonth()
      );
    case "rebook": {
      const d = daysSince(c.last_seen);
      return d !== null && d >= 60 && d < 120;
    }
    case "lapsed": {
      const d = daysSince(c.last_seen);
      return d !== null && d >= 120 && d < 365;
    }
  }
}

/** Consent + a working address for the channel. */
export function reachable(c: SegmentClient, channel: BlastChannel): boolean {
  if (!c.marketing_ok) return false;
  return channel === "sms" ? !!normalizePhone(c.phone) : !!c.email;
}

/** Every client in the segment, consented or not (the blast route needs both
 *  halves to count skips honestly). */
export async function segmentClients(
  admin: SupabaseClient,
  shopId: string,
  key: SegmentKey,
): Promise<SegmentClient[]> {
  const all = await loadClients(admin, shopId);
  return all.filter((c) => inSegment(c, key));
}

/** The consented, contactable members for one channel: the actual send list. */
export async function segmentMembers(
  admin: SupabaseClient,
  shopId: string,
  key: SegmentKey,
  channel: BlastChannel,
): Promise<SegmentClient[]> {
  return (await segmentClients(admin, shopId, key)).filter((c) => reachable(c, channel));
}

export type SegmentCount = {
  key: SegmentKey;
  label: string;
  total: number;
  textable: number;
  emailable: number;
};

/** One pass over the roster, tallied per segment. */
export async function segmentCounts(
  admin: SupabaseClient,
  shopId: string,
): Promise<SegmentCount[]> {
  const all = await loadClients(admin, shopId);
  return SEGMENTS.map(({ key, label }) => {
    const members = all.filter((c) => inSegment(c, key));
    return {
      key,
      label,
      total: members.length,
      textable: members.filter((c) => reachable(c, "sms")).length,
      emailable: members.filter((c) => reachable(c, "email")).length,
    };
  });
}
