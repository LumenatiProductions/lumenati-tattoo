import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";
import { uid } from "@/lib/ids";

type Booking = {
  id: string;
  starts_at: string;
  status: string;
  service_desc: string;
  client_id: string | null;
  artist_id: string | null;
  deposit_status: string;
  checked_in_at: string | null;
};

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
  const isStaff = role === "owner" || role === "bookkeeper" || role === "frontdesk";

  const [rows, setRows] = useState<Booking[]>([]);
  const [names, setNames] = useState<{ c: Map<string, string>; a: Map<string, string> }>({ c: new Map(), a: new Map() });
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [recentClients, setRecentClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const start = todayKey();
    const { data } = await supabase
      .from("bookings")
      .select("id, starts_at, status, service_desc, client_id, artist_id, deposit_status, checked_in_at")
      .gte("starts_at", start)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(80);
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
  }, [isStaff]);

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
          </View>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {b.deposit_status === "held" && <Text style={styles.dep}>deposit</Text>}
        {b.checked_in_at && <Text style={[styles.dep, { color: theme.good }]}>checked in</Text>}
        <Text style={[styles.status, { color: STATUS_TONE[b.status] ?? theme.textDim }]}>{b.status.replace("_", " ")}</Text>
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
    </>
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
    const depositCents = Math.round((Number(deposit) || 0) * 100);
    const { error } = await supabase.from("bookings").insert({
      id: `bk-${uid()}`,
      artist_id: artistId,
      client_id: clientId || null,
      starts_at: `${date}T${time}:00`,
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
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1.4 }}>
          <LabeledInput label="Date" value={date} onChange={setDate} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Time" value={time} onChange={setTime} keyboardType="numeric" />
        </View>
      </View>
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
});
