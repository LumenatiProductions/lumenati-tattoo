import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { ActionPill, Badge, Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";

const KINDS = ["tattoo_license", "bbp_cert", "shop_permit", "inspection", "insurance"];
const ARTIST_KINDS = ["tattoo_license", "bbp_cert"];
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
  document_url: string | null;
  status: string;
};

const KIND: Record<string, string> = {
  tattoo_license: "Tattoo license",
  bbp_cert: "BBP certification",
  shop_permit: "Shop permit",
  inspection: "Inspection",
  insurance: "Liability insurance",
};

function daysNote(expires: string | null, status: string): string {
  if (!expires) return "no expiry";
  const a = Date.now();
  const b = new Date(`${expires.slice(0, 10)}T00:00:00Z`).getTime();
  const d = Math.round((b - a) / 86_400_000);
  if (status === "expired" || d < 0) return `expired ${Math.abs(d)}d ago`;
  return `${d}d left`;
}

// Compliance in the app. Owners see and manage everything; an artist sees and
// maintains their OWN paperwork — including scanning the physical license with
// the camera, right here (bug 0e1b6cd4). Scans land in the private
// compliance-docs bucket and open via short-lived signed links.
export default function Compliance() {
  const insets = useSafeAreaInsets();
  const { role, email, shopId } = useAuth();
  const isOwner = role === "owner";
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  useEffect(() => {
    if (!email) return;
    supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
  }, [email]);

  const load = useCallback(async () => {
    if (!shopId) return;
    const [itemsRes, artistsRes] = await Promise.all([
      supabase
        .from("compliance_items")
        .select("id, scope, artist_id, kind, label, expires_on, document_url, status")
        .order("expires_on", { ascending: true, nullsFirst: false }),
      supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
    ]);
    setItems((itemsRes.data ?? []) as Item[]);
    const a = (artistsRes.data ?? []) as { id: string; name: string }[];
    setArtists(a);
    setNames(new Map(a.map((x) => [x.id, x.name])));
    setLoading(false);
  }, [shopId]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setItems((p) => p.filter((i) => i.id !== id));
    await supabase.from("compliance_items").delete().eq("id", id);
  };

  // Scans in the private bucket are stored as object paths; older web entries
  // may be full URLs. Signed link for paths, straight open for URLs.
  const viewScan = async (doc: string) => {
    if (doc.startsWith("http")) {
      Linking.openURL(doc);
      return;
    }
    const { data } = await supabase.storage.from("compliance-docs").createSignedUrl(doc, 60 * 10);
    if (data?.signedUrl) Linking.openURL(data.signedUrl);
  };

  const rank = (s: string) => (s === "expired" ? 0 : s === "expiring" ? 1 : 2);
  const sorted = [...items].sort((a, b) => rank(a.status) - rank(b.status));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: isOwner ? "Compliance" : "My license", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ marginBottom: 12 }}>
          <Button
            label={adding || editing ? "Cancel" : isOwner ? "Add license / permit" : "Add my license / cert"}
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
            artists={isOwner ? artists : artists.filter((a) => a.id === myArtistId)}
            lockToArtist={!isOwner}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              load();
            }}
          />
        )}

        {loading ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <Card style={{ padding: 0 }}>
            {sorted.length === 0 ? (
              <>
                <Text style={styles.empty}>
                  {isOwner
                    ? "Nothing tracked yet — add the shop's licenses and permits above."
                    : "Nothing on file yet — add your license and scan it with your camera."}
                </Text>
                {!isOwner && (
                  <View style={styles.mock}>
                    <View style={styles.mockPhoto} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mockHead}>STATE TATTOO LICENSE</Text>
                      <View style={styles.mockLine} />
                      <View style={[styles.mockLine, { width: "55%" }]} />
                      <Text style={styles.mockCap}>Example. Yours appears here once you snap a photo.</Text>
                    </View>
                  </View>
                )}
              </>
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
                    <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
                      {it.document_url ? (
                        <Pressable onPress={() => viewScan(it.document_url!)} hitSlop={8}>
                          <Text style={styles.scanLink}>View scan</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => remove(it.id)} hitSlop={8}>
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Badge label={it.status} tone={it.status === "active" ? "good" : it.status === "expiring" ? "warn" : it.status === "expired" ? "bad" : "neutral"} />
                </View>
              ))
            )}
          </Card>
        )}
        <Text style={styles.note}>
          {isOwner
            ? "Scans attach right here or on the web admin — either way they're saved to the item."
            : "Snap your physical license when you add or edit it — the shop sees it instantly."}
        </Text>
      </ScrollView>
    </>
  );
}

