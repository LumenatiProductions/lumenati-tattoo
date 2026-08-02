import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/lib/appApi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Button, Card, Empty, SectionTitle } from "@/components/ui";
import { tap } from "@/lib/haptics";

// The artist controls the timing + copy of their OWN follow-ups. Each one
// inherits the shop's version until they change it. Reads/writes /api/followups/
// prefs, which resolves code default -> shop -> artist. Owners tune the shop
// defaults on the web; this screen is the artist's personal layer.

type FieldSet = { subject: string; body: string; lead_days: number; enabled: boolean };
type Item = {
  kind: string;
  label: string;
  effective: FieldSet;
  shopDefault: FieldSet;
  overridden: { subject: boolean; body: boolean; lead_days: boolean; enabled: boolean };
};

const isReminder = (k: string) => k === "reminder_48h" || k === "reminder_24h";

// Human timing. Reminders go out BEFORE the visit; the rest AFTER.
function timing(kind: string, days: number): string {
  if (isReminder(kind)) return days === 0 ? "On the day" : `${days} day${days === 1 ? "" : "s"} before`;
  if (days === 0) return "Right after the appointment";
  return `${days} day${days === 1 ? "" : "s"} after`;
}

export default function MyFollowups() {
  const insets = useSafeAreaInsets();
  const { role, email } = useAuth();
  const { preview } = usePreview();
  const isOwner = role === "owner";
  const previewArtist = preview?.artistId ?? null;
  // The owner with no chair open edits the SHOP's own set; otherwise it's a
  // specific artist (the previewed chair, or the signed-in artist's own).
  const shopMode = isOwner && !previewArtist;
  // ownArtist: undefined = still looking up (artists only). Owners don't have one.
  const [ownArtist, setOwnArtist] = useState<string | null | undefined>(isOwner ? null : undefined);
  const targetArtist = previewArtist ?? ownArtist ?? null;

  const [mode, setMode] = useState<"shop" | "artist">(shopMode ? "shop" : "artist");
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) {
      setOwnArtist(null);
      return;
    }
    if (!email) return;
    supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => setOwnArtist((data?.artist_id as string | null) ?? null));
  }, [isOwner, email]);

  const load = useCallback(async () => {
    // Wait for an artist's own-chair lookup; shop mode is ready immediately.
    if (!shopMode && ownArtist === undefined) return;
    const q = shopMode ? "" : `?artistId=${encodeURIComponent(targetArtist ?? "")}`;
    const res = await apiGet<{ mode: "shop" | "artist"; items: Item[] }>(`/api/followups/prefs${q}`);
    // Always set items so it never spins forever; surface the error if any.
    setItems(res.ok ? res.data?.items ?? [] : []);
    if (res.ok) setMode(res.data?.mode ?? (shopMode ? "shop" : "artist"));
    else setMsg(res.error ?? "Could not load follow-ups.");
  }, [shopMode, ownArtist, targetArtist]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openEditor = (it: Item) => {
    tap();
    setMsg(null);
    setOpenKind(it.kind);
    setDraft({ ...it.effective });
  };

  const save = async () => {
    if (!openKind || !draft) return;
    setBusy(true);
    setMsg(null);
    const res = await apiPost("/api/followups/prefs", {
      ...(shopMode ? {} : { artistId: targetArtist }),
      kind: openKind,
      subject: draft.subject,
      body: draft.body,
      lead_days: draft.lead_days,
      enabled: draft.enabled,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not save.");
      return;
    }
    setOpenKind(null);
    setDraft(null);
    await load();
    setMsg("Saved. It's live.");
  };

  const useShopDefault = async (kind: string) => {
    setBusy(true);
    setMsg(null);
    // Clearing = an empty override, which the API deletes so it inherits again
    // (the shop default for an artist, the built-in default for the shop).
    const res = await apiPost("/api/followups/prefs", { ...(shopMode ? {} : { artistId: targetArtist }), kind });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not reset.");
      return;
    }
    setOpenKind(null);
    setDraft(null);
    await load();
    setMsg(shopMode ? "Back to the built-in default." : "Back to the shop's version.");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Follow-ups", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        <Text style={styles.intro}>
          {mode === "shop"
            ? "Your shop's follow-up messages, the defaults every artist starts from. Set the timing and wording, turn any off, and use rebook and birthday to send deals and win-backs."
            : "The messages clients get around a visit. Change the timing or the wording, or leave the shop's version. Turn any of them off for this chair."}
        </Text>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        {!shopMode && ownArtist === undefined ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : items === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Card>
            <Empty>Nothing to manage here yet.</Empty>
          </Card>
        ) : (
          items.map((it) => {
            const anyOverride = Object.values(it.overridden).some(Boolean);
            const editing = openKind === it.kind && draft;
            return (
              <View key={it.kind} style={{ marginBottom: 12 }}>
                <SectionTitle>{it.label}</SectionTitle>
                <Card>
                  {editing ? (
                    <View>
                      <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>Send this follow-up</Text>
                        <Switch
                          value={draft!.enabled}
                          onValueChange={(v) => setDraft({ ...draft!, enabled: v })}
                          trackColor={{ true: "rgba(235,240,255,0.35)", false: "rgba(255,255,255,0.15)" }}
                          thumbColor="#fff"
                        />
                      </View>

                      {draft!.enabled && (
                        <>
                          <Text style={styles.fieldLabel}>Timing</Text>
                          <View style={styles.stepper}>
                            <Pressable
                              onPress={() => setDraft({ ...draft!, lead_days: Math.max(0, draft!.lead_days - 1) })}
                              style={styles.stepBtn}
                            >
                              <Text style={styles.stepBtnText}>−</Text>
                            </Pressable>
                            <Text style={styles.stepValue}>{timing(it.kind, draft!.lead_days)}</Text>
                            <Pressable
                              onPress={() => setDraft({ ...draft!, lead_days: Math.min(120, draft!.lead_days + 1) })}
                              style={styles.stepBtn}
                            >
                              <Text style={styles.stepBtnText}>+</Text>
                            </Pressable>
                          </View>

                          <Text style={styles.fieldLabel}>Message</Text>
                          <TextInput
                            value={draft!.body}
                            onChangeText={(t) => setDraft({ ...draft!, body: t })}
                            multiline
                            style={styles.textarea}
                            placeholder="What your client reads"
                            placeholderTextColor={theme.textFaint}
                          />
                          <Text style={styles.tokenHint}>
                            {"{{first_name}}"} and {"{{shop_name}}"} fill in automatically.
                          </Text>
                        </>
                      )}

                      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Button label={busy ? "Saving…" : "Save my version"} onPress={save} />
                        </View>
                        <Button label="Cancel" tone="ghost" onPress={() => { setOpenKind(null); setDraft(null); }} />
                      </View>
                      {anyOverride && (
                        <Pressable onPress={() => useShopDefault(it.kind)} style={{ marginTop: 12 }}>
                          <Text style={styles.reset}>
                            {mode === "shop" ? "Reset to the built-in default" : "Use the shop's version instead"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Pressable onPress={() => openEditor(it)}>
                      <View style={styles.headRow}>
                        <Text style={[styles.timing, !it.effective.enabled && { color: theme.textFaint }]}>
                          {it.effective.enabled ? timing(it.kind, it.effective.lead_days) : "Off for your chair"}
                        </Text>
                        <Text style={[styles.badge, anyOverride ? styles.badgeMine : styles.badgeShop]}>
                          {anyOverride ? (mode === "shop" ? "Customized" : "Your version") : mode === "shop" ? "Default" : "Shop default"}
                        </Text>
                      </View>
                      {it.effective.enabled && (
                        <Text style={styles.preview} numberOfLines={2}>
                          {it.effective.body}
                        </Text>
                      )}
                      <Text style={styles.editHint}>Tap to change</Text>
                    </Pressable>
                  )}
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  msg: { color: theme.textDim, fontSize: 13, marginBottom: 12 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  timing: { color: theme.text, fontSize: 15, fontWeight: "700" },
  preview: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginTop: 6 },
  editHint: { color: theme.textFaint, fontSize: 12, marginTop: 10 },
  badge: { fontSize: 11, fontWeight: "800", overflow: "hidden", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeMine: { color: theme.brand, backgroundColor: "rgba(255,20,147,0.12)" },
  badgeShop: { color: theme.textFaint, backgroundColor: "rgba(255,255,255,0.06)" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: theme.text, fontSize: 15, fontWeight: "600" },
  fieldLabel: { color: theme.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface },
  stepBtnText: { color: theme.text, fontSize: 22, fontWeight: "700" },
  stepValue: { color: theme.text, fontSize: 15, fontWeight: "600", flex: 1, textAlign: "center" },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text, fontSize: 14, lineHeight: 20, textAlignVertical: "top", backgroundColor: theme.surface },
  tokenHint: { color: theme.textFaint, fontSize: 11.5, marginTop: 8 },
  reset: { color: theme.textDim, fontSize: 13, textDecorationLine: "underline", textAlign: "center" },
});
