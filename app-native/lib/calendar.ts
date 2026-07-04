import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";

// Phone-native calendar sync (EventKit on iOS). Artists are phone-only, so we
// write bookings straight into the calendar the artist already uses — which on
// iOS aggregates their iCloud/Google/etc. accounts — and read across all their
// calendars to warn about outside conflicts. No server, no OAuth tokens.
//
// State is kept on-device:
//   ENABLED_KEY  -> "1" once the artist turns sync on
//   CAL_KEY      -> the calendar id we write into
//   MAP_KEY      -> { [bookingId]: eventId } so we can update/remove later

const ENABLED_KEY = "lumenati.calendar.enabled";
const CAL_KEY = "lumenati.calendar.id";
const MAP_KEY = "lumenati.calendar.eventMap";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

export type BookingEvent = {
  id: string;
  title: string;
  startISO: string;
  endISO: string | null;
  notes?: string;
  location?: string;
};

async function readMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(MAP_KEY)) || "{}");
  } catch {
    return {};
  }
}
async function writeMap(m: Record<string, string>) {
  await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m));
}

/** True once the artist has turned calendar sync on. */
export async function isCalendarEnabled(): Promise<boolean> {
  if (!isNative) return false;
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
}

/** Ask for permission and pick a writable calendar. Returns false if denied. */
export async function enableCalendar(): Promise<boolean> {
  if (!isNative) return false;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return false;
  const calId = await resolveCalendarId();
  if (!calId) return false;
  await AsyncStorage.multiSet([
    [ENABLED_KEY, "1"],
    [CAL_KEY, calId],
  ]);
  return true;
}

export async function disableCalendar() {
  await AsyncStorage.multiRemove([ENABLED_KEY, CAL_KEY]);
}

/** The calendar we write into: the artist's saved choice, else the default. */
async function resolveCalendarId(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(CAL_KEY);
  if (saved) return saved;
  try {
    if (Platform.OS === "ios") {
      const def = await Calendar.getDefaultCalendarAsync();
      if (def?.id) return def.id;
    }
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.find((c) => c.allowsModifications);
    return writable?.id ?? null;
  } catch {
    return null;
  }
}

/** Writable calendars, so the artist can choose which one to sync into. */
export async function listWritableCalendars(): Promise<{ id: string; title: string; source: string }[]> {
  if (!isNative) return [];
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status !== "granted") return [];
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals
    .filter((c) => c.allowsModifications)
    .map((c) => ({ id: c.id, title: c.title, source: (c as any).source?.name ?? "" }));
}

export async function setCalendarId(id: string) {
  await AsyncStorage.setItem(CAL_KEY, id);
}

/** Create or update the calendar event for a booking. No-op if sync is off. */
export async function syncBooking(b: BookingEvent): Promise<void> {
  if (!(await isCalendarEnabled())) return;
  const calId = await resolveCalendarId();
  if (!calId) return;
  const start = new Date(b.startISO);
  const end = b.endISO ? new Date(b.endISO) : new Date(start.getTime() + 60 * 60 * 1000);
  const details: Partial<Calendar.Event> = {
    title: b.title,
    startDate: start,
    endDate: end,
    notes: b.notes,
    location: b.location,
    url: `lumenati://booking/${b.id}`,
    timeZone: undefined,
  };
  const map = await readMap();
  const existing = map[b.id];
  try {
    if (existing) {
      await Calendar.updateEventAsync(existing, details);
    } else {
      const eventId = await Calendar.createEventAsync(calId, details);
      map[b.id] = eventId;
      await writeMap(map);
    }
  } catch {
    // event may have been deleted in the calendar app; recreate once
    if (existing) {
      try {
        const eventId = await Calendar.createEventAsync(calId, details);
        map[b.id] = eventId;
        await writeMap(map);
      } catch {
        /* give up silently — sync is best-effort */
      }
    }
  }
}

/** Remove a booking's calendar event (on cancel/delete). */
export async function removeBooking(bookingId: string): Promise<void> {
  if (!isNative) return;
  const map = await readMap();
  const eventId = map[bookingId];
  if (!eventId) return;
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    /* already gone */
  }
  delete map[bookingId];
  await writeMap(map);
}

/** Push every booking to the calendar (call on app foreground / after loads). */
export async function syncAll(bookings: BookingEvent[]): Promise<void> {
  if (!(await isCalendarEnabled())) return;
  for (const b of bookings) await syncBooking(b);
}

export type Conflict = { title: string; startISO: string; endISO: string };

/**
 * Outside commitments overlapping [startISO, endISO], read across all the
 * artist's calendars. Excludes our own booking events and all-day items.
 */
export async function findOutsideConflicts(
  startISO: string,
  endISO: string,
): Promise<Conflict[]> {
  if (!isNative) return [];
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status !== "granted") return [];
  const start = new Date(startISO);
  const end = new Date(endISO);
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const ids = cals.map((c) => c.id);
  if (!ids.length) return [];
  const ourEventIds = new Set(Object.values(await readMap()));
  const events = await Calendar.getEventsAsync(ids, start, end);
  return events
    .filter((e) => !e.allDay && !ourEventIds.has(e.id))
    .filter((e) => {
      const es = new Date(e.startDate).getTime();
      const ee = new Date(e.endDate).getTime();
      return es < end.getTime() && ee > start.getTime(); // real overlap
    })
    .map((e) => ({
      title: e.title || "Busy",
      startISO: new Date(e.startDate).toISOString(),
      endISO: new Date(e.endDate).toISOString(),
    }));
}
