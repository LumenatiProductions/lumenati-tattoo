import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Polyline } from "react-native-svg";
import { endStop } from "@/lib/haptics";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost } from "@/lib/appApi";
import { pageAll } from "@/lib/personal";
import { theme, money } from "@/lib/theme";
import { Badge, Card, Empty, SectionTitle, Stat } from "@/components/ui";

// Pay (parity with /admin/payouts, 2026-07-08 rebuild). The shop cuts no
// checks and withholds nothing. Two lists:
//   - Renter pass-through: card sales the shop's reader collected for booth
//     renters — 100% theirs; clearing a row records the hand-off. Rent is
//     billed on its own invoice and never nets in here.
//   - Gusto payroll prep: split artists' wages (share of service + all tips)
//     to type into Gusto; clearing a row records the entry.
// The salaried owner never appears. Statements count sales AFTER each artist's
// settled_through; clearing goes through /api/settlements (Bearer) so the
// receipt email still sends.

type ArtistRow = {
  id: string;
  name: string;
  pay_type: string;
  split_pct: number | string | null;
};
type SaleRow = {
  artist_id: string | null;
  service_cents: number | null;
  tip_cents: number | null;
  method: string | null;
  created_at: string | null;
};
type Statement = {
  artist: ArtistRow;
  kind: "passthrough" | "payroll";
  grossService: number;
  grossTips: number;
  cardService: number;
  cardTips: number;
  shopCut: number;
  due: number; // pass-through held (renters) or Gusto wages (splits)
  spark?: number[]; // last 14 days of daily totals, for the row sparkline
};

function statementFor(artist: ArtistRow, sales: SaleRow[], since: string | undefined): Statement | null {
  if (artist.pay_type === "payroll_salary") return null; // the owner has no statement
  const isRenter = artist.pay_type === "booth_rent";
  const split = isRenter ? 0 : Number(artist.split_pct ?? 0);

  let grossService = 0,
    grossTips = 0,
    cardService = 0,
    cardTips = 0;
  for (const s of sales) {
    if (s.artist_id !== artist.id) continue;
    if (since && (s.created_at ?? "").slice(0, 10) <= since) continue;
    grossService += s.service_cents ?? 0;
    grossTips += s.tip_cents ?? 0;
    if (s.method !== "cash") {
      cardService += s.service_cents ?? 0;
      cardTips += s.tip_cents ?? 0;
    }
  }

  const shopCut = isRenter ? 0 : Math.round(grossService * split);
  return {
    artist,
    kind: isRenter ? "passthrough" : "payroll",
    grossService,
    grossTips,
    cardService,
    cardTips,
    shopCut,
    // Renters: the shop only holds what its reader collected — hand over all
    // of it. Splits: wages = their share of service + all tips.
    due: isRenter ? cardService + cardTips : grossService - shopCut + grossTips,
  };
}

