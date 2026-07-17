import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import {
  enableCalendar,
  disableCalendar,
  isCalendarEnabled,
  syncAll,
  findOutsideConflicts,
  listWritableCalendars,
  getCalendarId,
  changeCalendar,
  type Conflict,
} from "@/lib/calendar";
import { theme } from "@/lib/theme";
import { ActionPill, Badge, Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";
import DateTimeField from "@/components/DateTimeField";
import BooksToggle from "@/components/BooksToggle";
import { uid } from "@/lib/ids";
import { apiPatch, apiPost } from "@/lib/appApi";
import { findClash } from "@/lib/clash";

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  service_desc: string;
  client_id: string | null;
  artist_id: string | null;
  deposit_cents: number;
  deposit_status: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
};

const HOUR_MS = 3_600_000;

// Calendar sync Phase 2: before booking/moving a slot, peek at this phone's
// calendars for outside commitments (gym, dentist, school run) over the window.
// Soft warning only — the booking can always go through. Only meaningful when
// the person on THIS phone is the artist being booked (their calendars live
// here); booking someone else skips silently. Resolves true to proceed.
async function confirmOutsideConflicts(
  artistId: string | null,
  myArtistId: string | null,
  startsAt: string,
  endsAt: string | null,
  verb: "Book" | "Save" = "Book",
): Promise<boolean> {
  if (!artistId || !myArtistId || artistId !== myArtistId) return true;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return true;
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + HOUR_MS);
  let conflicts: Conflict[] = [];
  try {
    conflicts = await findOutsideConflicts(start.toISOString(), end.toISOString());
  } catch {
    return true; // calendar read is best-effort, never blocks the desk
  }
  if (conflicts.length === 0) return true;
  const shown = conflicts
    .slice(0, 2)
    .map((c) => `"${c.title}" ${clock(c.startISO)} to ${clock(c.endISO)}`)
    .join(" and ");
  const extra = conflicts.length > 2 ? ` plus ${conflicts.length - 2} more` : "";
  return new Promise((resolve) => {
    Alert.alert("Already on your calendar", `This time overlaps ${shown}${extra}. ${verb} anyway?`, [
      { text: "Pick another time", style: "cancel", onPress: () => resolve(false) },
      { text: `${verb} anyway`, onPress: () => resolve(true) },
    ]);
  });
}

// Which logo to show for a calendar account (iCloud/Google/Outlook/local).
function calProviderIcon(source?: string): keyof typeof Ionicons.glyphMap {
  const s = (source ?? "").toLowerCase();
  if (s.includes("google") || s.includes("gmail")) return "logo-google";
  if (s.includes("outlook") || s.includes("exchange")) return "logo-microsoft";
  if (s.includes("icloud") || s.includes("default")) return "logo-apple";
  return "calendar-outline";
}

