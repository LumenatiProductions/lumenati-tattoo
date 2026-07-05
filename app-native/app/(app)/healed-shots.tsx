import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { tap, success } from "@/lib/haptics";
import { Card, SectionTitle } from "@/components/ui";

// Healed shots — the content engine. Clients send healed photos through the
// 14-day follow-up; approved ones already land in the artist's portfolio.
// This screen puts them in the artist's pocket: one tap opens the share sheet
// (Instagram, Stories, wherever) with the photo, and the caption is already
// on the clipboard — paste and post.

type Shot = {
  id: string;
  url: string;
  status: string;
  created_at: string;
  artist_id: string | null;
};

const W = Dimensions.get("window").width;
const CELL = (W - 20 * 2 - 12) / 2;

export default function HealedShots() {
  const insets = useSafeAreaInsets();
  const { preview } = usePreview();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [handle, setHandle] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // An artist's RLS already scopes to their own; an owner previewing an
    // artist filters explicitly (owner RLS sees everything).
    let q = supabase
      .from("healed_photos")
      .select("id, url, status, created_at, artist_id")
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(60);
    if (preview) q = q.eq("artist_id", preview.artistId);
    const { data } = await q;
    setShots((data ?? []) as Shot[]);

    // The artist's IG handle feeds the caption.
    const ids = [...new Set(((data ?? []) as Shot[]).map((s) => s.artist_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: a } = await supabase.from("artists").select("handle").eq("id", ids[0]).maybeSingle();
      setHandle((a?.handle as string) ?? "");
    }
  }, [preview]);
  useEffect(() => {
    load();
  }, [load]);

  const caption = () =>
    [
      "Healed and settled.",
      handle ? `Tattoo by @${handle} at Lumenati Tattoo.` : "Done at Lumenati Tattoo.",
      "Book through the link in bio.",
      "#healedtattoo #tattoo #tattooartist",
    ].join(" ");

  const share = async (shot: Shot) => {
    setBusyId(shot.id);
    setNote(null);
    try {
      // Caption first — it's on the clipboard before the share sheet opens.
      await Clipboard.setStringAsync(caption());
      const dest = `${FileSystem.cacheDirectory}healed-${shot.id}.jpg`;
      const { uri } = await FileSystem.downloadAsync(shot.url, dest);
      if (!(await Sharing.isAvailableAsync())) {
        setNote("Sharing isn't available on this device.");
        return;
      }
      success();
      await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: "Share your healed shot" });
      setNote("Caption is on your clipboard — paste it into the post.");
    } catch {
      setNote("Could not load that photo — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const copyCaption = async () => {
    tap();
    await Clipboard.setStringAsync(caption());
    setNote("Caption copied.");
  };

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: "Healed shots", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }}
      />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
      >
        <Text style={styles.lede}>
          Clients send these through the healed-photo follow-up. Approved shots are already in your
          portfolio — tap one to share it to Instagram with the caption ready to paste.
        </Text>
        <Pressable onPress={copyCaption} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.captionLink}>Copy caption only</Text>
        </Pressable>
        {note && <Text style={styles.note}>{note}</Text>}

        {shots === null ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : shots.length === 0 ? (
          <Card style={{ marginTop: 8 }}>
            <Text style={styles.emptyTitle}>No healed shots yet</Text>
            <Text style={styles.emptyBody}>
              Two weeks after an appointment, your client gets a text asking for a healed photo.
              When they send one, it shows up here and (once approved) in your portfolio.
            </Text>
          </Card>
        ) : (
          <>
            <SectionTitle>{shots.length} shot{shots.length === 1 ? "" : "s"}</SectionTitle>
            <View style={styles.grid}>
              {shots.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => share(s)}
                  disabled={busyId === s.id}
                  style={({ pressed }) => [styles.cell, pressed && { opacity: 0.8 }]}
                >
                  <Image source={{ uri: s.url }} style={styles.img} />
                  <View style={styles.cellFoot}>
                    <Text style={[styles.badge, s.status === "approved" ? styles.badgeGood : styles.badgePending]}>
                      {s.status === "approved" ? "in portfolio" : "pending approval"}
                    </Text>
                    {busyId === s.id ? (
                      <ActivityIndicator size="small" color={theme.brand} />
                    ) : (
                      <Text style={styles.shareText}>Share</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  lede: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  captionLink: { color: theme.brand, fontSize: 13.5, fontWeight: "700", marginBottom: 10 },
  note: { color: theme.good, fontSize: 13, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: {
    width: CELL,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  img: { width: "100%", height: CELL, backgroundColor: theme.surfaceRaised },
  cellFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10 },
  badge: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  badgeGood: { color: theme.good },
  badgePending: { color: theme.warn },
  shareText: { color: theme.brand, fontSize: 13, fontWeight: "700" },
  emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyBody: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
});