export default function Payouts() {
  const insets = useSafeAreaInsets();
  const { role, email } = useAuth();
  const { preview } = usePreview();
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [settleConfigured, setSettleConfigured] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSettle = (role === "owner") && !preview;

  const load = useCallback(async () => {
    const [{ data: artists }, sales, settle, mine] = await Promise.all([
      supabase.from("artists").select("id, name, pay_type, split_pct").eq("active", true).order("sort"),
      // Statements sum ALL sales after settled_through (all-time before the
      // first settlement) — page, since responses clamp at 1000 rows.
      pageAll<SaleRow>((from, to) =>
        supabase
          // ledger_sales, not the raw Square mirror: cash logged at the chair
          // lands in the ledger and must count toward wages/pass-through.
          .from("ledger_sales")
          .select("artist_id, service_cents, tip_cents, method, created_at")
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      apiGet<{ configured: boolean; settledThrough: Record<string, string> }>("/api/settlements"),
      role === "artist" && email
        ? supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const settledThrough = settle.ok ? settle.data?.settledThrough ?? {} : {};
    setSettleConfigured(settle.ok && settle.data?.configured === true);

    const myArtistId = (mine?.data as { artist_id?: string | null } | null)?.artist_id ?? null;
    // Artists see their own statement; an owner previewing an artist sees that
    // artist's; staff see everyone.
    const scopeTo = role === "artist" ? myArtistId : preview?.artistId ?? null;
    const visible = (artists ?? []).filter((a) => (scopeTo ? a.id === scopeTo : true));

    // Last 14 days of daily totals per artist — the row sparklines.
    const today = new Date();
    const dayIdx = (iso: string) =>
      13 - Math.round((today.getTime() - new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()) / 86400000);
    const sparkBy: Record<string, number[]> = {};
    for (const s of (sales ?? []) as SaleRow[]) {
      if (!s.artist_id || !s.created_at) continue;
      const i = dayIdx(s.created_at);
      if (i < 0 || i > 13) continue;
      (sparkBy[s.artist_id] ??= new Array(14).fill(0))[i] += (s.service_cents ?? 0) + (s.tip_cents ?? 0);
    }

    setStatements(
      visible
        .map((a) => statementFor(a as ArtistRow, (sales ?? []) as SaleRow[], settledThrough[a.id]))
        .filter((st): st is Statement => !!st)
        .map((st) => ({ ...st, spark: sparkBy[st.artist.id] })),
    );
  }, [role, email, preview]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const settle = (st: Statement) => {
    const isRenter = st.kind === "passthrough";
    Alert.alert(
      isRenter ? "Mark passed through" : "Mark entered in Gusto",
      isRenter
        ? `Record that ${money(st.due)} was handed over to ${st.artist.name} and clear their sales through today?`
        : `Record that ${st.artist.name}'s ${money(st.due)} in wages was entered into Gusto through today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isRenter ? "Passed through" : "Entered",
          style: "default",
          onPress: async () => {
            setBusyId(st.artist.id);
            setMsg(null);
            const res = await apiPost<{ receipt?: { sent: boolean; reason?: string } }>("/api/settlements", {
              artistId: st.artist.id,
              amountCents: st.due,
              note: isRenter
                ? `pass-through · card ${money(st.cardService)} svc + ${money(st.cardTips)} tips`
                : `Gusto entry · ${money(st.due)} wages (${money(st.grossService)} svc, shop cut ${money(st.shopCut)}, tips ${money(st.grossTips)})`,
            });
            setBusyId(null);
            if (!res.ok) {
              setMsg(res.error ?? "Could not record that.");
              return;
            }
            setMsg(
              (isRenter
                ? `${st.artist.name}'s sales passed through — clean through today.`
                : `${st.artist.name} entered into Gusto through today.`) +
                (res.data?.receipt?.sent ? " Receipt emailed." : ""),
            );
            load();
          },
        },
      ],
    );
  };

  const renters = (statements ?? []).filter((s) => s.kind === "passthrough" && s.due > 0).sort((a, b) => b.due - a.due);
  const payroll = (statements ?? []).filter((s) => s.kind === "payroll" && s.due > 0).sort((a, b) => b.due - a.due);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Pay", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {statements === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            {role !== "artist" && !preview && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Stat label="Holding for renters" value={money(renters.reduce((a, s) => a + s.due, 0))} hero />
                <Stat label="Gusto wages" value={money(payroll.reduce((a, s) => a + s.due, 0))} />
                <Stat label="Rows to clear" value={String(renters.length + payroll.length)} />
              </View>
            )}

            {msg ? <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 12 }}>{msg}</Text> : null}

            <SectionTitle>Renter pass-through</SectionTitle>
            <Card>
              {renters.length === 0 ? (
                <Empty>Not holding anything for renters.</Empty>
              ) : (
                renters.map((s, i) => (
                  <StatementRow
                    key={s.artist.id}
                    st={s}
                    first={i === 0}
                    busy={busyId === s.artist.id}
                    canSettle={canSettle && settleConfigured}
                    onSettle={() => settle(s)}
                  />
                ))
              )}
            </Card>
            <Text style={styles.note}>
              Card sales collected on the shop&apos;s reader for booth renters — theirs, 100%. Rent
              is billed on its own invoice, never taken out of sales.
            </Text>

            <SectionTitle>Gusto payroll prep</SectionTitle>
            <Card>
              {payroll.length === 0 ? (
                <Empty>Nothing new for payroll.</Empty>
              ) : (
                payroll.map((s, i) => (
                  <StatementRow
                    key={s.artist.id}
                    st={s}
                    first={i === 0}
                    busy={busyId === s.artist.id}
                    canSettle={canSettle && settleConfigured}
                    onSettle={() => settle(s)}
                  />
                ))
              )}
            </Card>
            <Text style={styles.note}>
              The wages number is the artist&apos;s share of service plus all tips. Type it into
              Gusto, run payroll there, then clear the row.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const SETTLE_DRAG = 150; // px of drag that commits a clear

