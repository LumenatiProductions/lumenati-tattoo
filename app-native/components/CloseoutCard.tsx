import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { success } from "@/lib/haptics";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui";
import { KIND_LABEL } from "@/lib/followups-labels";

// The close-out moment (page-walk note 8). The payment just landed — confirm
// which booking it was and ONE tap finishes the ritual: booking completed,
// held deposit applied, aftercare drip queued right now. Rendered on the paid
// screens for a specific artist; today's open bookings come through RLS.

type OpenBooking = {
  id: string;
  starts_at: string;
  client_id: string | null;
  deposit_status: string | null;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function CloseoutCard({ artistId }: { artistId: string }) {
  const [open, setOpen] = useState<OpenBooking[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null); // confirmation line
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data: b } = await supabase
        .from("bookings")
        .select("id, starts_at, client_id, deposit_status")
        .eq("artist_id", artistId)
        .eq("status", "scheduled")
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", new Date(dayStart.getTime() + 86_400_000 - 1).toISOString())
        .order("starts_at");
      const rows = (b ?? []) as OpenBooking[];
      setOpen(rows);
      const ids = rows.map((r) => r.client_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: c } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .in("id", ids);
        setNames(
          new Map(
            ((c ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map(
              (r) => [r.id, `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Client"],
            ),
          ),
        );
      }
    })();
  }, [artistId]);

  const closeOut = async (bk: OpenBooking) => {
    setBusyId(bk.id);
    setErr(null);
    const r = await apiPost<{ queued: string[]; depositApplied: boolean; dripNote: string | null }>(
      "/api/bookings/closeout",
      { bookingId: bk.id },
    );
    setBusyId(null);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not close it out, mark it completed on Bookings.");
      return;
    }
    success();
    const kinds = (r.data.queued ?? []).map((k) => KIND_LABEL[k] ?? k);
    setClosed(
      kinds.length
        ? `Done. Drip started: ${kinds.join(", ")}.${r.data.depositApplied ? " Deposit applied." : ""}`
        : `Done.${r.data.dripNote ? ` ${r.data.dripNote}.` : ""}${r.data.depositApplied ? " Deposit applied." : ""}`,
    );
    setOpen((p) => p.filter((x) => x.id !== bk.id));
  };

  if (closed) {
    return (
      <Card style={{ marginTop: 12 }}>
        <Text style={styles.title}>Appointment closed out</Text>
        <Text style={styles.doneLine}>{closed}</Text>
      </Card>
    );
  }
  if (open.length === 0) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={styles.title}>Was this one of today&apos;s appointments?</Text>
      <Text style={styles.sub}>One tap closes it out and starts the aftercare drip.</Text>
      {open.map((bk, i) => (
        <Pressable
          key={bk.id}
          disabled={busyId !== null}
          onPress={() => closeOut(bk)}
          style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.who}>{bk.client_id ? names.get(bk.client_id) ?? "Client" : "Walk-in"}</Text>
            <Text style={styles.when}>
              {clock(bk.starts_at)}
              {bk.deposit_status === "held" ? " · deposit held" : ""}
            </Text>
          </View>
          <Text style={styles.go}>{busyId === bk.id ? "Closing…" : "Close out"}</Text>
        </Pressable>
      ))}
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 16, fontWeight: "700" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 3, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  who: { color: theme.text, fontSize: 15, fontWeight: "600" },
  when: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  go: { color: theme.brand, fontSize: 14, fontWeight: "700" },
  doneLine: { color: theme.good, fontSize: 14, marginTop: 6, lineHeight: 20 },
  err: { color: theme.bad, fontSize: 13, marginTop: 8 },
});
