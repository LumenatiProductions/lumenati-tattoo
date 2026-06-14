import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Badge, Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";
import DateTimeField from "@/components/DateTimeField";
import { uid } from "@/lib/ids";
import { apiPost } from "@/lib/appApi";

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

// Same double-booking guard the web API runs, client-side (the app writes
// bookings directly under RLS). Returns the clashing start time, or null.
async function findClash(
  artistId: string,
  startsAt: string,
  endsAt: string | null,
  excludeId?: string,
): Promise<string | null> {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = endsAt ? new Date(endsAt).getTime() : start + HOUR_MS;
  const windowMs = 12 * HOUR_MS;
  const { data } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("artist_id", artistId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date(start - windowMs).toISOString())
    .lte("starts_at", new Date(end + windowMs).toISOString());
  for (const r of (data ?? []) as { id: string; starts_at: string; ends_at: string | null }[]) {
    if (excludeId && r.id === excludeId) continue;
    const s2 = new Date(r.starts_at).getTime();
    const e2 = r.ends_at ? new Date(r.ends_at).getTime() : s2 + HOUR_MS;
    if (start < e2 && s2 < end) return r.starts_at;
  }
  return null;
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
  const { role } = useAuth();
  const { preview } = usePreview();
  const isStaff = role === "owner" || role === "bookkeeper" || role === "frontdesk";

  const [rows, setRows] = useState<Booking[]>([]);
  const [names, setNames] = useState<{ c: Map<string, string>; a: Map<string, string> }>({ c: new Map(), a: new Map() });
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [recentClients, setRecentClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
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

    // Pickers for the create form (staff only; artists can't read clients).
    if (isStaff) {
      const [allArtists, recent] = await Promise.all([
        supabase.from("artists").select("id, name").eq("active", true).order("sort"),
        supabase.from("clients").select("id, first_name, last_name").order("last_seen", { ascending: false, nullsFirst: false }).limit(12),
      ]);
      setArtists((allArtists.data ?? []) as { id: string; name: string }[]);
      setRecentClients(
        ((recent.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim() || "Client",
        })),
      );
    }
    setLoading(false);
  }, [isStaff, preview]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    setRows((p) => p.map((b) => (b.id === id ? { ...b, status } : b)));
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) load(); // roll back to server truth
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
            <Pressable onPress={() => setStatus(b.id, "completed")} style={styles.act}>
              <Text style={styles.actText}>Complete</Text>
            </Pressable>
            <Pressable onPress={() => setStatus(b.id, "no_show")} style={styles.act}>
              <Text style={styles.actText}>No-show</Text>
            </Pressable>
            <Pressable onPress={() => setEditId(b.id)} style={styles.act}>
              <Text style={styles.actText}>Edit</Text>
            </Pressable>
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
        {isStaff && (
          <View style={{ marginBottom: 12 }}>
            <Button label={adding ? "Cancel" : "New booking"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />
          </View>
        )}
        {adding && (
          <NewBooking
            artists={artists}
            clients={recentClients}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        )}

        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
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
          </>
        )}
      </ScrollView>

      {editId && (
        <EditBooking
          booking={rows.find((b) => b.id === editId)!}
          clientName={clientName(rows.find((b) => b.id === editId)!.client_id)}
          onClose={() => setEditId(null)}
          onChanged={() => {
            setEditId(null);
            load();
          }}
        />
      )}
    </>
  );
}

function EditBooking({
  booking,
  clientName,
  onClose,
  onChanged,
}: {
  booking: Booking;
  clientName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const startDate = booking.starts_at.slice(0, 10);
  const startTime = booking.starts_at.slice(11, 16);
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
    const startsAt = `${date}T${time}:00`;
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
          onPress={() => patch({ status: "cancelled" }, onChanged)}
          disabled={busy}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel this booking</Text>
        </Pressable>

        {err && <Text style={styles.err}>{err}</Text>}
        <View style={{ height: 8 }} />
        <Button label="Done" tone="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

function NewBooking({
  artists,
  clients,
  onSaved,
}: {
  artists: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [clientId, setClientId] = useState(""); // "" = walk-in
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
    const startsAt = `${date}T${time}:00`;
    // Same double-booking guard as the desk.
    const clash = await findClash(artistId, startsAt, null);
    if (clash) {
      setBusy(false);
      setErr(`That artist already has a booking at ${clock(clash)}. Pick another time.`);
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
      <Chips
        label="Client"
        value={clientId}
        options={["", ...clients.map((c) => c.id)]}
        onChange={setClientId}
        display={(id) => (id ? clients.find((c) => c.id === id)?.name ?? "Client" : "Walk-in")}
      />
      <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
      <LabeledInput label="Service" value={service} onChange={setService} placeholder="e.g. half-sleeve session" />
      <LabeledInput label="Deposit ($, optional)" value={deposit} onChange={setDeposit} keyboardType="numeric" placeholder="0" />
      {err && <Text style={styles.err}>{err}</Text>}
      <Button label={busy ? "Saving…" : "Create booking"} onPress={save} disabled={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  err: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginTop: 18, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  who: { color: theme.text, fontSize: 16, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  day: { color: theme.textFaint, fontSize: 11, paddingHorizontal: 14, paddingTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  status: { fontSize: 12, fontWeight: "600" },
  dep: { color: theme.textDim, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  act: { borderColor: theme.border, borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 },
  actText: { color: theme.text, fontSize: 13, fontWeight: "600" },
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
  sheetSub: { color: theme.textDim, fontSize: 13, marginTop: 2, marginBottom: 6 },
  sheetLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  toggleRow: { borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 13, paddingHorizontal: 14, alignItems: "center" },
  toggleOn: { borderColor: "rgba(52,211,153,0.5)", backgroundColor: theme.goodSoft },
  toggleText: { color: theme.text, fontSize: 14.5, fontWeight: "600" },
  depRow: { flexDirection: "row", gap: 10 },
  depBtn: { flex: 1, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: "center" },
  depBtnText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  depNote: { color: theme.textFaint, fontSize: 12, marginTop: 8 },
  cancelBtn: { borderColor: "rgba(251,113,133,0.4)", borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#fb7185", fontSize: 14, fontWeight: "600" },
});