function StatementRow({
  st,
  first,
  busy,
  canSettle,
  onSettle,
}: {
  st: Statement;
  first: boolean;
  busy: boolean;
  canSettle: boolean;
  onSettle: () => void;
}) {
  const isRenter = st.kind === "passthrough";
  const sub = isRenter
    ? `card ${money(st.cardService)} svc + ${money(st.cardTips)} tips`
    : `${money(st.grossService)} svc · shop cut ${money(st.shopCut)} · tips ${money(st.grossTips)}`;

  // Swipe-to-clear (Apple-Card-ish): drag the row right; past the threshold
  // it clunks and commits. Spring back otherwise. Tap still works.
  const tx = useSharedValue(0);
  const commit = () => {
    endStop();
    onSettle();
  };
  const pan = Gesture.Pan()
    .enabled(canSettle && !busy)
    .activeOffsetX(12) // don't steal vertical scrolls
    .onChange((e) => {
      tx.value = Math.max(0, Math.min(e.translationX, SETTLE_DRAG + 30));
    })
    .onEnd(() => {
      if (tx.value >= SETTLE_DRAG) runOnJS(commit)();
      tx.value = withSpring(0, { damping: 16, stiffness: 160 });
    });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, tx.value / SETTLE_DRAG) }));

  const spark = sparkPoints(st.spark, 64, 22);

  return (
    <View style={!first && { borderTopColor: theme.border, borderTopWidth: 1 }}>
      {canSettle && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.settleFill, fillStyle]}>
          <Text style={styles.settleFillText}>{isRenter ? "Passed through" : "In Gusto"}</Text>
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: "row", alignItems: "center", paddingVertical: 13, backgroundColor: theme.surface }, rowStyle]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{st.artist.name}</Text>
            <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 3 }}>{sub}</Text>
          </View>
          {spark && (
            <Svg width={64} height={22} style={{ marginRight: 12 }}>
              <Polyline points={spark} stroke={isRenter ? theme.warn : "rgba(235,240,255,0.55)"} strokeWidth={1.8} fill="none" />
            </Svg>
          )}
          <Pressable
            onPress={canSettle ? onSettle : undefined}
            disabled={!canSettle || busy}
            style={({ pressed }) => [{ alignItems: "flex-end", gap: 8 }, pressed && { opacity: 0.7 }]}
          >
            <Text
              style={{
                color: isRenter ? theme.warn : theme.text,
                fontSize: 17,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {money(st.due)}
            </Text>
            {canSettle && <Badge label={busy ? "Saving…" : "Slide or tap to clear"} tone="brand" />}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Tiny 14-day earnings line, normalized into a w×h box.
function sparkPoints(daily: number[] | undefined, w: number, h: number): string | null {
  if (!daily || daily.length < 2 || daily.every((v) => v === 0)) return null;
  const max = Math.max(...daily, 1);
  return daily.map((v, i) => `${(i / (daily.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
}

const styles = StyleSheet.create({
  settleFill: {
    backgroundColor: theme.goodSoft,
    borderRadius: theme.radius.sm,
    justifyContent: "center",
    paddingLeft: 14,
  },
  settleFillText: { color: theme.good, fontSize: 15, fontWeight: "800" },
  note: { color: theme.textFaint, fontSize: 12, lineHeight: 17, marginTop: 8 },
});