function ComplianceForm({
  existing,
  artists,
  lockToArtist,
  onSaved,
}: {
  existing?: Item;
  artists: { id: string; name: string }[];
  /** Artist self-service: scope pinned to themselves, no shop paperwork. */
  lockToArtist: boolean;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<"artist" | "shop">(
    lockToArtist ? "artist" : ((existing?.scope as "artist" | "shop") ?? "artist"),
  );
  const [artistId, setArtistId] = useState(existing?.artist_id ?? artists[0]?.id ?? "");
  // The roster can land after the form opens; keep the default honest.
  useEffect(() => {
    if (!artistId && artists[0]) setArtistId(artists[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists]);
  const [kind, setKind] = useState(existing?.kind ?? "tattoo_license");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [expires, setExpires] = useState(existing?.expires_on ?? "");
  const [docPath, setDocPath] = useState<string | null>(existing?.document_url ?? null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kinds = lockToArtist ? ARTIST_KINDS : KINDS;

  // Camera or library → private compliance-docs bucket. The scan uploads the
  // moment it's taken; Save then writes its path onto the item.
  const scan = async (fromCamera: boolean) => {
    setErr(null);
    let res: ImagePicker.ImagePickerResult;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setErr("Camera access is off for Lumenati — turn it on in Settings.");
        return;
      }
      res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    }
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setScanBusy(true);
    setDocPreview(asset.uri);
    try {
      const owner = scope === "artist" && artistId ? artistId : "shop";
      const path = `${owner}/${Date.now()}.jpg`;
      const file = await fetch(asset.uri);
      const blob = await file.arrayBuffer();
      const { error } = await supabase.storage.from("compliance-docs").upload(path, blob, {
        contentType: asset.mimeType ?? "image/jpeg",
        upsert: false,
      });
      if (error) {
        setErr(`Scan upload failed: ${error.message}`);
        setDocPreview(null);
        return;
      }
      setDocPath(path);
    } catch {
      setErr("Could not read that photo.");
      setDocPreview(null);
    } finally {
      setScanBusy(false);
    }
  };

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
      document_url: docPath,
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
      {!lockToArtist && <Chips label="Scope" value={scope} options={["artist", "shop"] as const} onChange={setScope} />}
      {scope === "artist" && !lockToArtist && artists.length > 0 && (
        <Chips label="Artist" value={artistId} options={artists.map((a) => a.id)} onChange={setArtistId} display={(id) => artists.find((a) => a.id === id)?.name ?? id} />
      )}
      <Chips label="Kind" value={kind} options={kinds} onChange={setKind} display={(k) => (KIND[k] ?? k)} />
      <LabeledInput label="Label (optional)" value={label} onChange={setLabel} placeholder={KIND[kind]} />
      <LabeledInput label="Expires (YYYY-MM-DD)" value={expires} onChange={setExpires} keyboardType="numeric" placeholder="2027-01-31" />

      <Text style={styles.scanLabel}>Scan</Text>
      {docPreview || docPath ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {docPreview ? (
            <Image source={{ uri: docPreview }} style={styles.scanThumb} />
          ) : (
            <View style={[styles.scanThumb, { alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: theme.textFaint, fontSize: 10 }}>on file</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.scanOn}>{scanBusy ? "Uploading scan…" : "Scan attached"}</Text>
            {!scanBusy && (
              <Pressable onPress={() => { setDocPath(null); setDocPreview(null); }} hitSlop={6}>
                <Text style={styles.remove}>Remove scan</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <ActionPill label="Scan with camera" onPress={() => scan(true)} disabled={scanBusy} />
          <ActionPill label="From photos" onPress={() => scan(false)} disabled={scanBusy} />
        </View>
      )}

      {err && <Text style={styles.errText}>{err}</Text>}
      <Button label={busy ? "Saving…" : existing ? "Save changes" : "Save"} onPress={save} disabled={busy || scanBusy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  errText: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  mock: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: "dashed",
    backgroundColor: theme.surface,
  },
  mockPhoto: { width: 52, height: 66, borderRadius: 6, backgroundColor: theme.surfaceRaised },
  mockHead: { color: theme.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  mockLine: { height: 8, borderRadius: 4, backgroundColor: theme.surfaceRaised, marginTop: 8, width: "80%" },
  mockCap: { color: theme.textFaint, fontSize: 11.5, marginTop: 10 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  remove: { color: theme.textFaint, fontSize: 11, marginTop: 4 },
  scanLink: { color: theme.brand, fontSize: 11, marginTop: 4, fontWeight: "700" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16, lineHeight: 20 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 16, lineHeight: 19 },
  scanLabel: { color: theme.textDim, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  scanThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
  scanOn: { color: theme.good, fontSize: 13.5, fontWeight: "700" },
});
