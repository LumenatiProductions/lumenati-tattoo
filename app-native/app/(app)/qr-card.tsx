import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { LumenatiLogo } from "@/components/LumenatiLogo";
import InkWash from "@/components/InkWash";
import { success } from "@/lib/haptics";

// The artist's booking card: a QR straight to their public room (/slug).
// Show the phone at the counter, AirDrop it, or save the QR to Photos and
// drop it on flash sheets and IG stories. The print-ready 4x6 lives in the
// web admin (Artists & Pay > QR card); this is the pocket version.

const SITE = (process.env.EXPO_PUBLIC_API_URL ?? "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");

type Me = { slug: string; name: string; handle: string; color: string };

export default function QrCard() {
  const insets = useSafeAreaInsets();
  const { email } = useAuth();
  const { preview } = usePreview();
  const [me, setMe] = useState<Me | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Hidden hi-res twin of the on-screen QR; toDataURL rasterizes at its size,
  // so the saved PNG is 1080px instead of screen-sized.
  const exportRef = useRef<{ toDataURL: (cb: (b64: string) => void) => void } | null>(null);

  useEffect(() => {
    (async () => {
      let artistId = preview?.artistId ?? null;
      if (!artistId && email) {
        const { data: p } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
        artistId = (p?.artist_id as string | null) ?? null;
      }
      if (!artistId) {
        setMissing(true);
        return;
      }
      const { data: a } = await supabase
        .from("artists")
        .select("slug, name, handle, color")
        .eq("id", artistId)
        .maybeSingle();
      if (a) setMe(a as Me);
      else setMissing(true);
    })();
  }, [email, preview]);

  const url = me ? `${SITE}/${me.slug}` : "";
  const prettyUrl = url.replace(/^https?:\/\//, "");

  const saveOrShare = async () => {
    if (!me || !exportRef.current) return;
    setBusy(true);
    setNote(null);
    exportRef.current.toDataURL(async (b64) => {
      try {
        const dest = `${FileSystem.cacheDirectory}booking-qr-${me.slug}.png`;
        await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
        if (!(await Sharing.isAvailableAsync())) {
          setNote("Sharing isn't available on this device.");
          setBusy(false);
          return;
        }
        await Sharing.shareAsync(dest, { mimeType: "image/png", dialogTitle: "Your booking QR" });
        success();
        setNote("Tip: choose Save Image to drop it in Photos.");
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Could not export the QR.");
      }
      setBusy(false);
    });
  };

  const copyLink = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    success();
    setNote("Link copied.");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Booking card", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <InkWash />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          {missing ? (
            <Card>
              <Text style={styles.empty}>
                No public page is tied to this login yet. The shop can link you on Artists &amp; Pay.
              </Text>
            </Card>
          ) : !me ? (
            <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Card style={[styles.card, { shadowColor: me.color }]}>
                <LumenatiLogo width={44} />
                <Text style={styles.eyebrow}>BOOK WITH</Text>
                <Text style={styles.name}>{me.name}</Text>
                {me.handle ? <Text style={[styles.handle, { color: me.color }]}>@{me.handle}</Text> : null}
                <View style={styles.qrTile}>
                  <QRCode value={url} size={218} color="#0b0b12" backgroundColor="#ffffff" />
                </View>
                <Text style={styles.scan}>Scan to see my work and grab a spot</Text>
                <Text style={styles.url}>{prettyUrl}</Text>
              </Card>

              {/* Off-screen hi-res QR used only for the export. quietZone bakes
                  a white margin into the PNG so it scans anywhere it lands. */}
              <View style={styles.hidden} pointerEvents="none">
                <QRCode
                  value={url}
                  size={1080}
                  quietZone={72}
                  color="#0b0b12"
                  backgroundColor="#ffffff"
                  getRef={(r) => (exportRef.current = r)}
                />
              </View>

              <View style={{ height: 18 }} />
              <Button label={busy ? "Getting it ready…" : "Save or share the QR"} big onPress={saveOrShare} disabled={busy} />
              <View style={{ height: 10 }} />
              <Button label="Copy my booking link" tone="ghost" onPress={copyLink} />
              {note && <Text style={styles.note}>{note}</Text>}
              <Text style={styles.hint}>
                Point a camera at the screen and it books, or save the QR and put it on
                flash sheets, stories, and the mirror by your station.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", paddingVertical: 26 },
  eyebrow: { color: theme.textFaint, fontSize: 11, letterSpacing: 4, fontWeight: "700", marginTop: 16 },
  name: { color: theme.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 4, textAlign: "center" },
  handle: { fontSize: 14, fontWeight: "600", marginTop: 3 },
  qrTile: { backgroundColor: "#ffffff", borderRadius: 16, padding: 16, marginTop: 20 },
  scan: { color: theme.textDim, fontSize: 13.5, fontWeight: "600", marginTop: 16 },
  url: { color: theme.textFaint, fontSize: 12, marginTop: 3, fontVariant: ["tabular-nums"] },
  hidden: { position: "absolute", opacity: 0, left: -10000 },
  note: { color: theme.textDim, fontSize: 13, marginTop: 12, textAlign: "center" },
  hint: { color: theme.textFaint, fontSize: 12.5, marginTop: 14, lineHeight: 18, textAlign: "center" },
  empty: { color: theme.textDim, fontSize: 14.5, lineHeight: 21 },
});
