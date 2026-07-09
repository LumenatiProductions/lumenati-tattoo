import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { ActionPill, Badge, Button, Card, Empty, SectionTitle } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";
import DateTimeField from "@/components/DateTimeField";
import InkWash from "@/components/InkWash";
import { findClash } from "@/lib/clash";
import { uid } from "@/lib/ids";
import { success, trouble } from "@/lib/haptics";

// The waitlist: people who want in sooner. Its whole reason to exist is the
// cancel moment — Bookings links here with ?slot=<ISO>&artist=<id> when a
// booking dies, and "Book them" lands a waiting name straight into the freed
// time. Texting goes through the PHONE's own composer (sms:), so it works
// today, personally, with no Twilio in the loop.

type Entry = {
  id: string;
  artist_id: string | null;
  client_id: string | null;
  name: string;
  phone: string | null;
  want: string;
  active: boolean;
  booked_id: string | null;
  created_at: string;
};
type Artist = { id: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function Waitlist() {
  const insets = useSafeAreaInsets();
  const { role, email } = useAuth();
  const { preview } = usePreview();
  const isStaff = role === "owner";
  // The freed slot handed over from Bookings' cancel moment.
  const params = useLocalSearchParams<{ slot?: string; artist?: string }>();
  const slotISO = typeof params.slot === "string" && !Number.isNaN(new Date(params.slot).getTime()) ? params.slot : null;

  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [want, setWant] = useState("");
  const [lane, setLane] = useState("any"); // artist id, or "any"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null); // entry being booked
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: a }] = await Promise.all([
      supabase
        .from("waitlist")
        .select("id, artist_id, client_id, name, phone, want, active, booked_id, created_at")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase.from("artists").select("id, name").eq("active", true).order("sort"),
    ]);
    setRows((data ?? []) as Entry[]);
    setArtists((a ?? []) as Artist[]);
  }, []);

  useEffect(() => {
    (async () => {
      let aid = preview?.artistId ?? null;
      if (!aid && email && role === "artist") {
        const { data: p } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
        aid = (p?.artist_id as string | null) ?? null;
      }
      setMyArtistId(aid);
      if (aid) setLane(aid);
      load();
    })();
  }, [email, role, preview, load]);

  const laneOptions = isStaff ? ["any", ...artists.map((a) => a.id)] : ["any", ...(myArtistId ? [myArtistId] : [])];
  const laneName = (id: string | null) =>
    id === null || id === "any" ? "Anyone" : artists.find((a) => a.id === id)?.name ?? "Artist";

  const add = async () => {
    if (!name.trim()) {
      setErr("A name is the whole point.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("waitlist").insert({
      id: `wl-${uid()}`,
      artist_id: lane === "any" ? null : lane,
      name: name.trim(),
      phone: phone.trim() || null,
      want: want.trim(),
      active: true,
    });
    setBusy(false);
    if (error) {
      trouble();
      setErr(error.message);
      return;
    }
    success();
    setAdding(false);
    setName("");
    setPhone("");
    setWant("");
    load();
  };

  const textThem = (e: Entry) => {
    if (!e.phone) return;
    const msg = slotISO
      ? `Hey ${e.name.split(" ")[0]}, it's Lumenati Tattoo — a spot just opened ${dayLabel(slotISO)} at ${clock(slotISO)}. Want it?`
      : `Hey ${e.name.split(" ")[0]}, it's Lumenati Tattoo — a spot opened up. Want in?`;
    const sep = Platform.OS === "ios" ? "&" : "?";
    Linking.openURL(`sms:${e.phone}${sep}body=${encodeURIComponent(msg)}`).catch(() => {
      setNote("Could not open Messages on this device.");
    });
  };

  const remove = async (e: Entry) => {
    setRows((p) => (p ?? []).filter((r) => r.id !== e.id));
    const { error } = await supabase.from("waitlist").update({ active: false }).eq("id", e.id);
    if (error) load();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Waitlist", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <InkWash />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          {slotISO && (
            <Card style={styles.slotBanner}>
              <Text style={styles.slotTitle}>
                Filling {dayLabel(slotISO)} at {clock(slotISO)}
              </Text>
              <Text style={styles.slotSub}>Book them drops whoever you pick straight into that slot.</Text>
            </Card>
          )}

          <Button label={adding ? "Cancel" : "Add to waitlist"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />

          {adding && (
            <Card style={{ marginTop: 14 }}>
              <LabeledInput label="Name" value={name} onChange={setName} placeholder="First and last" autoCapitalize="words" />
              <LabeledInput label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" placeholder="So you can text them the slot" />
              <LabeledInput label="What they want" value={want} onChange={setWant} placeholder="flash piece, sleeve start…" />
              <Chips label="Waiting for" value={lane} options={laneOptions} display={laneName} onChange={setLane} />
              {err && <Text style={styles.err}>{err}</Text>}
              <Button label={busy ? "Adding…" : "Add them"} onPress={add} disabled={busy} />
            </Card>
          )}

          {note && <Text style={styles.note}>{note}</Text>}

          <SectionTitle>Waiting</SectionTitle>
          <Card style={{ padding: 0 }}>
            {rows === null ? (
              <ActivityIndicator color={theme.textDim} style={{ marginVertical: 30 }} />
            ) : rows.length === 0 ? (
              <Empty>Nobody waiting. Add walk-ins you had to turn away — they're tomorrow's filled slots.</Empty>
            ) : (
              rows.map((e, i) => (
                <View key={e.id} style={[styles.row, i > 0 && styles.border]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.rowTitle}>{e.name}</Text>
                    <Text style={styles.rowSub}>
                      {e.want || "Anything"} · waiting for {laneName(e.artist_id)}
                      {e.phone ? ` · ${e.phone}` : ""}
                    </Text>
                    {bookingId === e.id ? (
                      <FillSlot
                        entry={e}
                        artists={artists}
                        isStaff={isStaff}
                        myArtistId={myArtistId}
                        slotISO={slotISO}
                        onDone={(when) => {
                          setBookingId(null);
                          setNote(`${e.name} booked — ${dayLabel(when)} at ${clock(when)}.`);
                          load();
                        }}
                        onCancel={() => setBookingId(null)}
                      />
                    ) : (
                      <View style={styles.actions}>
                        <ActionPill label="Book them" onPress={() => setBookingId(e.id)} />
                        {e.phone ? <ActionPill label="Text them" onPress={() => textThem(e)} /> : null}
                        <ActionPill label="Remove" danger onPress={() => remove(e)} />
                      </View>
                    )}
                  </View>
                  <Badge label={dayLabel(e.created_at)} />
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      </View>
    </>
  );
}

// The payoff: a waiting name into a real slot. Creates the client on the fly
// when the entry isn't linked to one, guards the double-book, retires the row.
function FillSlot({
  entry,
  artists,
  isStaff,
  myArtistId,
  slotISO,
  onDone,
  onCancel,
}: {
  entry: Entry;
  artists: Artist[];
  isStaff: boolean;
  myArtistId: string | null;
  slotISO: string | null;
  onDone: (whenISO: string) => void;
  onCancel: () => void;
}) {
  const slot = slotISO ? new Date(slotISO) : null;
  const [date, setDate] = useState(slot ? localDate(slot) : localDate(new Date()));
  const [time, setTime] = useState(slot ? `${pad(slot.getHours())}:${pad(slot.getMinutes())}` : "12:00");
  // Whose chair: the entry's lane when set; an artist always books themselves;
  // staff pick for "anyone" entries.
  const [artistId, setArtistId] = useState(entry.artist_id ?? myArtistId ?? artists[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const book = async () => {
    if (!artistId) {
      setErr("Pick an artist.");
      return;
    }
    setBusy(true);
    setErr(null);
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const clash = await findClash(artistId, startsAt, null);
    if (clash) {
      setBusy(false);
      setErr(`That artist already has a booking at ${clock(clash)}. Pick another time.`);
      return;
    }
    let cid = entry.client_id;
    if (!cid) {
      cid = `walkin-${uid()}`;
      const [first, ...rest] = entry.name.split(/\s+/);
      const { error } = await supabase.from("clients").insert({
        id: cid,
        first_name: first,
        last_name: rest.join(" "),
        phone: entry.phone,
        preferred_artist_id: artistId,
        source: "manual",
        first_seen: localDate(new Date()),
      });
      if (error) {
        setBusy(false);
        setErr(error.message);
        return;
      }
    }
    const bkId = `bk-${uid()}`;
    const { error } = await supabase.from("bookings").insert({
      id: bkId,
      artist_id: artistId,
      client_id: cid,
      starts_at: startsAt,
      status: "scheduled",
      service_desc: entry.want,
      deposit_cents: 0,
      deposit_status: "none",
      source: "manual",
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    await supabase.from("waitlist").update({ active: false, booked_id: bkId }).eq("id", entry.id);
    setBusy(false);
    success();
    onDone(startsAt);
  };

  return (
    <View style={styles.fill}>
      {isStaff && !entry.artist_id && artists.length > 0 && (
        <Chips label="Artist" value={artistId} options={artists.map((a) => a.id)} display={(id) => artists.find((a) => a.id === id)?.name ?? id} onChange={setArtistId} />
      )}
      <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
      {err && <Text style={styles.err}>{err}</Text>}
      <Button label={busy ? "Booking…" : "Book the slot"} onPress={book} disabled={busy} />
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: "row" }}>
        <ActionPill label="Never mind" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slotBanner: { marginBottom: 14, borderColor: "rgba(52,211,153,0.4)" },
  slotTitle: { color: theme.good, fontSize: 16, fontWeight: "700" },
  slotSub: { color: theme.textDim, fontSize: 13, marginTop: 3 },
  err: { color: theme.bad, fontSize: 13, marginBottom: 10 },
  note: { color: theme.good, fontSize: 13.5, marginTop: 12, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", padding: 14 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  rowSub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  fill: { marginTop: 12 },
});
