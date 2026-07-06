import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { findClash } from "@/lib/clash";
import { uid } from "@/lib/ids";
import { success } from "@/lib/haptics";
import { theme } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";
import DateTimeField from "@/components/DateTimeField";

// The rebook prompt at the paid moment. The client just paid and is standing
// there glowing — one button books their next session before they walk out.
// Rendered on the paid/done screens (Tap to Pay + cash log), always for a
// specific artist. Reads/writes ride RLS: an artist sees only their own
// clients (clients_artist_read) and books only themselves
// (bookings_artist_insert); a new walk-in is theirs via clients_artist_insert.

type ClientChip = { id: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Four weeks out is the natural next-session rhythm; the picker is right there
// to move it.
const fourWeeksOut = () => localDate(new Date(Date.now() + 28 * 86_400_000));

export default function RebookCard({ artistId }: { artistId: string }) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientChip[]>([]);
  const [clientId, setClientId] = useState("new"); // a client id, or "new"
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [date, setDate] = useState(fourWeeksOut());
  const [time, setTime] = useState("12:00");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);

  // Who was in the chair? Today's booking for this artist pre-fills the client
  // (checked-in beats merely scheduled) and carries the project name forward.
  // Recent clients fill the rest of the picker; walk-ins land on "Someone new".
  useEffect(() => {
    (async () => {
      const today = localDate(new Date());
      const [{ data: todays }, { data: recent }] = await Promise.all([
        supabase
          .from("bookings")
          .select("client_id, service_desc, checked_in_at, starts_at")
          .eq("artist_id", artistId)
          .gte("starts_at", today)
          .lt("starts_at", localDate(new Date(Date.now() + 86_400_000)))
          .in("status", ["scheduled", "completed"])
          .not("client_id", "is", null)
          .order("checked_in_at", { ascending: false, nullsFirst: false })
          .order("starts_at", { ascending: false })
          .limit(1),
        supabase
          .from("clients")
          .select("id, first_name, last_name")
          .order("last_seen", { ascending: false, nullsFirst: false })
          .limit(6),
      ]);
      const chips = ((recent ?? []) as { id: string; first_name: string; last_name: string }[]).map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim() || "Client",
      }));
      const hit = (todays ?? [])[0] as
        | { client_id: string; service_desc: string }
        | undefined;
      if (hit) {
        if (!chips.some((c) => c.id === hit.client_id)) {
          const { data: c } = await supabase
            .from("clients")
            .select("id, first_name, last_name")
            .eq("id", hit.client_id)
            .maybeSingle();
          if (c) chips.unshift({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || "Client" });
        }
        setClientId(hit.client_id);
        if (hit.service_desc) setService(hit.service_desc);
      } else if (chips[0]) {
        setClientId(chips[0].id);
      }
      setClients(chips);
    })();
  }, [artistId]);

  const book = async () => {
    setErr(null);
    let cid = clientId;
    let name = clients.find((c) => c.id === cid)?.name ?? "";
    if (cid === "new") {
      name = newName.trim();
      if (!name) {
        setErr("Add their name so you know who's coming back.");
        return;
      }
    }
    setBusy(true);
    // A real instant (the web admin writes the same) — a bare local string
    // would be read as UTC by Postgres and land hours off.
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const clash = await findClash(artistId, startsAt, null);
    if (clash) {
      setBusy(false);
      setErr(`You already have a booking at ${clock(clash)} that day. Pick another time.`);
      return;
    }
    if (cid === "new") {
      const [first, ...rest] = name.split(/\s+/);
      cid = `walkin-${uid()}`;
      const { error } = await supabase.from("clients").insert({
        id: cid,
        first_name: first,
        last_name: rest.join(" "),
        phone: newPhone.trim() || null,
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
    const { error } = await supabase.from("bookings").insert({
      id: `bk-${uid()}`,
      artist_id: artistId,
      client_id: cid,
      starts_at: startsAt,
      status: "scheduled",
      service_desc: service.trim(),
      deposit_cents: 0,
      deposit_status: "none",
      source: "manual",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    success();
    setBooked(`${name || "They're"} on the books — ${prettyDay(date)} at ${time}.`);
  };

  if (booked) {
    return (
      <Card style={styles.wrap}>
        <Text style={styles.bookedCheck}>✓</Text>
        <Text style={styles.bookedText}>{booked}</Text>
      </Card>
    );
  }

  if (!open) {
    return (
      <View style={styles.wrap}>
        <Button label="Book their next session" big onPress={() => setOpen(true)} />
        <Text style={styles.hint}>They&apos;re right there — lock in the next one before they walk out.</Text>
      </View>
    );
  }

  return (
    <Card style={styles.wrap}>
      <Text style={styles.title}>Their next session</Text>
      <Chips
        label="Client"
        value={clientId}
        options={[...clients.map((c) => c.id), "new"]}
        display={(id) => (id === "new" ? "Someone new" : clients.find((c) => c.id === id)?.name ?? "Client")}
        onChange={setClientId}
      />
      {clientId === "new" && (
        <>
          <LabeledInput label="Name" value={newName} onChange={setNewName} placeholder="First and last" autoCapitalize="words" />
          <LabeledInput label="Phone (optional)" value={newPhone} onChange={setNewPhone} keyboardType="phone-pad" placeholder="For reminders" />
        </>
      )}
      <DateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
      <LabeledInput label="Session" value={service} onChange={setService} placeholder="e.g. half-sleeve, next pass" />
      {err && <Text style={styles.err}>{err}</Text>}
      <Button label={busy ? "Booking…" : `Book ${prettyDay(date)}`} onPress={book} disabled={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  hint: { color: theme.textFaint, fontSize: 12.5, textAlign: "center", marginTop: 10, lineHeight: 17 },
  title: { color: theme.text, fontSize: 17, fontWeight: "700", marginBottom: 14 },
  err: { color: theme.bad, fontSize: 13, marginBottom: 10 },
  bookedCheck: { color: theme.good, fontSize: 28, textAlign: "center" },
  bookedText: { color: theme.text, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 6, lineHeight: 21 },
});
