import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { success } from "@/lib/haptics";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { KIND_LABEL } from "@/lib/followups-labels";
import { todayLocal } from "@/lib/dates";

// "Client paid cash" at the chair (page-walk note 12). The amount is already
// typed on the register — this confirms which booking (or walk-in), takes the
// tip, and one tap books it honestly: ledger rows, the close-out ritual, and
// (payroll artists) the handoff line — the whole stack goes to the admin,
// wages ride Gusto.

type OpenBooking = { id: string; starts_at: string; client_id: string | null };

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function CashCloseout({
  artistId,
  serviceCents,
  onDone,
}: {
  artistId: string;
  serviceCents: number;
  /** Called after a successful log so the register can reset. */
  onDone: () => void;
}) {
  const [open, setOpen] = useState<OpenBooking[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data: b } = await supabase
        .from("bookings")
        .select("id, starts_at, client_id")
        .eq("artist_id", artistId)
        .eq("status", "scheduled")
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", new Date(dayStart.getTime() + 86_400_000 - 1).toISOString())
        .order("starts_at");
      const rows = (b ?? []) as OpenBooking[];
      setOpen(rows);
      if (rows.length === 1) setBookingId(rows[0].id);
      const ids = rows.map((r) => r.client_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: c } = await supabase.from("clients").select("id, first_name, last_name").in("id", ids);
        setNames(
          new Map(
            ((c ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((r) => [
              r.id,
              `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Client",
            ]),
          ),
        );
      }
    })();
  }, [artistId]);

  const tipCents = Math.max(0, Math.round((Number(tip) || 0) * 100));

  const log = async () => {
    setBusy(true);
    setErr(null);
    const r = await apiPost<{
      holding: number;
      isRenter: boolean;
      queued: string[];
      depositApplied: boolean;
    }>("/api/cash/closeout", { artistId, bookingId, serviceCents, tipCents, date: todayLocal() });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not log the cash.");
      return;
    }
    success();
    const kinds = (r.data.queued ?? []).map((k) => KIND_LABEL[k] ?? k);
    const drip = kinds.length ? ` Drip started: ${kinds.join(", ")}.` : "";
    setDone(
      r.data.isRenter
        ? `Booked ${money(serviceCents + tipCents)} — your money, nothing to hand off.${drip}`
        : `Booked ${money(serviceCents + tipCents)}. You're holding it for the shop — hand the stack to an admin and they'll tap Got it.${drip}`,
    );
  };

  if (done) {
    return (
      <Card style={{ marginTop: 12 }}>
        <Text style={styles.title}>Cash logged</Text>
        <Text style={styles.doneLine}>{done}</Text>
        <View style={{ height: 10 }} />
        <Button label="New payment" tone="ghost" onPress={onDone} />
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={styles.title}>Cash — {money(serviceCents)} service</Text>
      <Text style={styles.sub}>Which appointment was it?</Text>
      <View style={styles.chips}>
        <Chip label="Walk-in" on={bookingId === null} onPress={() => setBookingId(null)} />
        {open.map((bk) => (
          <Chip
            key={bk.id}
            label={`${clock(bk.starts_at)} ${bk.client_id ? names.get(bk.client_id) ?? "Client" : "Walk-in"}`}
            on={bookingId === bk.id}
            onPress={() => setBookingId(bk.id)}
          />
        ))}
      </View>
      <Text style={styles.sub}>Cash tip (optional)</Text>
      <TextInput
        value={tip}
        onChangeText={setTip}
        placeholder="0"
        placeholderTextColor={theme.textFaint}
        keyboardType="numeric"
        style={styles.input}
      />
      <View style={{ height: 10 }} />
      <Button label={busy ? "Logging…" : `Log ${money(serviceCents + tipCents)} cash`} onPress={log} disabled={busy} />
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </Card>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 16, fontWeight: "700" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 8, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderColor: theme.border, borderWidth: 1 },
  chipOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  chipText: { color: theme.textDim, fontSize: 13 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  doneLine: { color: theme.good, fontSize: 14, marginTop: 6, lineHeight: 20 },
  err: { color: theme.bad, fontSize: 13, marginTop: 8 },
});
