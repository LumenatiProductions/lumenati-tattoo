// In-lane Square reader for the Bookings feature — the Square Appointments
// (Bookings) API. The shared lib/square/client.ts covers locations / team
// members / payments but not appointments, so this feature owns its thin
// read-only Appointments client rather than editing the shared file (same
// pattern as lib/clients/square.ts). Same server-only token, same rule: we only
// ever GET, never write back to Square.

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const ENV = process.env.SQUARE_ENV || "production";
const VERSION = process.env.SQUARE_VERSION || "2025-04-16";

const BASE =
  ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

export const isSquareConfigured = Boolean(TOKEN);

async function sq(path: string) {
  if (!TOKEN) throw new Error("Square not configured");
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.errors?.[0]?.detail || res.statusText;
    throw new Error(`Square ${res.status}: ${msg}`);
  }
  return body;
}

// Our normalized status vocabulary (matches bookings.status). Square has no
// "completed" — an accepted appointment simply passes; the nightly job is what
// flips a past `scheduled` to `no_show` for review, and the desk marks completed.
export type BookingStatus = "scheduled" | "completed" | "no_show" | "cancelled";

// Square Appointments statuses -> ours. ACCEPTED/PENDING are still upcoming work.
function normalizeStatus(raw?: string): BookingStatus {
  switch (raw) {
    case "NO_SHOW":
      return "no_show";
    case "CANCELLED_BY_CUSTOMER":
    case "CANCELLED_BY_SELLER":
    case "DECLINED":
      return "cancelled";
    default:
      return "scheduled"; // ACCEPTED, PENDING, or anything new Square adds
  }
}

export interface SquareAppointment {
  id: string;
  customerId: string | null; // Square customer id == our clients.id
  teamMemberId: string | null; // first segment's provider; mapped to artist via square_team_members
  startAt: string; // ISO timestamp
  endAt: string | null; // start + summed segment durations
  status: BookingStatus;
  note: string; // seller note first, else customer note
  createdAt: string;
}

interface RawSegment {
  duration_minutes?: number;
  team_member_id?: string;
}
interface RawBooking {
  id: string;
  status?: string;
  start_at?: string;
  customer_id?: string;
  customer_note?: string;
  seller_note?: string;
  created_at?: string;
  appointment_segments?: RawSegment[];
}

function endFrom(startAt: string | undefined, segs: RawSegment[]): string | null {
  if (!startAt) return null;
  const mins = segs.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  if (!mins) return null;
  return new Date(new Date(startAt).getTime() + mins * 60_000).toISOString();
}

/**
 * Square Appointments in a time window, paging through every result and across
 * every location (a single shop usually has one, but we don't assume). Returns
 * the normalized shape the sync job writes into `bookings`. Window bounds are
 * ISO timestamps; Square requires start_at_max within ~31 days of start_at_min,
 * so the caller pages by month for a wider pull.
 */
export async function listAppointments(
  startAtMin: string,
  startAtMax: string,
): Promise<SquareAppointment[]> {
  // Discover locations once (the Bookings list requires a location_id).
  const locBody = await sq("/v2/locations");
  const locationIds: string[] = (locBody.locations || [])
    .map((l: { id?: string }) => l.id)
    .filter(Boolean);
  if (!locationIds.length) return [];

  const out: SquareAppointment[] = [];
  for (const locationId of locationIds) {
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({
        location_id: locationId,
        start_at_min: startAtMin,
        start_at_max: startAtMax,
        limit: "100",
      });
      if (cursor) params.set("cursor", cursor);
      const body = await sq(`/v2/bookings?${params.toString()}`);
      for (const b of (body.bookings || []) as RawBooking[]) {
        const segs = b.appointment_segments || [];
        out.push({
          id: b.id,
          customerId: b.customer_id || null,
          teamMemberId: segs[0]?.team_member_id || null,
          startAt: b.start_at || new Date(b.created_at || Date.now()).toISOString(),
          endAt: endFrom(b.start_at, segs),
          status: normalizeStatus(b.status),
          note: (b.seller_note || b.customer_note || "").trim(),
          createdAt: b.created_at || new Date().toISOString(),
        });
      }
      cursor = body.cursor;
    } while (cursor);
  }
  return out;
}
