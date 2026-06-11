import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Badge, Button, Card, Empty, SectionTitle, Stat } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";

// Intake & consent (parity with /admin/intake): start a form at the chair,
// share the signing link from the phone's share sheet, confirm the in-person
// ID check, void mistakes. Reads/writes consent_forms directly under RLS.

const SITE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// Values must match lib/intake/forms.ts on the web.
const ID_TYPES = [
  { value: "drivers_license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "state_id", label: "State ID" },
] as const;

type Form = {
  id: string;
  booking_id: string | null;
  client_id: string | null;
  artist_id: string | null;
  signed_name: string | null;
  id_checked: boolean;
  id_type: string | null;
  age_ok: boolean | null;
  placement: string | null;
  medical_flags: string;
  sign_token: string | null;
  signed_at: string | null;
  voided: boolean;
  created_at: string;
};
type Booking = { id: string; starts_at: string; client_id: string | null; artist_id: string | null };
type Named = { id: string; name: string };

type FormState = "complete" | "awaiting_id" | "awaiting_sign" | "voided" | "age_flag";
const stateOf = (f: Form): FormState =>
  f.voided ? "voided" : f.age_ok === false ? "age_flag" : !f.signed_at ? "awaiting_sign" : !f.id_checked ? "awaiting_id" : "complete";

const STATE_BADGE: Record<FormState, { tone: "neutral" | "good" | "warn" | "bad"; label: string }> = {
  complete: { tone: "good", label: "Signed + ID ✓" },
  awaiting_id: { tone: "warn", label: "Needs ID check" },
  awaiting_sign: { tone: "warn", label: "Awaiting signature" },
  age_flag: { tone: "bad", label: "Under-age — review" },
  voided: { tone: "neutral", label: "Voided" },
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const isToday = (iso: string | null) => !!iso && iso.slice(0, 10) === todayKey();

// Hex token (Hermes has no btoa): 24 random bytes, same entropy as the web's
// randomBytes(24).toString("base64url"), and /intake/[token] matches by equality.
const newToken = () =>
  Array.from(Crypto.getRandomBytes(24), (b) => b.toString(16).padStart(2, "0")).join("");

type Filter = "attention" | "today" | "signed" | "all";
const FILTER_LABEL: Record<Filter, string> = { attention: "Needs attention", today: "Today", signed: "Signed", all: "All" };

export default function Intake() {
  const insets = useSafeAreaInsets();
  const { role, email } = useAuth();
  const canWrite = role === "owner" || role === "bookkeeper" || role === "frontdesk";

  const [forms, setForms] = useState<Form[] | null>(null);
  const [clients, setClients] = useState<Named[]>([]);
  const [artists, setArtists] = useState<Named[]>([]);
  const [todays, setTodays] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const dayStart = `${todayKey()}T00:00:00`;
    const [{ data: f }, { data: c }, { data: a }, { data: b }] = await Promise.all([
      supabase.from("consent_forms").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("clients").select("id, first_name, last_name"),
      supabase.from("artists").select("id, name").eq("active", true).order("sort"),
      supabase
        .from("bookings")
        .select("id, starts_at, client_id, artist_id")
        .gte("starts_at", dayStart)
        .neq("status", "cancelled")
        .order("starts_at"),
    ]);
    setForms((f ?? []) as Form[]);
    setClients(
      ((c ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((r) => ({
        id: r.id,
        name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Unnamed",
      })),
    );
    setArtists((a ?? []) as Named[]);
    setTodays(((b ?? []) as Booking[]).filter((bk) => bk.starts_at.slice(0, 10) === todayKey()));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown client" : "No client linked");
  }, [clients]);
  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Any artist");
  }, [artists]);

  const all = forms ?? [];
  const unsignedToday = todays.filter(
    (bk) => !all.some((f) => f.booking_id === bk.id && f.signed_at && !f.voided),
  ).length;
  const awaitingSign = all.filter((f) => !f.signed_at && !f.voided).length;
  const awaitingId = all.filter((f) => f.signed_at && !f.id_checked && !f.voided).length;

  const filtered = all.filter((f) => {
    const s = stateOf(f);
    if (filter === "attention") return s === "awaiting_sign" || s === "awaiting_id" || s === "age_flag";
    if (filter === "today") return isToday(f.created_at) || isToday(f.signed_at);
    if (filter === "signed") return !!f.signed_at && !f.voided;
    return true;
  });

  const shareLink = async (f: Form) => {
    if (!f.sign_token) return;
    await Share.share({ message: `${SITE}/intake/${f.sign_token}` });
  };

  const confirmId = async (f: Form, idType: string) => {
    await supabase.from("consent_forms").update({ id_checked: true, id_type: idType }).eq("id", f.id);
    load();
  };

  const voidForm = (f: Form) => {
    Alert.alert("Void this form?", "Kept on file for the record — it can't be un-voided here.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Void",
        style: "destructive",
        onPress: async () => {
          await supabase
            .from("consent_forms")
            .update({ voided: true, void_reason: "Retracted by staff", sign_token: null })
            .eq("id", f.id);
          load();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Intake", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
      >
        {forms === null ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat label="Unsigned today" value={String(unsignedToday)} warn={unsignedToday > 0} accent={unsignedToday > 0} sub="today's bookings w/o a form" />
              <Stat label="Awaiting signature" value={String(awaitingSign)} />
              <Stat label="Needs ID check" value={String(awaitingId)} />
            </View>

            {canWrite && (
              <View style={{ marginTop: 14 }}>
                <Button label={adding ? "Cancel" : "New form"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />
              </View>
            )}

            {adding && canWrite && (
              <NewForm
                bookings={todays}
                artists={artists}
                clientName={clientName}
                email={email}
                onDone={() => {
                  setAdding(false);
                  load();
                }}
              />
            )}

            <View style={{ marginTop: 18 }}>
              <Chips
                value={filter}
                options={["attention", "today", "signed", "all"] as Filter[]}
                display={(k) => FILTER_LABEL[k]}
                onChange={setFilter}
              />
            </View>

            <SectionTitle>Consent forms</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {filtered.length === 0 ? (
                <Empty>{all.length === 0 ? "No consent forms yet." : "Nothing in this view."}</Empty>
              ) : (
                filtered.map((f, i) => (
                  <FormRow
                    key={f.id}
                    form={f}
                    first={i === 0}
                    open={openId === f.id}
                    canWrite={canWrite}
                    clientName={clientName(f.client_id)}
                    artistName={artistName(f.artist_id)}
                    onToggle={() => setOpenId((v) => (v === f.id ? null : f.id))}
                    onShare={() => shareLink(f)}
                    onConfirmId={(t) => confirmId(f, t)}
                    onVoid={() => voidForm(f)}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

function FormRow({
  form: f,
  first,
  open,
  canWrite,
  clientName,
  artistName,
  onToggle,
  onShare,
  onConfirmId,
  onVoid,
}: {
  form: Form;
  first: boolean;
  open: boolean;
  canWrite: boolean;
  clientName: string;
  artistName: string;
  onToggle: () => void;
  onShare: () => void;
  onConfirmId: (idType: string) => void;
  onVoid: () => void;
}) {
  const s = stateOf(f);
  const badge = STATE_BADGE[s];
  const [idType, setIdType] = useState<string>(ID_TYPES[0].value);
  const when = f.signed_at
    ? `Signed ${f.signed_at.slice(0, 10)}`
    : `Started ${f.created_at.slice(0, 10)}`;

  return (
    <View style={!first && { borderTopColor: theme.border, borderTopWidth: 1 }}>
      <Pressable onPress={onToggle} style={({ pressed }) => [{ paddingVertical: 13 }, pressed && { opacity: 0.8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", flex: 1 }} numberOfLines={1}>
            {clientName}
          </Text>
          <Badge label={badge.label} tone={badge.tone} />
        </View>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 3 }} numberOfLines={1}>
          {[artistName, f.placement, when].filter(Boolean).join(" · ")}
        </Text>
      </Pressable>

      {open && (
        <View style={{ paddingBottom: 14, gap: 10 }}>
          {s === "age_flag" && (
            <Text style={{ color: theme.bad, fontSize: 13 }}>
              Date of birth is below the minimum age. Do not proceed without front-desk review.
            </Text>
          )}
          {!!f.medical_flags && (
            <Text style={{ color: theme.warn, fontSize: 13 }}>Medical flags: {f.medical_flags}</Text>
          )}
          {f.signed_name ? (
            <Text style={{ color: theme.textDim, fontSize: 13 }}>Signed name: {f.signed_name}</Text>
          ) : null}

          {canWrite && !f.voided && (
            <>
              {!f.signed_at && f.sign_token && (
                <Button label="Share signing link" onPress={onShare} />
              )}
              {f.signed_at && !f.id_checked && (
                <>
                  <Chips
                    label="ID type"
                    value={idType}
                    options={ID_TYPES.map((t) => t.value)}
                    display={(v) => ID_TYPES.find((t) => t.value === v)?.label ?? v}
                    onChange={setIdType}
                  />
                  <Button label="Confirm ID checked" onPress={() => onConfirmId(idType)} />
                </>
              )}
              <Button label="Void this form" tone="danger" onPress={onVoid} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function NewForm({
  bookings,
  artists,
  clientName,
  email,
  onDone,
}: {
  bookings: Booking[];
  artists: Named[];
  clientName: (id: string | null) => string;
  email: string | null;
  onDone: () => void;
}) {
  const [bookingId, setBookingId] = useState("walkin");
  const [artistId, setArtistId] = useState("any");
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setErr(null);
    const bk = bookings.find((b) => b.id === bookingId) ?? null;
    const token = newToken();
    const { error } = await supabase.from("consent_forms").insert({
      booking_id: bk?.id ?? null,
      client_id: bk?.client_id ?? null,
      artist_id: artistId === "any" ? bk?.artist_id ?? null : artistId,
      placement: placement.trim() || null,
      sign_token: token,
      created_by: email,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    // Straight to the share sheet — that's the whole point on a phone.
    await Share.share({ message: `${SITE}/intake/${token}` });
    onDone();
  };

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <Card style={{ marginTop: 14 }}>
      <Chips
        label="Booking"
        value={bookingId}
        options={["walkin", ...bookings.map((b) => b.id)]}
        display={(id) => {
          if (id === "walkin") return "Walk-in";
          const bk = bookings.find((b) => b.id === id);
          return bk ? `${timeOf(bk.starts_at)} ${clientName(bk.client_id)}` : id;
        }}
        onChange={setBookingId}
      />
      <Chips
        label="Artist"
        value={artistId}
        options={["any", ...artists.map((a) => a.id)]}
        display={(id) => (id === "any" ? "Any" : artists.find((a) => a.id === id)?.name ?? id)}
        onChange={setArtistId}
      />
      <LabeledInput label="Placement (body area)" value={placement} onChange={setPlacement} placeholder="Left forearm, ribs…" />
      <Button label={busy ? "Starting…" : "Start form + share link"} onPress={start} disabled={busy} />
      {err ? <Text style={{ color: theme.bad, fontSize: 13, marginTop: 8 }}>{err}</Text> : null}
    </Card>
  );
}
