import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";

const KINDS = ["tattoo_license", "bbp_cert", "shop_permit", "inspection", "insurance"];
// Status from expiry (matches the web's computeStatus: 30-day window).
function computeStatus(expires: string | null): string {
  if (!expires) return "na";
  const d = Math.round((new Date(`${expires}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (d < 0) return "expired";
  if (d <= 30) return "expiring";
  return "active";
}

type Item = {
  id: string;
  scope: string;
  artist_id: string | null;
  kind: string;
  label: string | null;
  expires_on: string | null;
  status: string;
};

const KIND: Record<string, string> = {
  tattoo_license: "Tattoo license",
  bbp_cert: "BBP certification",
  shop_permit: "Shop permit",
  inspection: "Inspection",
  insurance: "Liability insurance",
};
const TONE: Record<string, string> = { active: theme.good, expiring: theme.warn, expired: "#fb7185", na: theme.textFaint };

function daysNote(expires: string | null, status: string): string {
  if (!expires) return "no expiry";
  const a = Date.now();
  const b = new Date(`${expires.slice(0, 10)}T00:00:00Z`).getTime();
  const d = Math.round((b - a) / 86_400_000);
  if (status === "expired" || d < 0) return `expired ${Math.abs(d)}d ago`;
  return `${d}d left`;
}

// Compliance in the app (POS 6e). Read-only license/permit list, RLS owner-only.
// Expiring/expired float to the top so the owner can renew before a lapse.
export default function Compliance() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const [itemsRes, artistsRes] = await Promise.all([
      supabase
        .from("compliance_items")
        .select("id, scope, artist_id, kind, label, expires_on, status")
        .order("expires_on", { ascending: true, nullsFirst: false }),
      supabase.from("artists").select("id, name").eq("active", true).order("sort"),
    ]);
    setItems((itemsRes.data ?? []) as Item[]);
    const a = (artistsRes.data ?? []) as { id: string; name: string }[];
    setArtists(a);
    setNames(new Map(a.map((x) => [x.id, x.name])));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setItems((p) => p.filter((i) => i.id !== id));
    await supabase.from("compliance_items").delete().eq("id", id);
  };

  const rank = (s: string) => (s === "expired" ? 0 : s === "expiring" ? 1 : 2);
  const sorted = [...items].sort((a, b) => rank(a.status) - rank(b.status));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Compliance", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ marginBottom: 12 }}>
          <Button
            label={adding || editing ? "Cancel" : "Add license / permit"}
            tone={adding || editing ? "ghost" : "brand"}
            onPress={() => {
              setEditing(null);
              setAdding((v) => !v);
            }}
          />
        </View>
        {(adding || editing) && (
          <ComplianceForm
            existing={editing ?? undefined}
            artists={artists}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              load();
            }}
          />
        )}

        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <Card style={{ padding: 0 }}>
            {sorted.length === 0 ? (
              <Text style={styles.empty}>Nothing tracked. Add licenses & permits on the web admin.</Text>
            ) : (
              sorted.map((it, i) => (
                <View key={it.id} style={[styles.row, i > 0 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <Pressable onPress={() => { setAdding(false); setEditing(it); }}>
                      <Text style={styles.name}>{it.label?.trim() || KIND[it.kind] || it.kind}</Text>
                      <Text style={styles.sub}>
                        {it.scope === "artist" && it.artist_id ? `${names.get(it.artist_id) ?? "Artist"} · ` : "Shop · "}
                        {daysNote(it.expires_on, it.status)} · tap to edit
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => remove(it.id)} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.status, { color: TONE[it.status] ?? theme.textDim }]}>{it.status}</Text>
                </View>
              ))
            )}
          </Card>
        )}
        <Text style={styles.note}>Add, edit, and attach scans on the web admin.</Text>
      </ScrollView>
    </>
  );
}

function ComplianceForm({
  existing,
  artists,
  onSaved,
}: {
  existing?: Item;
  artists: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<"artist" | "shop">((existing?.scope as "artist" | "shop") ?? "artist");
  const [artistId, setArtistId] = useState(existing?.artist_id ?? artists[0]?.id ?? "");
  const [kind, setKind] = useState(existing?.kind ?? "tattoo_license");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [expires, setExpires] = useState(existing?.expires_on ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (scope === "artist" && !artistId) {
      setErr("Pick an artist.");
      return;
    }
    if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      setErr("Expiry must be YYYY-MM-DD.");
      return;
    }
    setBusy(true);
    setErr(null);
    const fields = {
      scope,
      artist_id: scope === "artist" ? artistId : null,
      kind,
      label: label.trim() || null,
      expires_on: expires || null,
      status: computeStatus(expires || null),
    };
    const { error } = existing
      ? await supabase.from("compliance_items").update(fields).eq("id", existing.id)
      : await supabase.from("compliance_items").insert(fields);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <Chips label="Scope" value={scope} options={["artist", "shop"] as const} onChange={setScope} />
      {scope === "artist" && artists.length > 0 && (
        <Chips label="Artist" value={artistId} options={artists.map((a) => a.id)} onChange={setArtistId} display={(id) => artists.find((a) => a.id === id)?.name ?? id} />
      )}
      <Chips label="Kind" value={kind} options={KINDS} onChange={setKind} display={(k) => (KIND[k] ?? k)} />
      <LabeledInput label="Label (optional)" value={label} onChange={setLabel} placeholder={KIND[kind]} />
      <LabeledInput label="Expires (YYYY-MM-DD)" value={expires} onChange={setExpires} keyboardType="numeric" placeholder="2027-01-31" />
      {err && <Text style={styles.errText}>{err}</Text>}
      <Button label={busy ? "Saving…" : existing ? "Save changes" : "Save"} onPress={save} disabled={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  errText: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  remove: { color: theme.textFaint, fontSize: 11, marginTop: 4 },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 16 },
});
