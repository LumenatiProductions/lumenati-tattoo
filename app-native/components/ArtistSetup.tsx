import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/appApi";
import { theme } from "@/lib/theme";
import { tap, success } from "@/lib/haptics";
import { Card } from "@/components/ui";

// The phone-side "get set up" card for an artist — the mobile twin of the web
// owner's GetSetUp, but spoken in the first person (this is YOUR page, YOUR
// work, YOUR bank) because an artist sets themselves up on their phone. Self
// retires once every step is done; a Hide sticks it away for good.

const SITE = (process.env.EXPO_PUBLIC_API_URL ?? "https://lumenatitattoo.com").replace(/\/$/, "");
const HIDE_KEY = "lum-artist-setup-hidden";

type Step = {
  key: string;
  done: boolean;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  go: () => void;
  money?: boolean;
};

export default function ArtistSetup({ reloadKey = 0 }: { reloadKey?: number }) {
  const router = useRouter();
  const { email } = useAuth();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true); // assume hidden until we've checked
  const [slug, setSlug] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasWork, setHasWork] = useState(false);
  const [bank, setBank] = useState<{ eligible: boolean; onboarded: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY).then((v) => setHidden(v === "1"));
  }, []);

  const load = useCallback(async () => {
    if (!email) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle();
    const artistId = (profile?.artist_id as string | null) ?? null;
    if (!artistId) {
      setReady(true);
      return;
    }
    const [{ data: artist }, { data: room }, connect] = await Promise.all([
      supabase.from("artists").select("slug").eq("id", artistId).maybeSingle(),
      supabase.from("room_content").select("profile_photo, portfolio, polaroids").eq("artist_id", artistId).maybeSingle(),
      apiGet<{ me: { eligible: boolean; onboarded: boolean } | null }>("/api/connect"),
    ]);
    setSlug((artist?.slug as string | null) ?? null);
    setHasPhoto(!!(room?.profile_photo as string | null));
    const portfolio = ((room?.portfolio as unknown[]) ?? []).length;
    const polaroids = ((room?.polaroids as unknown[]) ?? []).length;
    setHasWork(portfolio + polaroids > 0);
    setBank(connect.data?.me ? { eligible: !!connect.data.me.eligible, onboarded: !!connect.data.me.onboarded } : null);
    setReady(true);
  }, [email]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const hide = () => {
    AsyncStorage.setItem(HIDE_KEY, "1").catch(() => {});
    setHidden(true);
  };

  const copyLink = async () => {
    if (!slug) return;
    await Clipboard.setStringAsync(`${SITE}/${slug}`);
    success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!ready || hidden) return null;

  // Bank step only for renters — payroll artists are paid through the shop, so
  // they have no bank to connect (mirrors the web card's Stripe-gated step).
  const steps: Step[] = [
    ...(bank?.eligible
      ? [
          {
            key: "bank",
            done: bank.onboarded,
            title: "Connect your bank to get paid",
            sub: "Take cards with the money going straight to you. Clients cover the card fee, you keep 100%.",
            icon: "card-outline" as const,
            go: () => router.push("/payouts"),
            money: true,
          },
        ]
      : []),
    {
      key: "photo",
      done: hasPhoto,
      title: "Add your photo",
      sub: "It tops your page so clients know who they're booking.",
      icon: "person-circle-outline",
      go: () => router.push("/room"),
    },
    {
      key: "work",
      done: hasWork,
      title: "Show your work",
      sub: "Fill your page with your best pieces.",
      icon: "images-outline",
      go: () => router.push("/room"),
    },
  ];

  // Nothing left to do (and there was a real page to share) — retire quietly.
  if (steps.every((s) => s.done)) return null;

  return (
    <Card style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>GET SET UP</Text>
        <Pressable onPress={hide} hitSlop={8}>
          <Text style={styles.hide}>Hide</Text>
        </Pressable>
      </View>
      <Text style={styles.lede}>Your page gets better with every step.</Text>

      <View style={styles.steps}>
        {steps.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => {
              tap();
              s.go();
            }}
            style={({ pressed }) => [styles.step, pressed && { backgroundColor: theme.surface }]}
          >
            <View style={[styles.dot, s.done && styles.dotDone]}>
              {s.done ? (
                <Ionicons name="checkmark" size={14} color={theme.good} />
              ) : (
                <Ionicons name={s.icon} size={15} color={s.money ? theme.brand : theme.textDim} />
              )}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, s.done && styles.stepTitleDone]}>{s.title}</Text>
              {!s.done && <Text style={styles.stepSub}>{s.sub}</Text>}
            </View>
            {!s.done && <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />}
          </Pressable>
        ))}
      </View>

      {slug && (
        <Pressable onPress={copyLink} style={({ pressed }) => [styles.share, pressed && { borderColor: theme.borderStrong }]}>
          <Ionicons name={copied ? "checkmark-circle-outline" : "link-outline"} size={16} color={theme.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={styles.shareTitle}>Share your page</Text>
            <Text style={styles.shareUrl} numberOfLines={1}>
              {SITE.replace(/^https?:\/\//, "")}/{slug}
            </Text>
          </View>
          <Text style={styles.shareVerb}>{copied ? "Copied" : "Copy link"}</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginBottom: 4, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: theme.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  hide: { color: theme.textFaint, fontSize: 12, fontWeight: "600" },
  lede: { color: theme.textFaint, fontSize: 12.5, marginTop: 2, marginBottom: 8 },
  steps: { gap: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  dotDone: { borderColor: theme.goodSoft, backgroundColor: theme.goodSoft },
  stepBody: { flex: 1 },
  stepTitle: { color: theme.text, fontSize: 14.5, fontWeight: "700" },
  stepTitleDone: { color: theme.textFaint, textDecorationLine: "line-through", fontWeight: "600" },
  stepSub: { color: theme.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  shareTitle: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  shareUrl: { color: theme.textFaint, fontSize: 11.5, marginTop: 1 },
  shareVerb: { color: theme.textDim, fontSize: 12.5, fontWeight: "700" },
});
