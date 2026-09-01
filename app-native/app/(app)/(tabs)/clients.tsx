import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Ionicons } from "@expo/vector-icons";
import { Card, Button } from "@/components/ui";
import { LabeledInput } from "@/components/form";
import { uid } from "@/lib/ids";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
};

// Clients in the app (POS 6e). Read-only search, RLS-scoped (staff only; artists
// get an empty list). Tap phone/IG to act.
export default function Clients() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  // Per client: last completed visit + next booked session. That's what an
  // artist wants at a glance, not a phone number (Scott, 2026-09-01).
  const [visits, setVisits] = useState<Record<string, { last?: string; next?: string }>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const load = useCallback(async () => {
    // Page through: the roster is ~900 and search filters CLIENT-side, so a
    // capped pull silently makes older clients unfindable (5k safety stop).
    const all: Client[] = [];
    for (let start = 0; start < 5000; start += 500) {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, email, instagram")
        .order("last_seen", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(start, start + 499);
      all.push(...((data ?? []) as Client[]));
      if (!data || data.length < 500) break;
    }
    setClients(all);
    setLoading(false);
    const nowIso = new Date().toISOString();
    const { data: bk } = await supabase
      .from("bookings")
      .select("client_id, starts_at, status")
      .in("status", ["completed", "scheduled", "held"])
      .not("client_id", "is", null)
      .order("starts_at", { ascending: true });
    const v: Record<string, { last?: string; next?: string }> = {};
    for (const b of (bk ?? []) as { client_id: string; starts_at: string; status: string }[]) {
      const cell = v[b.client_id] ?? {};
      if (b.status === "completed" || (b.status === "scheduled" && b.starts_at < nowIso)) {
        if (!cell.last || b.starts_at > cell.last) cell.last = b.starts_at;
      } else if (b.starts_at >= nowIso && (!cell.next || b.starts_at < cell.next)) {
        cell.next = b.starts_at;
      }
      v[b.client_id] = cell;
    }
    setVisits(v);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.phone ?? ""} ${c.email ?? ""} ${c.instagram ?? ""}`.toLowerCase().includes(t),
    );
  }, [clients, q]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Clients", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ marginBottom: 12 }}>
          <Button
            label={adding || editing ? "Cancel" : "New client"}
            tone={adding || editing ? "ghost" : "brand"}
            onPress={() => {
              setEditing(null);
              setAdding((v) => !v);
            }}
          />
        </View>
        {(adding || editing) && (
          <ClientForm
            existing={editing ?? undefined}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              load();
            }}
          />
        )}

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, phone, IG…"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          style={styles.search}
        />
        {loading ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <Card style={{ padding: 0, marginTop: 14 }}>
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{clients.length ? "No matches." : "No clients yet."}</Text>
            ) : (
              filtered.slice(0, 200).map((c, i) => (
                <View key={c.id} style={[styles.row, i > 0 && styles.border]}>
                  <Pressable style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => { setAdding(false); setEditing(c); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {c.first_name} {c.last_name}
                      </Text>
                      <Text style={styles.sub}>
                        {visits[c.id]?.next || visits[c.id]?.last
                          ? [
                              visits[c.id]?.next ? `Next ${when(visits[c.id]!.next!)}` : null,
                              visits[c.id]?.last ? `Last ${when(visits[c.id]!.last!, true)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : c.phone || c.email || (c.instagram ? `@${c.instagram}` : "no visits yet")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
                  </Pressable>
                  {/* !! matters: a legacy phone of "" would render as a bare
                      text node inside the row View (crashes RN-web's invariant). */}
                  {!!c.phone && (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${c.phone}`)}
                      style={({ pressed }) => [styles.call, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="call-outline" size={16} color={theme.textDim} />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

function ClientForm({ existing, onSaved }: { existing?: Client; onSaved: () => void }) {
  const [first, setFirst] = useState(existing?.first_name ?? "");
  const [last, setLast] = useState(existing?.last_name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [ig, setIg] = useState(existing?.instagram ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!first.trim()) {
      setErr("First name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const fields = {
      first_name: first.trim(),
      last_name: last.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      instagram: ig.trim().replace(/^@/, "") || null,
    };
    const { error } = existing
      ? await supabase.from("clients").update(fields).eq("id", existing.id)
      : await supabase.from("clients").insert({ id: `walkin-${uid()}`, ...fields });
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <LabeledInput label="First name" value={first} onChange={setFirst} autoCapitalize="words" />
      <LabeledInput label="Last name" value={last} onChange={setLast} autoCapitalize="words" />
      <LabeledInput label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" />
      <LabeledInput label="Email" value={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <LabeledInput label="Instagram" value={ig} onChange={setIg} autoCapitalize="none" />
      {err && <Text style={styles.errText}>{err}</Text>}
      <Button label={busy ? "Saving…" : existing ? "Save changes" : "Save client"} onPress={save} disabled={busy} />
    </Card>
  );
}

// "Tue 8, 1 PM" for what's next; "Aug 15" for what's past.
const when = (iso: string, dateOnly = false) =>
  dateOnly
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : new Date(iso).toLocaleString("en-US", { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const styles = StyleSheet.create({
  errText: { color: theme.bad, fontSize: 13, marginBottom: 10 },
  search: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  call: { alignItems: "center", justifyContent: "center", borderColor: theme.border, borderWidth: 1, borderRadius: 999, width: 34, height: 34 },
  callText: { color: theme.text, fontSize: 13, fontWeight: "700" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
});