const STATUS_TONE: Record<string, string> = {
  scheduled: theme.textDim,
  completed: theme.good,
  no_show: "#fb7185",
  cancelled: theme.textFaint,
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const todayKey = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Bookings ported to the app (POS 6e). Read is RLS-scoped (artists see their own);
// staff can mark complete / no-show by writing under RLS — no API needed.
export default function Bookings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, email, shopId } = useAuth();
  const { preview } = usePreview();
  // Previewing an artist = being that artist on this screen too: their name
  // only in the picker, no staff row actions (bug 1db64bc3).
  const isStaff = role === "owner" && !preview;

  const [rows, setRows] = useState<Booking[]>([]);
  const [names, setNames] = useState<{ c: Map<string, string>; a: Map<string, string> }>({ c: new Map(), a: new Map() });
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [recentClients, setRecentClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  // /bookings?new=1 (the artist home's New booking button) opens the form.
  const params = useLocalSearchParams<{ new?: string }>();
  const [adding, setAdding] = useState(params.new === "1");
  const [editId, setEditId] = useState<string | null>(null);
  const [calOn, setCalOn] = useState(false);
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [calChoices, setCalChoices] = useState<{ id: string; title: string; source: string }[]>([]);
  const [calId, setCalId] = useState<string | null>(null);
  const [pickingCal, setPickingCal] = useState(false);

  useEffect(() => {
    isCalendarEnabled().then(setCalOn);
  }, []);

  // Which artist is holding this phone (profiles.artist_id). Gates the
  // outside-conflict check: only your own calendar lives on your phone.
  useEffect(() => {
    if (!email) return;
    supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
  }, [email]);

  // When sync is on, know which calendar we write into and what else is
  // available, so the artist can retarget (e.g. keep work off the family one).
  useEffect(() => {
    if (!calOn) {
      setPickingCal(false);
      return;
    }
    Promise.all([listWritableCalendars(), getCalendarId()]).then(([cals, id]) => {
      setCalChoices(cals);
      setCalId(id);
    });
  }, [calOn]);

  const pickCalendar = async (id: string) => {
    setPickingCal(false);
    if (id === calId) return;
    await changeCalendar(id); // clears old events; the sync effect below rewrites
    setCalId(id);
  };

  const toggleCal = async () => {
    if (calOn) {
      await disableCalendar();
      setCalOn(false);
      return;
    }
    const ok = await enableCalendar();
    setCalOn(ok);
    if (!ok) {
      Alert.alert(
        "Calendar access needed",
        "Turn on Calendar access for Lumenati in Settings to sync your bookings.",
      );
    }
  };

  const load = useCallback(async () => {
    if (!shopId) return;
    const start = todayKey();
    let q = supabase
      .from("bookings")
      .select("id, starts_at, ends_at, status, service_desc, client_id, artist_id, deposit_cents, deposit_status, confirmed_at, checked_in_at")
      .gte("starts_at", start)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(80);
    // Owner previewing an artist sees only that artist's book.
    if (preview) q = q.eq("artist_id", preview.artistId);
    const { data } = await q;
    const bookings = (data ?? []) as Booking[];
    setRows(bookings);

    const cIds = [...new Set(bookings.map((b) => b.client_id).filter(Boolean) as string[])];
    const aIds = [...new Set(bookings.map((b) => b.artist_id).filter(Boolean) as string[])];
    const [cRes, aRes] = await Promise.all([
      cIds.length ? supabase.from("clients").select("id, first_name, last_name").in("id", cIds) : Promise.resolve({ data: [] }),
      aIds.length ? supabase.from("artists").select("id, name").in("id", aIds) : Promise.resolve({ data: [] }),
    ]);
    setNames({
      c: new Map(((cRes.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()])),
      a: new Map(((aRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name])),
    });

    // Pickers for the create form. RLS scopes the client list — staff see
    // everyone, an artist sees only the clients they've had a booking with.
    const [allArtists, clientBook] = await Promise.all([
      supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
      // The whole book (RLS keeps an artist's list to their own clients) —
      // the form searches it instead of showing a pill sampler (bug 1db64bc3).
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(500),
    ]);
    setArtists((allArtists.data ?? []) as { id: string; name: string }[]);
    setRecentClients(
      ((clientBook.data ?? []) as { id: string; first_name: string; last_name: string }[])
        .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))
        .filter((c) => c.name && c.name.toLowerCase() !== "client"),
    );
    setLoading(false);
  }, [preview, shopId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the phone calendar in sync with the artist's scheduled bookings.
  useEffect(() => {
    if (!calOn) return;
    const events = rows
      .filter((b) => b.status === "scheduled")
      .map((b) => ({
        id: b.id,
        title: `${b.client_id ? names.c.get(b.client_id) ?? "Client" : "Walk-in"}${b.service_desc ? " · " + b.service_desc : ""}`,
        startISO: b.starts_at,
        endISO: b.ends_at,
        notes: "Lumenati booking",
        location: "Lumenati Tattoo",
      }));
    if (events.length) syncAll(events);
  }, [calOn, rows, names, calId]);

  // The no-show defense moment: a cancelled/no-showed booking frees a slot,
  // so immediately ask "who's waiting?" and offer the one-tap fill.
  const [freed, setFreed] = useState<{ startsAt: string; artistId: string | null; waiting: number } | null>(null);
  const [offering, setOffering] = useState(false);
  const [offerNote, setOfferNote] = useState<string | null>(null);
  const checkWaitlist = async (b: Booking) => {
    setOfferNote(null);
    let q = supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("active", true);
    if (b.artist_id) q = q.or(`artist_id.eq.${b.artist_id},artist_id.is.null`);
    const { count } = await q;
    if (count) setFreed({ startsAt: b.starts_at, artistId: b.artist_id, waiting: count });
  };

  // First-come-first-served: text everyone waiting a claim link; the first
  // tap books itself, the rest see "you just missed it". Server does the
  // texting + the race (see /api/waitlist/offer and /api/claim).
  const offerSlot = async () => {
    if (!freed?.artistId || offering) return;
    setOffering(true);
    const r = await apiPost<{ texted: number; waiting: number; smsReady: boolean; note?: string }>(
      "/api/waitlist/offer",
      { artistId: freed.artistId, startsAt: freed.startsAt },
    );
    setOffering(false);
    if (!r.ok) {
      setOfferNote(r.error ?? "Could not send the offer.");
      return;
    }
    const d = r.data!;
    if (!d.smsReady) {
      setOfferNote("Texting isn't switched on yet (Twilio) — fill it by hand for now.");
    } else if (d.texted === 0) {
      setOfferNote(d.note ?? "No texts went out — fill it by hand for now.");
    } else {
      setOfferNote(`Texted ${d.texted} ${d.texted === 1 ? "person" : "people"} — first tap gets it. You'll see it land on the books.`);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const b = rows.find((x) => x.id === id);
    setRows((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) {
      load(); // roll back to server truth
      return;
    }
    if (b && (status === "cancelled" || status === "no_show")) checkWaitlist(b);
  };

  const groups = useMemo(() => {
    const today: Booking[] = [];
    const upcoming: Booking[] = [];
    const tk = todayKey();
    for (const b of rows) (b.starts_at.slice(0, 10) === tk ? today : upcoming).push(b);
    return { today, upcoming };
  }, [rows]);

  const clientName = (id: string | null) => (id ? names.c.get(id) ?? "Client" : "Walk-in");
  const artistName = (id: string | null) => (id ? names.a.get(id) ?? "" : "");

  const Row = ({ b }: { b: Booking }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.who}>{clientName(b.client_id)}</Text>
        <Text style={styles.sub}>
          {clock(b.starts_at)}
          {artistName(b.artist_id) ? ` · ${artistName(b.artist_id)}` : ""}
          {b.service_desc ? ` · ${b.service_desc}` : ""}
        </Text>
        {isStaff && b.status === "scheduled" && (
          <View style={styles.actions}>
            <ActionPill label="Complete" onPress={() => setStatus(b.id, "completed")} />
            <ActionPill label="No-show" onPress={() => setStatus(b.id, "no_show")} />
            <ActionPill label="Edit" onPress={() => setEditId(b.id)} />
          </View>
        )}
        {!isStaff && b.status === "scheduled" && b.artist_id === myArtistId && (
          <View style={styles.actions}>
            {/* Artists close out their own chair — no front desk. RLS + a DB
                guard allow exactly these transitions on their own bookings. */}
            <ActionPill label="Complete" onPress={() => setStatus(b.id, "completed")} />
            <ActionPill
              label="No-show"
              onPress={() =>
                Alert.alert(
                  "Mark this a no-show?",
                  b.deposit_status === "held"
                    ? "They didn't make it — their deposit stays with the shop."
                    : "They didn't make it. If anyone's waiting you can offer the freed slot.",
                  [
                    { text: "Keep it", style: "cancel" },
                    { text: "No-show", style: "destructive", onPress: () => setStatus(b.id, "no_show") },
                  ],
                )
              }
            />
            <ActionPill
              label="Cancel"
              onPress={() =>
                Alert.alert(
                  "Cancel this booking?",
                  b.deposit_status === "held"
                    ? "Their deposit goes back to them, and if anyone's waiting you can offer the freed slot."
                    : "If anyone's waiting you can offer the freed slot.",
                  [
                    { text: "Keep it", style: "cancel" },
                    { text: "Cancel booking", style: "destructive", onPress: () => setStatus(b.id, "cancelled") },
                  ],
                )
              }
            />
          </View>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        {b.checked_in_at ? <Badge label="Here" tone="good" /> : null}
        {b.status === "scheduled" && b.confirmed_at ? <Badge label="Confirmed" tone="good" /> : null}
        {b.deposit_status === "held" ? <Badge label="Deposit" tone="brand" /> : null}
        <Badge
          label={b.status.replace("_", " ")}
          tone={b.status === "completed" ? "good" : b.status === "no_show" ? "bad" : b.status === "cancelled" ? "neutral" : "brand"}
        />
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Bookings", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <BooksToggle />
        {freed && (
          <Card style={styles.freedCard}>
            <Text style={styles.freedTitle}>
              {dayLabel(freed.startsAt)} at {clock(freed.startsAt)} just opened up
            </Text>
            <Text style={styles.freedSub}>
              {freed.waiting} {freed.waiting === 1 ? "person is" : "people are"} on the waitlist — fill it before it goes cold.
            </Text>
            <View style={{ height: 10 }} />
            {freed.artistId ? (
              <Button
                label={offering ? "Texting the list…" : "Text the list — first tap gets it"}
                onPress={offerSlot}
                disabled={offering}
              />
            ) : (
              <Button
                label="Fill it from the waitlist"
                onPress={() => {
                  setFreed(null);
                  router.push(`/waitlist?slot=${encodeURIComponent(freed.startsAt)}`);
                }}
              />
            )}
            {offerNote && <Text style={styles.freedNote}>{offerNote}</Text>}
            <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
              {freed.artistId ? (
                <ActionPill
                  label="Fill it myself"
                  onPress={() => {
                    setFreed(null);
                    router.push(`/waitlist?slot=${encodeURIComponent(freed.startsAt)}&artist=${freed.artistId}`);
                  }}
                />
              ) : null}
              <ActionPill label="Let it go" onPress={() => setFreed(null)} />
            </View>
          </Card>
        )}
        {myArtistId && !preview && <UpForGrabs myArtistId={myArtistId} onBooked={load} />}
        <View style={{ marginBottom: 12 }}>
          <Button label={adding ? "Cancel" : "New booking"} tone={adding || freed ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />
        </View>
        {adding && (
          <NewBooking
            // An artist books themselves only — the RLS insert policy enforces
            // it, the picker just doesn't offer anyone else.
            artists={isStaff ? artists : artists.filter((a) => a.id === (preview?.artistId ?? myArtistId))}
            clients={recentClients}
            myArtistId={myArtistId}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        )}

        {loading ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.section}>Today</Text>
            <Card style={{ padding: 0 }}>
              {groups.today.length === 0 ? (
                <Text style={styles.empty}>Nothing today.</Text>
              ) : (
                groups.today.map((b, i) => (
                  <View key={b.id} style={i > 0 ? styles.border : undefined}>
                    <Row b={b} />
                  </View>
                ))
              )}
            </Card>

            <Text style={styles.section}>Upcoming</Text>
            <Card style={{ padding: 0 }}>
              {groups.upcoming.length === 0 ? (
                <Text style={styles.empty}>Nothing on the books.</Text>
              ) : (
                groups.upcoming.map((b, i) => (
                  <View key={b.id} style={i > 0 ? styles.border : undefined}>
                    <Text style={styles.day}>{dayLabel(b.starts_at)}</Text>
                    <Row b={b} />
                  </View>
                ))
              )}
            </Card>

            {/* Calendar sync: a plain card at the bottom, out of the daily flow.
                No modal (which deadlocked with the OS permission prompt), no glass. */}
            <Text style={styles.section}>Calendar sync</Text>
            <Pressable onPress={toggleCal} style={styles.syncCard}>
              <Ionicons name={calOn ? "calendar" : "calendar-outline"} size={20} color={calOn ? theme.good : theme.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={styles.syncCardTitle}>{calOn ? "Synced" : "Not synced"}</Text>
                <Text style={styles.syncCardSub}>
                  {calOn
                    ? `Bookings land in ${calChoices.find((c) => c.id === calId)?.title ?? "your calendar"} automatically.`
                    : "Add every booking to your phone's calendar automatically."}
                </Text>
              </View>
              <Text style={[styles.syncCardAction, { color: calOn ? theme.textFaint : theme.brand }]}>
                {calOn ? "Turn off" : "Turn on"}
              </Text>
            </Pressable>
            {calOn && calChoices.length > 1 && (
              <Card style={{ padding: 0, marginTop: 8 }}>
                {calChoices.map((c) => (
                  <Pressable key={c.id} onPress={() => pickCalendar(c.id)} style={styles.calOption}>
                    <Ionicons name={calProviderIcon(c.source)} size={15} color={c.id === calId ? theme.good : theme.textDim} />
                    <Text style={[styles.calOptionText, c.id === calId && { color: theme.good, fontWeight: "700" }]}>
                      {c.title}
                      {c.source ? ` (${c.source})` : ""}
                    </Text>
                    {c.id === calId && <Ionicons name="checkmark" size={15} color={theme.good} />}
                  </Pressable>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {editId &&
        (() => {
          // Guard: a refresh could drop the row while the sheet is open.
          const b = rows.find((x) => x.id === editId);
          if (!b) return null;
          return (
            <EditBooking
              booking={b}
              clientName={clientName(b.client_id)}
              myArtistId={myArtistId}
              onClose={() => setEditId(null)}
              onCancelled={() => checkWaitlist(b)}
              onChanged={() => {
                setEditId(null);
                load();
              }}
            />
          );
        })()}
    </>
  );
}

function EditBooking({
  booking,
  clientName,
  myArtistId,
  onClose,
  onCancelled,
  onChanged,
}: {
  booking: Booking;
  clientName: string;
  myArtistId: string | null;
  onClose: () => void;
  /** Fires after a successful cancel so the parent can offer the freed slot. */
  onCancelled: () => void;
  onChanged: () => void;
}) {
  // Local wall-clock prefill (slicing the raw timestamptz would show UTC).
  const s = new Date(booking.starts_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startDate = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
  const startTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
  const [date, setDate] = useState(startDate);
  const [time, setTime] = useState(startTime);
  const [confirmed, setConfirmed] = useState(!!booking.confirmed_at);
  const [depositStatus, setDepositStatus] = useState(booking.deposit_status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const moved = date !== startDate || time !== startTime;

  const patch = async (fields: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("bookings").update(fields).eq("id", booking.id);
    setBusy(false);
    if (error) setErr(error.message);
    else after?.();
  };

  const saveTime = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      setErr("Date YYYY-MM-DD and time HH:MM.");
      return;
    }
    // A real instant, matching the web admin's writes.
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    // Keep the same duration if an end time was set.
    let endsAt: string | null = null;
    if (booking.ends_at) {
      const dur = new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime();
      endsAt = new Date(new Date(startsAt).getTime() + dur).toISOString();
    }
    if (booking.artist_id) {
      const clash = await findClash(booking.artist_id, startsAt, endsAt, booking.id);
      if (clash) {
        setErr(`Overlaps another booking at ${clock(clash)}. Pick another time.`);
        return;
      }
    }
    // Outside life check (phone calendar), soft warning only.
    if (!(await confirmOutsideConflicts(booking.artist_id, myArtistId, startsAt, endsAt, "Save"))) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("bookings")
      .update({ starts_at: startsAt, ...(endsAt ? { ends_at: endsAt } : {}) })
      .eq("id", booking.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    // Offer to tell the client their new time (text first, email fallback).
    if (booking.client_id) {
      Alert.alert("Booking moved", "Text or email the client their new time?", [
        { text: "Don't notify", style: "cancel", onPress: onChanged },
        {
          text: "Notify",
          onPress: async () => {
            await apiPost("/api/bookings/remind", { bookingId: booking.id, kind: "reschedule" });
            onChanged();
          },
        },
      ]);
    } else {
      onChanged();
    }
  };

  const toggleConfirm = () => {
    const next = !confirmed;
    setConfirmed(next);
    patch({ confirmed_at: next ? new Date().toISOString() : null });
  };

  const setDeposit = (status: string) => {
    setDepositStatus(status);
    patch({ deposit_status: status });
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{clientName}</Text>
        <Text style={styles.sheetSub}>{dayLabel(booking.starts_at)} · {clock(booking.starts_at)}</Text>

        <Text style={styles.sheetLabel}>Reschedule</Text>
        <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
        <Button label={busy ? "Saving…" : moved ? "Save new time" : "Save time"} onPress={saveTime} disabled={busy || !moved} />

        <Text style={styles.sheetLabel}>Confirmation</Text>
        <Pressable onPress={toggleConfirm} disabled={busy} style={[styles.toggleRow, confirmed && styles.toggleOn]}>
          <Text style={[styles.toggleText, confirmed && { color: theme.good }]}>
            {confirmed ? "Confirmed ✓ — tap to undo" : "Mark confirmed"}
          </Text>
        </Pressable>

        {booking.deposit_cents > 0 && depositStatus === "held" && (
          <>
            <Text style={styles.sheetLabel}>Deposit</Text>
            <View style={styles.depRow}>
              <Pressable onPress={() => setDeposit("applied")} disabled={busy} style={styles.depBtn}>
                <Text style={styles.depBtnText}>Apply to ticket</Text>
              </Pressable>
              <Pressable onPress={() => setDeposit("forfeited")} disabled={busy} style={styles.depBtn}>
                <Text style={[styles.depBtnText, { color: "#fb7185" }]}>Forfeit</Text>
              </Pressable>
            </View>
            <Text style={styles.depNote}>Refunds are handled from the web admin.</Text>
          </>
        )}

        <Text style={styles.sheetLabel}>Status</Text>
        <Pressable
          onPress={() =>
            patch({ status: "cancelled" }, () => {
              onCancelled();
              onChanged();
            })
          }
          disabled={busy}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel this booking</Text>
        </Pressable>

        {err && <Text style={styles.err}>{err}</Text>}
        <View style={{ height: 16 }} />
        <Button label="Done" tone="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

function NewBooking({
  artists,
  clients,
  myArtistId,
  onSaved,
}: {
  artists: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  myArtistId: string | null;
  onSaved: () => void;
}) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [clientId, setClientId] = useState(""); // "" = walk-in
  // The roster loads async — when the form opened first (?new=1 deep link),
  // default to the first artist once it lands instead of staying blank.
  useEffect(() => {
    if (!artistId && artists[0]) setArtistId(artists[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists]);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState("12:00");
  const [service, setService] = useState("");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!artistId) {
      setErr("Pick an artist.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      setErr("Date YYYY-MM-DD and time HH:MM.");
      return;
    }
    setBusy(true);
    setErr(null);
    // A real instant (the web admin writes the same) — a bare local string
    // would be read as UTC by Postgres and land hours off.
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    // Same double-booking guard as the desk.
    const clash = await findClash(artistId, startsAt, null);
    if (clash) {
      setBusy(false);
      setErr(`That artist already has a booking at ${clock(clash)}. Pick another time.`);
      return;
    }
    // Outside life check (phone calendar), soft warning only.
    if (!(await confirmOutsideConflicts(artistId, myArtistId, startsAt, null))) {
      setBusy(false);
      return;
    }
    const depositCents = Math.round((Number(deposit) || 0) * 100);
    const { error } = await supabase.from("bookings").insert({
      id: `bk-${uid()}`,
      artist_id: artistId,
      client_id: clientId || null,
      starts_at: startsAt,
      status: "scheduled",
      service_desc: service.trim(),
      deposit_cents: depositCents,
      deposit_status: depositCents > 0 ? "held" : "none",
      source: "manual",
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      {artists.length > 0 && (
        <Chips label="Artist" value={artistId} options={artists.map((a) => a.id)} onChange={setArtistId} display={(id) => artists.find((a) => a.id === id)?.name ?? id} />
      )}
      <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
      <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
      <LabeledInput label="Service" value={service} onChange={setService} placeholder="e.g. half-sleeve session" />
      <LabeledInput label="Deposit ($, optional)" value={deposit} onChange={setDeposit} keyboardType="numeric" placeholder="0" />
      {err && <Text style={styles.err}>{err}</Text>}
      <Button label={busy ? "Saving…" : "Create booking"} onPress={save} disabled={busy} />
    </Card>
  );
}


// Search the whole client book instead of guessing from pills (bug 1db64bc3).
// Walk-in stays one tap; typing filters as you go; the pick shows as a chip
// you can clear.
function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const picked = value ? clients.find((c) => c.id === value) : null;
  const q = query.trim().toLowerCase();
  const matches = q
    ? clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
    : [];

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={pickerStyles.label}>Client</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable onPress={() => { onChange(""); setQuery(""); }} style={[pickerStyles.chip, !value && pickerStyles.chipOn]}>
          <Text style={[pickerStyles.chipText, !value && { color: "#fff" }]}>Walk-in</Text>
        </Pressable>
        {picked && (
          <View style={[pickerStyles.chip, pickerStyles.chipOn, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
            <Text style={[pickerStyles.chipText, { color: "#fff" }]}>{picked.name}</Text>
            <Text onPress={() => onChange("")} style={{ color: theme.textDim, fontSize: 15, fontWeight: "700" }}>×</Text>
          </View>
        )}
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={`Search your ${clients.length} client${clients.length === 1 ? "" : "s"}…`}
        placeholderTextColor={theme.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={pickerStyles.search}
      />
      {matches.length > 0 && (
        <View style={pickerStyles.results}>
          {matches.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => {
                onChange(c.id);
                setQuery("");
              }}
              style={({ pressed }) => [pickerStyles.result, i > 0 && pickerStyles.resultDivider, pressed && { backgroundColor: "rgba(255,255,255,0.05)" }]}
            >
              <Text style={pickerStyles.resultText}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {q.length > 0 && matches.length === 0 && (
        <Text style={pickerStyles.noMatch}>No client named "{query.trim()}" — book them as a walk-in and add them after.</Text>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  chipOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  chipText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  search: {
    backgroundColor: theme.bg,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  results: { marginTop: 6, borderColor: theme.border, borderWidth: 1, borderRadius: 12, backgroundColor: theme.surface, overflow: "hidden" },
  result: { paddingVertical: 12, paddingHorizontal: 14 },
  resultDivider: { borderTopColor: theme.border, borderTopWidth: 1 },
  resultText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  noMatch: { color: theme.textFaint, fontSize: 12.5, marginTop: 8, lineHeight: 18 },
});

// ── Up for grabs ──────────────────────────────────────────────────────────
// "No preference" website requests land in a shared pool; any artist can grab
// one from here (first tap wins — the DB guard makes the race safe), toss it
// back, or book it on the spot. Booking rides the same API the desk uses, so
// the client + deposit link flow is identical.

type GrabRow = {
  id: string;
  name: string;
  idea: string;
  placement: string;
  size: string;
  availability: string;
  artist_id: string | null;
  created_at: string;
  reference_urls: string[] | null;
};

const grabAgo = (iso: string) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function UpForGrabs({ myArtistId, onBooked }: { myArtistId: string; onBooked: () => void }) {
  const [pool, setPool] = useState<GrabRow[]>([]);
  const [mine, setMine] = useState<GrabRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState("12:00");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("booking_requests")
      .select("id, name, idea, placement, size, availability, artist_id, created_at, reference_urls")
      .eq("status", "pending")
      .or(`artist_id.is.null,artist_id.eq.${myArtistId}`)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as GrabRow[];
    setPool(rows.filter((r) => !r.artist_id));
    setMine(rows.filter((r) => r.artist_id === myArtistId));
  }, [myArtistId]);

  useEffect(() => {
    load();
  }, [load]);

  const grab = async (id: string) => {
    setNote(null);
    const { data, error } = await supabase
      .from("booking_requests")
      .update({ artist_id: myArtistId })
      .eq("id", id)
      .is("artist_id", null)
      .eq("status", "pending")
      .select("id");
    if (error) setNote(error.message);
    else if (!data?.length) setNote("Someone beat you to that one.");
    load();
  };

  const tossBack = async (id: string) => {
    setNote(null);
    setOpenId(null);
    await supabase.from("booking_requests").update({ artist_id: null }).eq("id", id).eq("artist_id", myArtistId);
    load();
  };

  const book = async (id: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      setNote("Date YYYY-MM-DD and time HH:MM.");
      return;
    }
    setBusy(true);
    setNote(null);
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const clash = await findClash(myArtistId, startsAt, null);
    if (clash) {
      setBusy(false);
      setNote(`You already have a booking at ${clock(clash)}. Pick another time.`);
      return;
    }
    const r = await apiPatch<{
      depositLink: { url: string; sent: boolean; via?: string; reason?: string } | null;
    }>("/api/bookings/request", {
      id,
      action: "accept",
      startsAt,
      depositCents: Math.round((Number(deposit) || 0) * 100),
    });
    setBusy(false);
    if (!r.ok) {
      setNote(r.error ?? "Could not book it.");
      return;
    }
    const link = r.data?.depositLink;
    setNote(
      link
        ? link.sent
          ? `Booked — deposit link ${link.via === "sms" ? "texted" : "emailed"} to the client.`
          : "Booked — the deposit link couldn't be sent; the desk can pass it along."
        : "Booked.",
    );
    setOpenId(null);
    load();
    onBooked();
  };

  if (!pool.length && !mine.length && !note) return null;

  const details = (q: GrabRow) =>
    [q.placement && `Placement: ${q.placement}`, q.size && `Size: ${q.size}`, q.availability && `Avail: ${q.availability}`]
      .filter(Boolean)
      .join(" · ");

  const refs = (q: GrabRow) =>
    Array.isArray(q.reference_urls) && q.reference_urls.length ? (
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {q.reference_urls.map((u, i) => (
          <Image key={i} source={{ uri: u }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: "#1a1a22" }} />
        ))}
      </View>
    ) : null;

  return (
    <View style={{ marginBottom: 4 }}>
      {note && <Text style={note.startsWith("Booked") ? styles.grabGood : styles.err}>{note}</Text>}
      {mine.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: 4 }]}>Yours to book</Text>
          {mine.map((q) => (
            <Card key={q.id} style={{ marginBottom: 10 }}>
              <Text style={styles.who}>
                {q.name} <Text style={styles.dep}>{grabAgo(q.created_at)}</Text>
              </Text>
              <Text style={styles.sub}>{q.idea}</Text>
              {!!details(q) && <Text style={styles.dep}>{details(q)}</Text>}
              {refs(q)}
              {openId === q.id ? (
                <View style={{ marginTop: 12 }}>
                  <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
                  <LabeledInput label="Deposit ($, optional)" value={deposit} onChange={setDeposit} keyboardType="numeric" placeholder="0" />
                  <Button label={busy ? "Booking…" : "Book it"} onPress={() => book(q.id)} disabled={busy} />
                  <View style={{ marginTop: 8 }}>
                    <Button label="Never mind" tone="ghost" onPress={() => setOpenId(null)} disabled={busy} />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <ActionPill label="Book it" onPress={() => setOpenId(q.id)} />
                  <ActionPill label="Toss back" onPress={() => tossBack(q.id)} />
                </View>
              )}
            </Card>
          ))}
        </>
      )}
      {pool.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: 4 }]}>Up for grabs</Text>
          {pool.map((q) => (
            <Card key={q.id} style={{ marginBottom: 10 }}>
              <Text style={styles.who}>
                {q.name} <Text style={styles.dep}>{grabAgo(q.created_at)}</Text>
              </Text>
              <Text style={styles.sub}>{q.idea}</Text>
              {!!details(q) && <Text style={styles.dep}>{details(q)}</Text>}
              {refs(q)}
              <View style={styles.actions}>
                <ActionPill label="Grab it" onPress={() => grab(q.id)} />
              </View>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  err: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
  grabGood: { color: theme.good, fontSize: 13, marginBottom: 10 },
  freedCard: { marginBottom: 12, borderColor: "rgba(52,211,153,0.4)" },
  freedTitle: { color: theme.good, fontSize: 16, fontWeight: "700" },
  freedSub: { color: theme.textDim, fontSize: 13, marginTop: 3 },
  freedNote: { color: theme.textDim, fontSize: 13, marginTop: 10, lineHeight: 18 },
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginTop: 18, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  who: { color: theme.text, fontSize: 16, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  day: { color: theme.textFaint, fontSize: 11, paddingHorizontal: 14, paddingTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  status: { fontSize: 12, fontWeight: "600" },
  dep: { color: theme.textDim, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderTopColor: theme.border,
    borderTopWidth: 1,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 14 },
  sheetTitle: { color: theme.text, fontSize: 20, fontWeight: "800" },
  sheetSub: { color: theme.textDim, fontSize: 13, marginTop: 2, marginBottom: 10 },
  sheetLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "700", marginTop: 26, marginBottom: 10 },
  toggleRow: { borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 13, paddingHorizontal: 14, alignItems: "center" },
  toggleOn: { borderColor: "rgba(52,211,153,0.5)", backgroundColor: theme.goodSoft },
  toggleText: { color: theme.text, fontSize: 14.5, fontWeight: "600" },
  depRow: { flexDirection: "row", gap: 10 },
  depBtn: { flex: 1, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: "center" },
  depBtnText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  depNote: { color: theme.textFaint, fontSize: 12, marginTop: 8 },
  calOffBanner: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  calPick: { marginBottom: 12, borderColor: "rgba(52,211,153,0.45)", borderWidth: 1, borderRadius: 14, backgroundColor: theme.goodSoft, overflow: "hidden" },
  calOnRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 14 },
  syncCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 14 },
  syncCardTitle: { color: theme.text, fontSize: 15, fontWeight: "700" },
  syncCardSub: { color: theme.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  syncCardAction: { fontSize: 13.5, fontWeight: "700" },
  calCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.good, alignItems: "center", justifyContent: "center" },
  calOnTitle: { color: theme.good, fontSize: 14.5, fontWeight: "800" },
  calOnSub: { color: theme.textDim, fontSize: 12, marginTop: 1 },
  calOff: { color: theme.textFaint, fontSize: 12.5, fontWeight: "600" },
  calPickRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 14, borderTopColor: "rgba(52,211,153,0.25)", borderTopWidth: 1 },
  calPickLabel: { color: theme.textFaint, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginLeft: "auto" },
  calPickValue: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  calPickSource: { color: theme.textFaint, fontSize: 12 },
  calOption: { flexDirection: "row", alignItems: "center", gap: 8, borderTopColor: "rgba(52,211,153,0.25)", borderTopWidth: 1, paddingVertical: 11, paddingHorizontal: 14 },
  calOptionText: { color: theme.textDim, fontSize: 13.5, flex: 1 },
  cancelBtn: { borderColor: "rgba(251,113,133,0.4)", borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#fb7185", fontSize: 14, fontWeight: "600" },
});
