import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { ActionPill, Badge, Card, Empty, SectionTitle } from "@/components/ui";
import InkWash from "@/components/InkWash";
import RebookCard from "@/components/RebookCard";
import { success } from "@/lib/haptics";

// The artist's people. RLS does the guarding (clients_artist_read: you only
// ever see clients you have a booking with), this screen does the remembering:
// how many sessions, what you did last, how long it's been — and a private
// notebook per client (artist_client_notes) the desk's CRM notes never touch.
// The "been a while" rail up top is the money part: names that are quietly
// overdue for their next session, one tap from a rebook.

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  instagram: string | null;
  last_seen: string | null;
};
type BookingRow = {
  client_id: string | null;
  starts_at: string;
  status: string;
  service_desc: string;
};
type Person = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  sessions: number;
  lastPast: string | null; // ISO of the most recent session already done
  lastService: string;
  nextUp: string | null; // ISO of an upcoming booking, if any
  healed: number;
};

const NUDGE_DAYS = 90;

const dayMs = 86_400_000;
const monthsSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * dayMs));
const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: undefined });
const prettyDateYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function MyClients() {
  const insets = useSafeAreaInsets();
  const { email } = useAuth();
  const { preview } = usePreview();
  const [artistId, setArtistId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [bookingsByClient, setBookingsByClient] = useState<Map<string, BookingRow[]>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async (aid: string) => {
    // Three RLS-scoped reads: my clients, every booking I have with anyone,
    // my healed shots. The merge below turns them into memory.
    let bq = supabase
      .from("bookings")
      .select("client_id, starts_at, status, service_desc")
      .not("client_id", "is", null)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(1000);
    let hq = supabase.from("healed_photos").select("client_id").neq("status", "dismissed").limit(500);
    // An owner previewing an artist scopes explicitly (owner RLS sees all).
    bq = bq.eq("artist_id", aid);
    hq = hq.eq("artist_id", aid);
    // PostgREST clamps every response at 1000 rows, and an unordered .limit()
    // truncates arbitrarily, so page the clients read through in ordered blocks
    // until a short page — an artist never silently loses clients.
    const clientsPage: ClientRow[] = [];
    for (let start = 0; start < 20000; start += 1000) {
      const { data: page } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, instagram, last_seen")
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, start + 999);
      const rows = (page ?? []) as ClientRow[];
      clientsPage.push(...rows);
      if (rows.length < 1000) break;
    }
    const [{ data: bookings }, { data: healed }] = await Promise.all([bq, hq]);
    const clients = clientsPage;

    const byClient = new Map<string, BookingRow[]>();
    for (const b of (bookings ?? []) as BookingRow[]) {
      if (!b.client_id) continue;
      const arr = byClient.get(b.client_id) ?? [];
      arr.push(b);
      byClient.set(b.client_id, arr);
    }
    const healedBy = new Map<string, number>();
    for (const h of (healed ?? []) as { client_id: string | null }[]) {
      if (h.client_id) healedBy.set(h.client_id, (healedBy.get(h.client_id) ?? 0) + 1);
    }

    const now = Date.now();
    const out: Person[] = [];
    for (const c of (clients ?? []) as ClientRow[]) {
      const bs = byClient.get(c.id) ?? [];
      if (bs.length === 0) continue; // someone else's client leaking via last_seen order — RLS already prevents; belt and braces
      const past = bs.filter((b) => new Date(b.starts_at).getTime() <= now);
      const future = bs.filter((b) => new Date(b.starts_at).getTime() > now && b.status === "scheduled");
      const lastPast = past[0] ?? null;
      out.push({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim() || "Client",
        phone: c.phone,
        instagram: c.instagram,
        sessions: past.length,
        lastPast: lastPast?.starts_at ?? null,
        lastService: lastPast?.service_desc ?? "",
        nextUp: future.length ? future[future.length - 1].starts_at : null,
        healed: healedBy.get(c.id) ?? 0,
      });
    }
    out.sort((a, b) => (b.lastPast ?? "").localeCompare(a.lastPast ?? ""));
    setBookingsByClient(byClient);
    setPeople(out);
  }, []);

  useEffect(() => {
    (async () => {
      let aid = preview?.artistId ?? null;
      if (!aid && email) {
        const { data: p } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
        aid = (p?.artist_id as string | null) ?? null;
      }
      if (!aid) {
        setMissing(true);
        return;
      }
      setArtistId(aid);
      load(aid);
    })();
  }, [email, preview, load]);

  // Quietly overdue: no future booking, last session NUDGE_DAYS+ ago.
  const overdue = useMemo(
    () =>
      (people ?? [])
        .filter((p) => !p.nextUp && p.lastPast && Date.now() - new Date(p.lastPast).getTime() > NUDGE_DAYS * dayMs)
        .sort((a, b) => (a.lastPast ?? "").localeCompare(b.lastPast ?? "")),
    [people],
  );

  const open = openId ? (people ?? []).find((p) => p.id === openId) ?? null : null;

  const shownPeople = !q.trim()
    ? people ?? []
    : (people ?? []).filter((p) => {
        const s = q.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          (p.phone ?? "").toLowerCase().includes(s) ||
          (p.instagram ?? "").toLowerCase().includes(s)
        );
      });

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "My clients", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <InkWash />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          {missing ? (
            <Card>
              <Text style={styles.emptyText}>
                No artist is tied to this login yet. The shop can link you on Artists &amp; Pay.
              </Text>
            </Card>
          ) : people === null ? (
            <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
          ) : (
            <>
              {overdue.length > 0 && (
                <>
                  <SectionTitle>Been a while</SectionTitle>
                  <Card style={{ padding: 0 }}>
                    {overdue.slice(0, 6).map((p, i) => (
                      <Pressable key={p.id} onPress={() => setOpenId(p.id)} style={[styles.row, i > 0 && styles.border]}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={styles.rowTitle}>{p.name}</Text>
                          <Text style={styles.rowSub}>
                            {monthsSince(p.lastPast!)} months since {p.lastService ? `the ${p.lastService}` : "their last session"}
                          </Text>
                        </View>
                        <Badge label="Reach out" tone="warn" />
                      </Pressable>
                    ))}
                  </Card>
                </>
              )}

              <SectionTitle>Your people ({people.length})</SectionTitle>
              {people.length > 5 && (
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search by name, phone, or Instagram"
                  placeholderTextColor={theme.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.search}
                />
              )}
              <Card style={{ padding: 0 }}>
                {people.length === 0 ? (
                  <Empty>Your clients show up here after your first booking with them.</Empty>
                ) : shownPeople.length === 0 ? (
                  <Empty>No one matches &ldquo;{q.trim()}&rdquo;.</Empty>
                ) : (
                  shownPeople.map((p, i) => (
                    <Pressable key={p.id} onPress={() => setOpenId(p.id)} style={[styles.row, i > 0 && styles.border]}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.rowTitle}>{p.name}</Text>
                        <Text style={styles.rowSub}>
                          {p.sessions} session{p.sessions === 1 ? "" : "s"}
                          {p.lastPast ? ` · last ${prettyDate(p.lastPast)}` : ""}
                          {p.healed ? ` · ${p.healed} healed shot${p.healed === 1 ? "" : "s"}` : ""}
                        </Text>
                      </View>
                      {p.nextUp ? <Badge label={`Booked ${prettyDate(p.nextUp)}`} tone="good" /> : null}
                    </Pressable>
                  ))
                )}
              </Card>
            </>
          )}
        </ScrollView>
      </View>

      {open && artistId && (
        <ClientSheet
          person={open}
          artistId={artistId}
          history={(bookingsByClient.get(open.id) ?? []).filter((b) => new Date(b.starts_at).getTime() <= Date.now())}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function ClientSheet({
  person,
  artistId,
  history,
  onClose,
}: {
  person: Person;
  artistId: string;
  history: BookingRow[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState("");
  const [loadedNote, setLoadedNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("artist_client_notes")
      .select("note")
      .eq("artist_id", artistId)
      .eq("client_id", person.id)
      .maybeSingle()
      .then(({ data }) => {
        const n = (data?.note as string) ?? "";
        setNote(n);
        setLoadedNote(n);
      });
  }, [artistId, person.id]);

  const saveNote = async () => {
    setSaving(true);
    const { error } = await supabase.from("artist_client_notes").upsert({
      artist_id: artistId,
      client_id: person.id,
      note: note.trim(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) {
      success();
      setLoadedNote(note.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.sheetHandle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetTitle}>{person.name}</Text>
          <Text style={styles.sheetSub}>
            {person.sessions} session{person.sessions === 1 ? "" : "s"} with you
            {person.phone ? ` · ${person.phone}` : ""}
            {person.instagram ? ` · @${person.instagram}` : ""}
          </Text>

          <Text style={styles.sheetLabel}>Your notes</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Placement, style, skin, what you talked about…"
            placeholderTextColor={theme.textFaint}
            multiline
            style={styles.noteInput}
          />
          {(note.trim() !== loadedNote || saved) && (
            <View style={{ marginTop: 10, flexDirection: "row" }}>
              <ActionPill label={saved ? "Saved" : saving ? "Saving…" : "Save note"} onPress={saveNote} disabled={saving} />
            </View>
          )}

          <Text style={styles.sheetLabel}>Work together</Text>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>Nothing on the books yet.</Text>
          ) : (
            history.slice(0, 8).map((b, i) => (
              <View key={`${b.starts_at}-${i}`} style={styles.histRow}>
                <Text style={styles.histDate}>{prettyDateYear(b.starts_at)}</Text>
                <Text style={styles.histService} numberOfLines={1}>
                  {b.service_desc || "Session"}
                </Text>
              </View>
            ))
          )}

          {/* The point of remembering: get the next one on the books. */}
          <RebookCard artistId={artistId} clientId={person.id} serviceHint={person.lastService} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 14 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  search: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: theme.text,
    fontSize: 15,
    marginBottom: 10,
  },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  rowSub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  emptyText: { color: theme.textDim, fontSize: 14.5, lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: theme.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopColor: theme.border,
    borderTopWidth: 1,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 14 },
  sheetTitle: { color: theme.text, fontSize: 22, fontWeight: "800" },
  sheetSub: { color: theme.textDim, fontSize: 13, marginTop: 3 },
  sheetLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  noteInput: {
    backgroundColor: theme.bg,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    color: theme.text,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 84,
    textAlignVertical: "top",
  },
  historyEmpty: { color: theme.textFaint, fontSize: 13.5 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  histDate: { color: theme.textFaint, fontSize: 12.5, width: 96, fontVariant: ["tabular-nums"] },
  histService: { color: theme.text, fontSize: 14.5, flex: 1 },
});
