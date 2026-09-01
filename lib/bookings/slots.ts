import type { SupabaseClient } from "@supabase/supabase-js";
import { shopDay, shopDayStartUtc } from "@/lib/dates";

// Open times for self-serve booking. The artist's weekly hours template
// (shop wall clock) minus what's already on the book = the slots a client can
// pick. Everything here is server-side (service role) so the public page never
// needs a read on bookings.

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// {"mon":[["11:00","19:00"]], ...}; a missing or empty day is a day off.
export type Hours = Partial<Record<DayKey, [string, string][]>>;

export type SlotArtist = {
  id: string;
  hours: Hours | null;
  session_minutes: number | null;
  deposit_cents: number | null;
};

const TZ = () => process.env.SHOP_TIMEZONE || "America/Denver";
// Nobody books a chair for later today with less notice than this.
const LEAD_MS = 2 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const dayKeyOf = (day: string): DayKey => {
  // day is YYYY-MM-DD on the shop clock; noon UTC of that date is the same
  // calendar day in every timezone the shop could plausibly be in.
  const idx = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return DAY_KEYS[(idx + 6) % 7];
};

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
};

export const sessionMinutesOf = (a: Pick<SlotArtist, "session_minutes">): number =>
  Math.max(30, Math.min(12 * 60, Number(a.session_minutes) || 120));

// Keep only well-formed windows; everything else is a day off.
export function cleanHours(input: unknown): Hours | null {
  if (!input || typeof input !== "object") return null;
  const out: Hours = {};
  let any = false;
  for (const k of DAY_KEYS) {
    const raw = (input as Record<string, unknown>)[k];
    if (!Array.isArray(raw)) continue;
    const windows: [string, string][] = [];
    for (const w of raw) {
      if (!Array.isArray(w) || w.length !== 2) continue;
      const [s, e] = w as [unknown, unknown];
      if (typeof s !== "string" || typeof e !== "string") continue;
      const sm = minutesOf(s);
      const em = minutesOf(e);
      if (sm == null || em == null || em <= sm) continue;
      windows.push([s, e]);
      any = true;
    }
    if (windows.length) out[k] = windows;
  }
  return any ? out : null;
}

// Every start time the template allows on one shop day, as UTC ISO instants.
// A slot must fit its whole session inside a window.
export function templateStarts(hours: Hours, day: string, sessionMinutes: number, tz = TZ()): string[] {
  const windows = hours[dayKeyOf(day)] ?? [];
  if (!windows.length) return [];
  const dayStart = Date.parse(shopDayStartUtc(day, tz));
  const out: string[] = [];
  for (const [s, e] of windows) {
    const sm = minutesOf(s);
    const em = minutesOf(e);
    if (sm == null || em == null) continue;
    for (let m = sm; m + sessionMinutes <= em; m += sessionMinutes) {
      out.push(new Date(dayStart + m * 60000).toISOString());
    }
  }
  return out;
}

type Busy = { s: number; e: number };

// What's already on the artist's book between two instants: scheduled
// sessions plus live holds (an expired hold is free again).
export async function busyRanges(
  db: SupabaseClient,
  artistId: string,
  fromIso: string,
  toIso: string,
): Promise<Busy[]> {
  const now = Date.now();
  const { data } = await db
    .from("bookings")
    .select("starts_at, ends_at, status, hold_expires_at")
    .eq("artist_id", artistId)
    .in("status", ["scheduled", "held"])
    .gte("starts_at", new Date(Date.parse(fromIso) - 12 * 60 * 60 * 1000).toISOString())
    .lte("starts_at", toIso);
  const out: Busy[] = [];
  for (const row of (data ?? []) as { starts_at: string; ends_at: string | null; status: string; hold_expires_at: string | null }[]) {
    if (row.status === "held" && row.hold_expires_at && Date.parse(row.hold_expires_at) < now) continue;
    const s = Date.parse(row.starts_at);
    const e = row.ends_at ? Date.parse(row.ends_at) : s + DEFAULT_DURATION_MS;
    out.push({ s, e });
  }
  return out;
}

export type OpenDay = { day: string; slots: string[] };

// The client-facing answer: for each of the next `days` shop days, the start
// times still open. Days with nothing open are listed with an empty array so
// the picker can grey them out instead of guessing.
export async function openSlots(
  db: SupabaseClient,
  artist: SlotArtist,
  fromDay: string,
  days: number,
): Promise<OpenDay[]> {
  const hours = cleanHours(artist.hours);
  if (!hours) return [];
  const session = sessionMinutesOf(artist);
  const tz = TZ();
  const dayList: string[] = [];
  const cursor = new Date(`${fromDay}T12:00:00Z`);
  for (let i = 0; i < days; i++) {
    dayList.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const fromIso = shopDayStartUtc(dayList[0], tz);
  const toIso = new Date(Date.parse(shopDayStartUtc(dayList[dayList.length - 1], tz)) + 24 * 60 * 60 * 1000).toISOString();
  const busy = await busyRanges(db, artist.id, fromIso, toIso);
  const earliest = Date.now() + LEAD_MS;
  const sessionMs = session * 60000;
  return dayList.map((day) => ({
    day,
    slots: templateStarts(hours, day, session, tz).filter((iso) => {
      const s = Date.parse(iso);
      if (s < earliest) return false;
      const e = s + sessionMs;
      return !busy.some((b) => s < b.e && b.s < e);
    }),
  }));
}

// Is this exact start still bookable? Recomputed server-side at write time so
// a stale picker can never book over someone.
export async function slotIsOpen(db: SupabaseClient, artist: SlotArtist, startsAt: string): Promise<boolean> {
  const t = Date.parse(startsAt);
  if (Number.isNaN(t)) return false;
  const day = shopDay(new Date(t));
  const [only] = await openSlots(db, artist, day, 1);
  return !!only && only.slots.includes(new Date(t).toISOString());
}

// Best-effort sweep: holds nobody paid for go back to open. Runs from the
// slot API so the book self-heals without a cron.
export async function expireStaleHolds(db: SupabaseClient): Promise<void> {
  await db
    .from("bookings")
    .update({ status: "cancelled", notes: "Held for a self-serve booking; the deposit was never paid." })
    .eq("status", "held")
    .lt("hold_expires_at", new Date().toISOString());
}
